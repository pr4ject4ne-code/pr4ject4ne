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
  const [tag, setTag] = useState('');
  const [region, setRegion] = useState('');
  const [system, setSystem] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<FirstAidEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (
      nextOffset: number,
      append: boolean,
      cat: FirstAidCategory | '',
      tg: string,
      rg: string,
      sy: string,
      q: string,
    ) => {
      setLoading(true);
      try {
        const qs = buildFirstAidQuery({
          category: cat,
          tag: tg,
          region: rg,
          system: sy,
          q,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
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

  // Reload when a filter (category, tag, region or system) changes; search runs on submit.
  useEffect(() => {
    setOffset(0);
    load(0, false, category, tag, region, system, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, tag, region, system]);

  function runSearch() {
    setOffset(0);
    load(0, false, category, tag, region, system, query);
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
          tag={tag}
          region={region}
          system={system}
          query={query}
          onCategoryChange={setCategory}
          onTagChange={setTag}
          onRegionChange={setRegion}
          onSystemChange={setSystem}
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
                load(next, true, category, tag, region, system, query);
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
