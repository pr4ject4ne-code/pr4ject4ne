import { Suspense } from 'react';
import HospitalDashboardClient from './HospitalDashboardClient';

export const metadata = { title: 'Hospital Dashboard', robots: { index: false, follow: false } };

export default function HospitalDashboardPage() {
  return (
    <Suspense fallback={null}>
      <HospitalDashboardClient />
    </Suspense>
  );
}
