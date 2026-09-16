import { prisma } from './db';
import { sendMessage } from './telegram';

const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Finds the TeamMember for a Telegram chat, auto-registering first-time senders as 'pending' (or 'approved' if they're a configured admin, or the very first person to ever use the app). */
export async function findOrCreateByTelegram(telegramId: number, displayName: string) {
  const id = String(telegramId);
  const existing = await prisma.teamMember.findUnique({ where: { telegramId: id } });
  if (existing) return existing;

  const isFirstEver = (await prisma.teamMember.count()) === 0;
  const isAdmin = isFirstEver || ADMIN_TELEGRAM_IDS.includes(id);
  const member = await prisma.teamMember.create({
    data: {
      telegramId: id,
      name: displayName || `Telegram user ${id}`,
      status: isAdmin ? 'approved' : 'pending',
      isAdmin,
    },
  });

  if (!isAdmin) {
    await notifyAdmins(
      `👤 New request to use the expense bot: <b>${member.name}</b> (id ${id}).\nReply <code>/approve ${id}</code> to allow them, or ignore to leave them pending.`
    );
  }

  return member;
}

export function isApproved(member: { status: string }) {
  return member.status === 'approved';
}

/** Sends a message to every configured admin (by Telegram id). Safe to call even if none are configured. */
export async function notifyAdmins(text: string) {
  const admins = await prisma.teamMember.findMany({ where: { isAdmin: true, telegramId: { not: null } } });
  for (const admin of admins) {
    if (admin.telegramId) await sendMessage(admin.telegramId, text);
  }
}

/** Resolves which project an entry should be tagged to: an explicit mention in the text wins, otherwise the sender's "sticky" /project context, otherwise null (General). */
export async function resolveProject(projectMention: string | null, teamMember: { currentProjectId: string | null }) {
  if (projectMention) {
    const match = await prisma.project.findFirst({
      where: { name: { equals: projectMention, mode: 'insensitive' } },
    });
    if (match) return match;
  }
  if (teamMember.currentProjectId) {
    return prisma.project.findUnique({ where: { id: teamMember.currentProjectId } });
  }
  return null;
}

export function formatExpenseConfirmation(expense: {
  amount: number;
  currency: string;
  vendor: string | null;
  note: string | null;
  category?: { name: string } | null;
  project?: { name: string } | null;
  needsReview?: boolean;
  duplicateOfId?: string | null;
  confidence: number;
}) {
  const amountStr = `${expense.currency} ${expense.amount.toLocaleString('en-IN')}`;
  const categoryStr = expense.category?.name || 'Uncategorized';
  const vendorStr = expense.vendor ? ` at ${expense.vendor}` : '';
  const projectStr = expense.project?.name ? ` for <b>${expense.project.name}</b>` : '';

  let text = `✅ Logged${projectStr}: <b>${amountStr}</b>${vendorStr}\n📂 ${categoryStr}`;
  if (expense.note) text += `\n📝 ${expense.note}`;

  if (expense.duplicateOfId) {
    text += `\n\n👀 This looks similar to another recent expense — check the dashboard in case it's a repeat.`;
  } else if (expense.needsReview) {
    text += `\n\n⚠️ I wasn't fully sure about this one — please double check it in the dashboard.`;
  }

  return text;
}

export function formatActivityConfirmation(activity: {
  laborCount: number | null;
  wagePerHead: number | null;
  areaCoveredSqft: number | null;
  location: string | null;
  note: string | null;
  laborCost: number | null;
  project: { name: string };
}) {
  let text = `✅ Day logged for <b>${activity.project.name}</b>`;
  if (activity.laborCount) {
    text += `\n👷 ${activity.laborCount} laborer${activity.laborCount === 1 ? '' : 's'}`;
    if (activity.wagePerHead) text += ` × ₹${activity.wagePerHead} → <b>₹${(activity.laborCost ?? 0).toLocaleString('en-IN')}</b> (Staff/Labour)`;
  }
  if (activity.location) text += `\n📍 ${activity.location}`;
  if (activity.note) text += `\n🛠️ ${activity.note}`;
  if (activity.areaCoveredSqft) text += `\n📐 ${activity.areaCoveredSqft.toLocaleString('en-IN')} sqft covered`;
  return text;
}

export const PENDING_APPROVAL_MESSAGE =
  "👋 Thanks! I've noted your request, but an admin needs to approve you before your entries count toward the books. You'll get a message here once you're approved.";
