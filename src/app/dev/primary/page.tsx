import DevPrimaryClient from './DevPrimaryClient';

export const metadata = { title: 'Primary Dev Admin', robots: { index: false, follow: false } };

export default function DevPrimaryPage() {
  return <DevPrimaryClient />;
}
