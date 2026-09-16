import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Handles the magic-link redirect from Supabase Auth and exchanges the code
// for a session cookie, then sends the user on to the dashboard.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = req.nextUrl.searchParams.get('next') || '/dashboard';

  if (code) {
    const res = NextResponse.redirect(new URL(next, req.url));
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
    await supabase.auth.exchangeCodeForSession(code);
    return res;
  }

  return NextResponse.redirect(new URL('/login', req.url));
}
