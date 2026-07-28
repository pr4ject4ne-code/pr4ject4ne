import Layout from '@/components/Layout';
import HospitalRegisterClient from './HospitalRegisterClient';

export const metadata = { title: 'List your hospital — Racoon Eye' };

export default function HospitalRegisterPage() {
  return (
    <Layout page="hospital-register">
      <HospitalRegisterClient />
    </Layout>
  );
}
