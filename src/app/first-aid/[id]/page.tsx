import FirstAidDetailClient from './FirstAidDetailClient';

export default async function FirstAidEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FirstAidDetailClient id={id} />;
}
