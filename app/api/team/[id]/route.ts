import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendMessage } from '@/lib/telegram';
import { requireAuth } from '@/lib/requireAuth';

// PATCH: two different kinds of change share this route —
//   - status / isAdmin / name: admin actions (approve/block/rename), gated behind login
//   - currentProjectId: self-service "which project am I logging under right now",
//     called by the (unauthenticated) capture page for its own project picker
// so auth is only required when an admin-only field is present.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const touchesAdminFields = 'status' in body || 'name' in body || 'isAdmin' in body;
  if (touchesAdminFields) {
    const authError = await requireAuth(req);
    if (authError) return authError;
  }

  const data: Record<string, any> = {};
  if (body.status) data.status = body.status;
  if (typeof body.name === 'string') data.name = body.name;
  if (typeof body.isAdmin === 'boolean') data.isAdmin = body.isAdmin;
  if ('currentProjectId' in body) data.currentProjectId = body.currentProjectId; // null = General

  const member = await prisma.teamMember.update({ where: { id: params.id }, data });

  if (body.status === 'approved' && member.telegramId) {
    await sendMessage(member.telegramId, `🎉 You're approved! Go ahead and send an expense — voice note, receipt photo, or text.`);
  }

  return NextResponse.json({ member });
}
