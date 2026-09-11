import DevPatientsClient from './DevPatientsClient';

export const metadata = { title: 'Patient accounts', robots: { index: false, follow: false } };

export default function DevPatientsPage() {
  return <DevPatientsClient />;
}
