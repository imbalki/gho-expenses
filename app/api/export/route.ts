import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/requireAuth';

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export?projectId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
// Produces a CSV ready to hand to an accountant — one row per expense,
// including the project, category, person, and channel it came from.
export async function GET(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const projectId = req.nextUrl.searchParams.get('projectId');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  const where: any = {};
  if (projectId === 'general') where.projectId = null;
  else if (projectId) where.projectId = projectId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true, project: true, teamMember: true },
    orderBy: { date: 'asc' },
  });

  const header = ['Date', 'Amount (INR)', 'Vendor', 'Category', 'Project', 'Logged by', 'Channel', 'Needs review', 'Possible duplicate', 'Note'];
  const rows = expenses.map((e) => [
    e.date.toISOString().slice(0, 10),
    e.amount,
    e.vendor || '',
    e.category?.name || 'Uncategorized',
    e.project?.name || 'General',
    e.teamMember?.name || '',
    e.channel,
    e.needsReview ? 'Yes' : '',
    e.duplicateOfId ? 'Yes' : '',
    e.note || '',
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gho-expenses-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
