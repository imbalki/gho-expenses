import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic'; // always hit the DB fresh — this is what keeps Supabase's free tier awake

// Hit by Vercel Cron every few days so the query keeps the Supabase free-tier
// project "active" and it doesn't pause itself from inactivity.
export async function GET() {
  const count = await prisma.category.count().catch(() => null);
  return NextResponse.json({ ok: count !== null, categories: count });
}
