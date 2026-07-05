import HospitalProfileClient from './HospitalProfileClient';

export default function HospitalProfilePage({ params }: { params: { id: string } }) {
  return <HospitalProfileClient id={params.id} />;
}
