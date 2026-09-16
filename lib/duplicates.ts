import { prisma } from './db';

const WINDOW_HOURS = 20; // catches "same day, different channel" forwards
const AMOUNT_TOLERANCE = 0.03; // 3% — allows for OCR/rounding noise on the same receipt

/**
 * Looks for a recent expense that is probably the same real-world payment —
 * e.g. someone forwards the same receipt via Telegram and, unsure it went
 * through, uploads it again on the web capture page. Doesn't block the save;
 * just flags it so a human decides in the dashboard.
 */
export async function findPossibleDuplicate(candidate: {
  amount: number;
  projectId: string | null;
  date: Date;
}): Promise<string | null> {
  if (!candidate.amount || candidate.amount <= 0) return null;

  const windowStart = new Date(candidate.date.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(candidate.date.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  const nearby = await prisma.expense.findMany({
    where: {
      projectId: candidate.projectId,
      date: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, amount: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });

  const match = nearby.find((e) => Math.abs(e.amount - candidate.amount) / candidate.amount <= AMOUNT_TOLERANCE);
  return match?.id ?? null;
}
