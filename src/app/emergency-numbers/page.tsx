import Layout from '@/components/Layout';
import EmergencyNumbers from '@/components/EmergencyNumbers';

export const metadata = { title: 'Emergency Numbers | Racoon Eye' };

export default function EmergencyNumbersPage() {
  return (
    <Layout page="emergency-numbers">
      <EmergencyNumbers />
    </Layout>
  );
}
