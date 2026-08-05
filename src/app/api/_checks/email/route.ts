import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

// GET: validate Resend SDK initialization (no outgoing email)
// POST: guarded send-test — requires Authorization: Bearer <EMAIL_CHECK_TOKEN>

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: 'RESEND_API_KEY not set' }, { status: 400 });
  }

  try {
    // Lazy-import the SDK (same pattern as src/lib/email.ts)
    const { Resend } = await import('resend');
    // Constructing the client is a lightweight check that the SDK can be loaded.
    // We do not attempt any network request here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const resend = new Resend(apiKey);
    return NextResponse.json({ ok: true, provider: 'resend', initialized: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const token = process.env.EMAIL_CHECK_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, reason: 'EMAIL_CHECK_TOKEN not configured on the server; send-test disabled' },
      { status: 403 },
    );
  }

  const auth = req.headers.get('authorization') || '';
  const [scheme, provided] = auth.split(' ');
  if (scheme !== 'Bearer' || provided !== token) {
    return NextResponse.json({ ok: false, reason: 'invalid authorization' }, { status: 401 });
  }

  let body: { to?: string } | undefined;
  try {
    body = await req.json();
  } catch (_) {
    // allow empty body — will default to owner/test address
  }

  const to = body?.to ?? process.env.EMAIL_CHECK_TARGET ?? 'pr4ject4ne@gmail.com';

  try {
    const result = await sendEmail({
      to,
      subject: 'Racoon Eye — test email',
      text: 'This is a one-time test to verify outbound email configuration for Racoon Eye.',
      html: '<p>This is a one-time test to verify outbound email configuration for <strong>Racoon Eye</strong>.</p>',
    });

    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
