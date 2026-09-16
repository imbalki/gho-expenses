import { createBrowserClient } from '@supabase/ssr';

// Client-side Supabase client using the public anon key — safe to expose to
// the browser (used only for logging in via magic link).
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
