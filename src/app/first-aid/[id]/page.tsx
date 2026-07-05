import FirstAidDetailClient from './FirstAidDetailClient';

export default function FirstAidEntryPage({ params }: { params: { id: string } }) {
  return <FirstAidDetailClient id={params.id} />;
}
