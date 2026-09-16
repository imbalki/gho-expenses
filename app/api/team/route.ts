import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { notifyAdmins } from '@/lib/team';

// GET: list team members (used by the dashboard to show/approve people, and
// by the capture page to let someone pick "who are you" without a login).
export async function GET() {
  const members = await prisma.teamMember.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ members });
}

// POST: find-or-create a web-channel team member by name (no login — the
// capture page just remembers the chosen name locally). New members start
// 'pending' just like Telegram, so a shared link can't silently pollute data.
export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const trimmed = name.trim();

  let member = await prisma.teamMember.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' }, telegramId: null } });
  if (!member) {
    const isFirstEver = (await prisma.teamMember.count()) === 0;
    member = await prisma.teamMember.create({
      data: { name: trimmed, status: isFirstEver ? 'approved' : 'pending', isAdmin: isFirstEver },
    });
    if (!isFirstEver) {
      await notifyAdmins(
        `👤 New request to use the web capture page: <b>${member.name}</b>.\nApprove them from the dashboard's Team tab.`
      );
    }
  }

  return NextResponse.json({ member });
}
