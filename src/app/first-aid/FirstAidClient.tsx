'use client';

import { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import FirstAidList from '@/components/FirstAidList';
import FirstAidDisclaimer from '@/components/FirstAidDisclaimer';
import Button from '@/components/Button';
import { buildFirstAidQuery } from '@/lib/first-aid-search';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAid.module.css';

const PAGE_SIZE = 12;

export default function FirstAidClient() {
  const [category, setCategory] = useState<FirstAidCategory | ''>('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<FirstAidEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (nextOffset: number, append: boolean, cat: FirstAidCategory | '', q: string) => {
      setLoading(true);
      try {
        const qs = buildFirstAidQuery({ category: cat, q, limit: PAGE_SIZE, offset: nextOffset });
        const res = await fetch(`/api/first-aid/entries?${qs}`);
        const data = await res.json();
        setTotal(data.total ?? 0);
        setEntries((prev) => (append ? [...prev, ...(data.entries ?? [])] : (data.entries ?? [])));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(0, false, category, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function runSearch() {
    setOffset(0);
    load(0, false, category, query);
  }

  const canLoadMore = entries.length < total;

  return (
    <Layout page="first-aid">
      <div className={styles.wrap}>
        <h1 className={styles.title}>First Aid</h1>
        <FirstAidDisclaimer />
        <FirstAidList
          entries={entries}
          category={category}
          query={query}
          onCategoryChange={setCategory}
          onQueryChange={setQuery}
          onSearch={runSearch}
        />
        {canLoadMore && (
          <div className={styles.more}>
            <Button
              variant="ghost"
              disabled={loading}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                load(next, true, category, query);
              }}
            >
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
