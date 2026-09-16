import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status'); // optional filter, e.g. "active"
  const projects = await prisma.project.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { startDate: 'desc' },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const { name, client, location } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const existing = await prisma.project.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } });
  if (existing) return NextResponse.json({ project: existing });

  const project = await prisma.project.create({ data: { name: name.trim(), client, location, status: 'active' } });
  return NextResponse.json({ project });
}
