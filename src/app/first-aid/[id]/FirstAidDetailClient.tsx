'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import FirstAidDetail from '@/components/FirstAidDetail';
import FirstAidDisclaimer from '@/components/FirstAidDisclaimer';
import type { FirstAidEntry } from '@/types';
import styles from './FirstAidDetailPage.module.css';

export default function FirstAidDetailClient({ id }: { id: string }) {
  const [entry, setEntry] = useState<FirstAidEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/first-aid/entries/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found');
        return res.json();
      })
      .then((d) => active && setEntry(d.entry))
      .catch(() => active && setError('Entry not found.'));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <Layout page="first-aid">
      <div className={styles.wrap}>
        <Link href="/first-aid" className={styles.back}>
          ← Back to First Aid
        </Link>
        <FirstAidDisclaimer />
        {error && <h1>{error}</h1>}
        {!error && !entry && <p>Loading…</p>}
        {entry && <FirstAidDetail entry={entry} />}
      </div>
    </Layout>
  );
}
