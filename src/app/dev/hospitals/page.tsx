import DevHospitalsClient from './DevHospitalsClient';

export const metadata = { title: 'Hospitals', robots: { index: false, follow: false } };

export default function DevHospitalsPage() {
  return <DevHospitalsClient />;
}
