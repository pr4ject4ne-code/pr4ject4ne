import Layout from '@/components/Layout';
import LoginForm from '@/components/LoginForm';

export const metadata = { title: 'Log in — Racoon Eye' };

export default function LoginPage() {
  return (
    <Layout page="login">
      <div className="page-container">
        <LoginForm />
      </div>
    </Layout>
  );
}
