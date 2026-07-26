import Layout from '@/components/Layout';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export const metadata = { title: 'Forgot password — Racoon Eye' };

export default function ForgotPasswordPage() {
  return (
    <Layout page="forgot-password">
      <div className="auth-page">
        <ForgotPasswordForm />
      </div>
    </Layout>
  );
}
