import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Protects the dashboard/projects pages + export API with a Supabase login,
// so someone finding the app's URL can't see your business's expense data.
// If NEXT_PUBLIC_SUPABASE_URL isn't configured yet (e.g. first local run
// before Supabase is set up), auth is skipped rather than locking you out.
export async function middleware(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => res.cookies.set({ name, value, ...options }),
        remove: (name: string, options: any) => res.cookies.set({ name, value: '', ...options }),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

// The dashboard page itself is gated here; the sensitive API routes it calls
// (expenses, export, per-project financials, team approvals) each check
// requireAuth() individually too — see lib/requireAuth.ts — since API routes
// can be hit directly and shouldn't rely on middleware glob-matching alone.
export const config = {
  matcher: ['/dashboard/:path*'],
};
