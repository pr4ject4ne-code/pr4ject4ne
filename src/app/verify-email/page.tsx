import Link from 'next/link';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import buttonStyles from '@/components/Button.module.css';
import styles from './VerifyEmail.module.css';

export const metadata = { title: 'Confirm your email — Racoon Eye' };

type Status = 'success' | 'expired' | 'used' | 'invalid' | 'rate_limited';

const COPY: Record<Status, { title: string; body: string }> = {
  success: {
    title: 'Email confirmed',
    body: 'Your email address is now verified. Thanks for confirming!',
  },
  expired: {
    title: 'Link expired',
    body: 'This confirmation link has expired. Sign in and check your account settings to request a new one.',
  },
  used: {
    title: 'Already confirmed',
    body: 'This confirmation link has already been used. If your email is not yet verified, please contact support.',
  },
  invalid: {
    title: 'Invalid link',
    body: 'This confirmation link is not valid. Double-check you copied the full link from your email.',
  },
  rate_limited: {
    title: 'Too many attempts',
    body: 'Too many confirmation attempts from this connection. Please try again in a little while.',
  },
};

function isStatus(value: string | undefined): value is Status {
  return !!value && value in COPY;
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: raw } = await searchParams;
  const status: Status = isStatus(raw) ? raw : 'invalid';
  const copy = COPY[status];

  return (
    <Layout page="verify-email">
      <div className="auth-page">
        <Card className={styles.card}>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.body}>{copy.body}</p>
          <Link href="/dashboard" className={`${buttonStyles.btn} ${buttonStyles.primary}`}>
            Go to dashboard
          </Link>
        </Card>
      </div>
    </Layout>
  );
}
