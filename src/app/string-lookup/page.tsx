import { Suspense } from 'react';
import Layout from '@/components/Layout';
import StringLookupClient from '@/components/StringLookupClient';

export const metadata = { title: 'Find by IHN — Racoon Eye' };

export default function StringLookupPage() {
  return (
    <Layout page="string-lookup">
      <Suspense fallback={null}>
        <StringLookupClient />
      </Suspense>
    </Layout>
  );
}
