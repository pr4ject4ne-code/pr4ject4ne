import HospitalDashboardClient from './HospitalDashboardClient';

export const metadata = { title: 'Hospital Dashboard', robots: { index: false, follow: false } };

export default function HospitalDashboardPage() {
  return <HospitalDashboardClient />;
}
