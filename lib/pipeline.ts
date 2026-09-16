import { prisma } from './db';
import { transcribeAudio, readReceiptImage, extractEntries, COST_ESTIMATES } from './ai';
import { uploadCaptureMedia } from './supabase';
import { recordAiUsage, checkBudget } from './cost';
import { findPossibleDuplicate } from './duplicates';
import { resolveProject } from './team';

export type CaptureInput =
  | { kind: 'voice'; buffer: Buffer; filename: string }
  | { kind: 'photo'; buffer: Buffer; mimeType: string }
  | { kind: 'text'; text: string };

const LOW_CONFIDENCE_THRESHOLD = 0.55;

export type PipelineTeamMember = {
  id: string;
  currentProjectId: string | null;
};

export type PipelineResult =
  | { type: 'expense'; expense: Awaited<ReturnType<typeof prisma.expense.create>> & { category: any; project: any } }
  | { type: 'activity'; activity: any; expense: any | null };

/**
 * The single entry point every channel (Telegram, web capture, email, SMS)
 * should call. Handles: budget check -> transcription/OCR -> AI extraction
 * -> duplicate check -> saving Expense/ActivityLog rows + an audit RawCapture.
 * A single message can produce MULTIPLE results (e.g. two sites logged in one
 * voice note), so this always returns an array.
 */
