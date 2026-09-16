import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/requireAuth';

// PATCH: two-tap fix from the dashboard — amount, category, project, vendor,
// or clearing a needsReview/duplicate flag once a human has checked it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const data: Record<string, any> = {};
  if (typeof body.amount === 'number') data.amount = body.amount;
  if (typeof body.vendor === 'string') data.vendor = body.vendor;
  if (typeof body.note === 'string') data.note = body.note;
  if ('categoryId' in body) data.categoryId = body.categoryId;
  if ('projectId' in body) data.projectId = body.projectId;
  if (typeof body.needsReview === 'boolean') data.needsReview = body.needsReview;
  if (body.clearDuplicateFlag) data.duplicateOfId = null;

  const expense = await prisma.expense.update({
    where: { id: params.id },
    data,
    include: { category: true, project: true, teamMember: true },
  });
  return NextResponse.json({ expense });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  await prisma.expense.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
