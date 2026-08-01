import Layout from '@/components/Layout';
import ResetPasswordForm from '@/components/ResetPasswordForm';

export const metadata = { title: 'Reset password | Racoon Eye' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Layout page="reset-password">
      <div className="auth-page">
        <ResetPasswordForm token={token ?? ''} />
      </div>
    </Layout>
  );
}