export async function processCapture(
  input: CaptureInput,
  opts: { channel: 'telegram' | 'web' | 'email' | 'sms'; teamMember: PipelineTeamMember; sourceRef?: string }
): Promise<{ results: PipelineResult[]; rawText: string }> {
  const budget = await checkBudget();
  if (!budget.withinBudget) {
    throw new Error(
      `Processing is paused — this month's AI usage estimate (~$${budget.spentUsd.toFixed(2)}) has reached the configured budget (~$${budget.budgetUsd.toFixed(2)}). Ask your admin to raise MONTHLY_AI_BUDGET_USD.`
    );
  }

  let rawText = '';
  const kindLabel: 'voice' | 'photo' | 'text' = input.kind;
  let mediaUrl: string | null = null;

  try {
    if (input.kind === 'voice') {
      mediaUrl = await uploadCaptureMedia(input.buffer, { extension: 'ogg', contentType: 'audio/ogg', channel: opts.channel });
      rawText = await transcribeAudio(input.buffer, input.filename);
      await recordAiUsage('openrouter', 'transcribe', COST_ESTIMATES.transcribe);
    } else if (input.kind === 'photo') {
      const ext = input.mimeType.split('/')[1] || 'jpg';
      mediaUrl = await uploadCaptureMedia(input.buffer, { extension: ext, contentType: input.mimeType, channel: opts.channel });
      rawText = await readReceiptImage(input.buffer, input.mimeType);
      await recordAiUsage('openrouter', 'ocr', COST_ESTIMATES.ocr);
    } else {
      rawText = input.text;
    }
  } catch (err: any) {
    await prisma.rawCapture.create({
      data: {
        channel: opts.channel,
        kind: kindLabel,
        mediaUrl,
        teamMemberId: opts.teamMember.id,
        sourceRef: opts.sourceRef,
        processedOk: false,
        errorMsg: String(err?.message || err),
      },
    });
    throw new Error(`Could not read this capture: ${err?.message || err}`);
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('Nothing readable was found in that message — please try again with a clearer photo or voice note.');
  }

  const [categories, projects, teamMemberFull] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.project.findMany({ where: { status: 'active' }, select: { name: true } }),
    prisma.teamMember.findUnique({ where: { id: opts.teamMember.id } }),
  ]);
  const currentProject = opts.teamMember.currentProjectId
    ? await prisma.project.findUnique({ where: { id: opts.teamMember.currentProjectId } })
    : null;

  const extraction = await extractEntries(rawText, {
    categories: categories.map((c) => ({ name: c.name, description: c.description })),
    projectNames: projects.map((p) => p.name),
    currentProjectName: currentProject?.name ?? null,
  });
  await recordAiUsage('openrouter', 'extract', COST_ESTIMATES.extract);

  const resolvedProject = await resolveProject(extraction.projectMention, {
    currentProjectId: opts.teamMember.currentProjectId,
  });

  const rawCapture = await prisma.rawCapture.create({
    data: {
      channel: opts.channel,
      kind: kindLabel,
      rawText,
      mediaUrl,
      teamMemberId: opts.teamMember.id,
      sourceRef: opts.sourceRef,
      processedOk: true,
    },
  });

  const results: PipelineResult[] = [];
  // Each of Expense.rawCaptureId and ActivityLog.rawCaptureId is independently
  // unique, so at most one Expense AND at most one ActivityLog (they're
  // different tables) can point back to this same RawCapture — track them
  // separately so a multi-entry message (e.g. two sites in one voice note)
  // still links whichever first expense/activity it produces.
  let expenseLinkAvailable = true;
  let activityLinkAvailable = true;

  for (const entry of extraction.entries) {
    if (entry.type === 'activity') {
      const activityLinkCaptureId = activityLinkAvailable ? rawCapture.id : undefined;
      let linkedExpense = null;
      if (entry.laborCount && entry.wagePerHead && resolvedProject) {
        const staffCategory = categories.find((c) => c.name.toLowerCase().includes('labour') || c.name.toLowerCase().includes('labor'));
        const expenseLinkCaptureId = expenseLinkAvailable ? rawCapture.id : undefined;
        linkedExpense = await prisma.expense.create({
          data: {
            amount: entry.laborCount * entry.wagePerHead,
            note: entry.note || 'Daily labour',
            date: entry.date ? new Date(entry.date) : new Date(),
            categoryId: staffCategory?.id,
            projectId: resolvedProject.id,
            teamMemberId: opts.teamMember.id,
            channel: 'system',
            confidence: entry.confidence,
            rawCaptureId: expenseLinkCaptureId,
          },
        });
        expenseLinkAvailable = false;
      }

      const activity = await prisma.activityLog.create({
        data: {
          projectId: resolvedProject?.id ?? (await ensureUnassignedProjectFallback()),
          date: entry.date ? new Date(entry.date) : new Date(),
          location: entry.location,
          laborCount: entry.laborCount,
          wagePerHead: entry.wagePerHead,
          description: entry.note,
          areaCoveredSqft: entry.areaCoveredSqft,
          teamMemberId: opts.teamMember.id,
          expenseId: linkedExpense?.id,
          rawCaptureId: activityLinkCaptureId,
        },
      });
      activityLinkAvailable = false;

      results.push({ type: 'activity', activity, expense: linkedExpense });
      continue;
    }

    // type === 'expense'
    const matchedCategory = entry.category
      ? categories.find((c) => c.name.toLowerCase() === entry.category!.toLowerCase())
      : null;
    const needsReview = entry.amount === null || entry.confidence < LOW_CONFIDENCE_THRESHOLD;
    const date = entry.date ? new Date(entry.date) : new Date();
    const amount = entry.amount ?? 0;

    const duplicateOfId = amount > 0 ? await findPossibleDuplicate({ amount, projectId: resolvedProject?.id ?? null, date }) : null;
    const expenseLinkCaptureId = expenseLinkAvailable ? rawCapture.id : undefined;

    const expense = await prisma.expense.create({
      data: {
        amount,
        vendor: entry.vendor,
        note: entry.note || rawText.slice(0, 120),
        date,
        categoryId: matchedCategory?.id,
        projectId: resolvedProject?.id,
        teamMemberId: opts.teamMember.id,
        channel: opts.channel,
        confidence: entry.confidence,
        needsReview,
        duplicateOfId,
        rawCaptureId: expenseLinkCaptureId,
      },
      include: { category: true, project: true },
    });
    expenseLinkAvailable = false;

    results.push({ type: 'expense', expense: expense as any });
  }

  return { results, rawText };
}

// If an activity entry somehow has no project (shouldn't normally happen since
// activities only make sense in project context), fall back to a shared
// "Unassigned" project rather than failing the whole capture.
let unassignedProjectId: string | null = null;
async function ensureUnassignedProjectFallback(): Promise<string> {
  if (unassignedProjectId) return unassignedProjectId;
  const existing = await prisma.project.findFirst({ where: { name: 'Unassigned' } });
  if (existing) {
    unassignedProjectId = existing.id;
    return existing.id;
  }
  const created = await prisma.project.create({ data: { name: 'Unassigned', status: 'active' } });
  unassignedProjectId = created.id;
  return created.id;
}
