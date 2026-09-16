import { prisma } from './db';

const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_AI_BUDGET_USD ?? '5');

/** Records a rough cost estimate for one AI call. Never throws — cost tracking must not break the main flow. */
export async function recordAiUsage(provider: 'openrouter', purpose: 'transcribe' | 'ocr' | 'extract', estCostUsd: number) {
  try {
    await prisma.aiUsageLog.create({ data: { provider, purpose, estCostUsd } });
  } catch (err) {
    console.error('Failed to record AI usage (non-fatal):', err);
  }
}

/**
 * Checks this calendar month's estimated AI spend against MONTHLY_AI_BUDGET_USD
 * (default $5 — plenty for normal use; raise it in your environment variables
 * once you know your real usage). These are rough estimates, not your actual
 * provider bill — check OpenRouter's own dashboard for exact costs.
 */
export async function checkBudget(): Promise<{ withinBudget: boolean; spentUsd: number; budgetUsd: number }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const result = await prisma.aiUsageLog.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { estCostUsd: true },
  });

  const spentUsd = result._sum.estCostUsd ?? 0;
  return { withinBudget: spentUsd < MONTHLY_BUDGET_USD, spentUsd, budgetUsd: MONTHLY_BUDGET_USD };
}
