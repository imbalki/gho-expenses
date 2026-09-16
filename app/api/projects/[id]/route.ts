import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/requireAuth';

// GET: full detail for one project — stats, category breakdown, recent
// activity, and the underlying expense list. Powers the expandable card on
// the Projects page. Admin-only: this exposes real spend figures.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [expenses, activityLogs] = await Promise.all([
    prisma.expense.findMany({
      where: { projectId: project.id },
      include: { category: true, teamMember: true },
      orderBy: { date: 'desc' },
    }),
    prisma.activityLog.findMany({
      where: { projectId: project.id },
      include: { teamMember: true },
      orderBy: { date: 'desc' },
    }),
  ]);

  const distinctDays = new Set(activityLogs.map((a) => a.date.toISOString().slice(0, 10)));
  const laborDays = activityLogs.reduce((sum, a) => sum + (a.laborCount ?? 0), 0);
  const sqftCovered = activityLogs.reduce((sum, a) => sum + (a.areaCoveredSqft ?? 0), 0);
  const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category?.name || 'Uncategorized';
    byCategory.set(key, (byCategory.get(key) ?? 0) + e.amount);
  }
  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    project,
    stats: {
      daysLogged: distinctDays.size,
      laborDays,
      sqftCovered,
      totalSpend,
    },
    categoryBreakdown,
    activityLogs,
    expenses,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, any> = {};
  if (body.status) data.status = body.status;
  if (typeof body.name === 'string') data.name = body.name;
  if (typeof body.client === 'string') data.client = body.client;
  if (typeof body.location === 'string') data.location = body.location;

  const project = await prisma.project.update({ where: { id: params.id }, data });
  return NextResponse.json({ project });
}
