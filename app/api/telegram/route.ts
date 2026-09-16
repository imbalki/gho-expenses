import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processCapture } from '@/lib/pipeline';
import { sendMessage, downloadTelegramFile, guessMimeFromPath, TelegramUpdate } from '@/lib/telegram';
import {
  findOrCreateByTelegram,
  formatExpenseConfirmation,
  formatActivityConfirmation,
  isApproved,
  PENDING_APPROVAL_MESSAGE,
} from '@/lib/team';

// Telegram calls this URL every time a message is sent to the bot.
// Set it up once with:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-app>.vercel.app/api/telegram"
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update: TelegramUpdate = await req.json();
  const message = update.message;

  try {
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const fromName = message.from?.first_name || message.from?.username || 'there';
    const text = (message.text || message.caption || '').trim();

    if (text.startsWith('/start')) {
      await sendMessage(
        chatId,
        `👋 Hi ${fromName}! Send me a voice note, a photo of a receipt, or just type an expense (e.g. "450 diesel") and I'll log it for you.\n\nTip: use <code>/project [name]</code> to log everything toward a specific site until you type <code>/general</code>.`
      );
      return NextResponse.json({ ok: true });
    }

    const teamMember = await findOrCreateByTelegram(message.from?.id ?? chatId, fromName);

    // --- Admin commands ---
    if (teamMember.isAdmin && text.startsWith('/approve')) {
      const targetId = text.replace('/approve', '').trim();
      const target = await prisma.teamMember.update({
        where: { telegramId: targetId },
        data: { status: 'approved' },
      }).catch(() => null);
      if (target) {
        await sendMessage(chatId, `✅ Approved ${target.name}.`);
        await sendMessage(targetId, `🎉 You're approved! Go ahead and send an expense — voice note, receipt photo, or text.`);
      } else {
        await sendMessage(chatId, `Couldn't find a pending user with id ${targetId}.`);
      }
      return NextResponse.json({ ok: true });
    }

    if (teamMember.isAdmin && text.startsWith('/pending')) {
      const pending = await prisma.teamMember.findMany({ where: { status: 'pending' } });
      if (pending.length === 0) {
        await sendMessage(chatId, 'No one is waiting for approval.');
      } else {
        const lines = pending.map((p) => `• ${p.name} — <code>/approve ${p.telegramId}</code>`).join('\n');
        await sendMessage(chatId, `Waiting for approval:\n${lines}`);
      }
      return NextResponse.json({ ok: true });
    }

    // --- Gate everything else on approval ---
    if (!isApproved(teamMember)) {
      await sendMessage(chatId, PENDING_APPROVAL_MESSAGE);
      return NextResponse.json({ ok: true });
    }

    // --- Project context commands ---
    if (text.startsWith('/general')) {
      await prisma.teamMember.update({ where: { id: teamMember.id }, data: { currentProjectId: null } });
      await sendMessage(chatId, `📍 Back to <b>General</b> expenses.`);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/project')) {
      const name = text.replace('/project', '').trim();
      if (!name) {
        await sendMessage(chatId, `Usage: <code>/project NABARD Roof Coating</code>`);
        return NextResponse.json({ ok: true });
      }
      let project = await prisma.project.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      let created = false;
      if (!project) {
        project = await prisma.project.create({ data: { name, status: 'active' } });
        created = true;
      }
      await prisma.teamMember.update({ where: { id: teamMember.id }, data: { currentProjectId: project.id } });
      await sendMessage(
        chatId,
        `📍 Now logging for <b>${project.name}</b>${created ? ' (new project created)' : ''}.\nEverything you send counts toward this project until you switch or type <code>/general</code>.`
      );
      return NextResponse.json({ ok: true });
    }

    const currentTeamMember = { id: teamMember.id, currentProjectId: teamMember.currentProjectId };

    if (message.voice || message.audio) {
      const fileId = (message.voice || message.audio)!.file_id;
      const { buffer, filePath } = await downloadTelegramFile(fileId);
      const { results } = await processCapture(
        { kind: 'voice', buffer, filename: filePath.split('/').pop() || 'voice.ogg' },
        { channel: 'telegram', teamMember: currentTeamMember, sourceRef: fileId }
      );
      await sendResults(chatId, results);
      return NextResponse.json({ ok: true });
    }

    if (message.photo && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      const { buffer, filePath } = await downloadTelegramFile(largest.file_id);
      const { results } = await processCapture(
        { kind: 'photo', buffer, mimeType: guessMimeFromPath(filePath) },
        { channel: 'telegram', teamMember: currentTeamMember, sourceRef: largest.file_id }
      );
      await sendResults(chatId, results);
      return NextResponse.json({ ok: true });
    }

    if (text) {
      const { results } = await processCapture({ kind: 'text', text }, { channel: 'telegram', teamMember: currentTeamMember });
      await sendResults(chatId, results);
      return NextResponse.json({ ok: true });
    }

    await sendMessage(chatId, `I can read voice notes, receipt photos, or typed text — try one of those!`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    if (message?.chat?.id) {
      await sendMessage(message.chat.id, `😕 ${err?.message || 'Something went wrong logging that — please try again.'}`);
    }
    return NextResponse.json({ ok: true }); // 200 so Telegram doesn't retry forever
  }
}

async function sendResults(chatId: number, results: Awaited<ReturnType<typeof processCapture>>['results']) {
  for (const result of results) {
    if (result.type === 'expense') {
      await sendMessage(chatId, formatExpenseConfirmation(result.expense));
    } else {
      const project = await prisma.project.findUnique({ where: { id: result.activity.projectId } });
      const laborCost = result.expense?.amount ?? null;
      await sendMessage(
        chatId,
        formatActivityConfirmation({
          laborCount: result.activity.laborCount,
          wagePerHead: result.activity.wagePerHead,
          areaCoveredSqft: result.activity.areaCoveredSqft,
          location: result.activity.location,
          note: result.activity.description,
          laborCost,
          project: { name: project?.name || 'General' },
        })
      );
    }
  }
}

// Telegram may also send a GET to verify the endpoint is alive when configuring.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'gho-expense-tracker-telegram-webhook' });
}
