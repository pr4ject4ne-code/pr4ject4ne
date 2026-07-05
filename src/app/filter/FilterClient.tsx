'use client';

import { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import FilterForm from '@/components/FilterForm';
import ResultsList from '@/components/ResultsList';
import Button from '@/components/Button';
import { fetchFilteredHospitals, type FilterParams } from '@/lib/filter-search';
import type { Hospital } from '@/types';
import styles from './Filter.module.css';

const PAGE_SIZE = 20;

export default function FilterClient() {
  const [filters, setFilters] = useState<FilterParams>({});
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      try {
        const res = await fetchFilteredHospitals({
          ...filters,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setTotal(res.total);
        setHospitals((prev) => (append ? [...prev, ...res.hospitals] : res.hospitals));
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  // Initial load (all approved services).
  useEffect(() => {
    run(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    setOffset(0);
    run(0, false);
  }

  const canLoadMore = hospitals.length < total;

  return (
    <Layout page="filter">
      <div className={styles.wrap}>
        <h1 className={styles.title}>Directory</h1>
        <p className={styles.sub}>
          Search hospitals, clinics, pharmacies, imaging centers and more.
        </p>
        <div className={styles.grid}>
          <aside className={styles.sidebar}>
            <FilterForm value={filters} onChange={setFilters} onSubmit={applyFilters} />
          </aside>
          <section className={styles.results} aria-label="Results">
            <p className={styles.count}>{total} result(s)</p>
            <ResultsList hospitals={hospitals} />
            {canLoadMore && (
              <div className={styles.more}>
                <Button
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    const next = offset + PAGE_SIZE;
                    setOffset(next);
                    run(next, true);
                  }}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
