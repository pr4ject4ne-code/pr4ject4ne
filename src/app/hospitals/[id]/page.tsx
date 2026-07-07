import HospitalProfileClient from './HospitalProfileClient';

export default async function HospitalProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HospitalProfileClient id={id} />;
}
