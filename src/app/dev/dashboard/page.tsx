import DevDashboardClient from './DevDashboardClient';

export const metadata = { title: 'Developer Dashboard', robots: { index: false, follow: false } };

export default function DevDashboardPage() {
  return <DevDashboardClient />;
}
