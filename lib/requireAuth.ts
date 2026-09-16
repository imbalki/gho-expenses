import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Guards an admin-only API route (approvals, financial exports, per-project
 * money detail) behind the same Supabase login as the dashboard — belt and
 * braces alongside middleware.ts, since API routes can be reached directly.
 * Returns null when the caller is authenticated, or a 401 response to return
 * immediately otherwise. Skipped (returns null) if Supabase auth isn't
 * configured yet, matching middleware.ts's fail-open-in-dev behavior.
 */
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  return null;
}
