import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processCapture } from '@/lib/pipeline';
import { isApproved, PENDING_APPROVAL_MESSAGE } from '@/lib/team';

// Used by the web capture page (and, via the PWA's Android share target, by
// screenshots/photos shared in from WhatsApp, Gallery, or SMS). Accepts:
//   - multipart/form-data with a "photo" or "audio" file, plus "teamMemberId"
//   - application/json { teamMemberId, text }
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  let teamMemberId: string | null = null;
  let input: Parameters<typeof processCapture>[0] | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      teamMemberId = String(form.get('teamMemberId') || '');
      const photo = form.get('photo') as File | null;
      const audio = form.get('audio') as File | null;

      if (photo) {
        const buffer = Buffer.from(await photo.arrayBuffer());
        input = { kind: 'photo', buffer, mimeType: photo.type || 'image/jpeg' };
      } else if (audio) {
        const buffer = Buffer.from(await audio.arrayBuffer());
        input = { kind: 'voice', buffer, filename: audio.name || 'voice.webm' };
      }
    } else {
      const body = await req.json();
      teamMemberId = body.teamMemberId;
      if (body.text) input = { kind: 'text', text: body.text };
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Could not read the upload: ${err?.message || err}` }, { status: 400 });
  }

  if (!teamMemberId) {
    return NextResponse.json({ error: 'teamMemberId is required — pick or enter your name first.' }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: 'No photo, audio, or text provided.' }, { status: 400 });
  }

  const teamMember = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!teamMember) {
    return NextResponse.json({ error: 'Unknown team member — please re-enter your name.' }, { status: 404 });
  }
  if (!isApproved(teamMember)) {
    return NextResponse.json({ error: PENDING_APPROVAL_MESSAGE, pending: true }, { status: 403 });
  }

  try {
    const { results } = await processCapture(input, {
      channel: 'web',
      teamMember: { id: teamMember.id, currentProjectId: teamMember.currentProjectId },
    });
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Something went wrong logging that.' }, { status: 500 });
  }
}
