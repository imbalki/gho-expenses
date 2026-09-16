import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// Server-side Supabase client using the SERVICE ROLE key — this file must
// never be imported into client-side ('use client') components, only into
// API routes / server components, since the service role key bypasses
// row-level security.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'receipts';

/**
 * Uploads a captured file (receipt photo or voice note) to Supabase Storage
 * and returns its public-ish URL. Originals are kept for accounting/audit —
 * see the RawCapture.mediaUrl / Expense trail.
 */
export async function uploadCaptureMedia(
  buffer: Buffer,
  opts: { extension: string; contentType: string; channel: string }
): Promise<string | null> {
  if (!supabaseAdmin) {
    console.warn('Supabase Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing) — skipping media retention.');
    return null;
  }

  const path = `${opts.channel}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${opts.extension}`;

  const { error } = await supabaseAdmin.storage.from(RECEIPTS_BUCKET).upload(path, buffer, {
    contentType: opts.contentType,
    upsert: false,
  });

  if (error) {
    console.error('Failed to upload capture media to Supabase Storage:', error.message);
    return null;
  }

  const { data } = supabaseAdmin.storage.from(RECEIPTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
