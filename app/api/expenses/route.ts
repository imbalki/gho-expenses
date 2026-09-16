import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/requireAuth';

// GET /api/expenses?projectId=...&teamMemberId=...&range=today|week|month|all
// Admin-only: this returns real amounts, so it sits behind the dashboard login.
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const projectId = req.nextUrl.searchParams.get('projectId');
  const teamMemberId = req.nextUrl.searchParams.get('teamMemberId');
  const range = req.nextUrl.searchParams.get('range') || 'all';

  const where: any = {};
  if (projectId === 'general') where.projectId = null;
  else if (projectId) where.projectId = projectId;
  if (teamMemberId) where.teamMemberId = teamMemberId;

  if (range !== 'all') {
    const start = new Date();
    if (range === 'today') start.setHours(0, 0, 0, 0);
    if (range === 'week') start.setDate(start.getDate() - 7);
    if (range === 'month') start.setDate(1);
    where.date = { gte: start };
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true, project: true, teamMember: true },
    orderBy: { date: 'desc' },
    take: 300,
  });

  const [categories, projects, teamMembers] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.project.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.teamMember.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return NextResponse.json({ expenses, categories, projects, teamMembers });
}
