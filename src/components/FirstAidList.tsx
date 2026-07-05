'use client';

import Link from 'next/link';
import Card from './Card';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAidList.module.css';

interface FirstAidListProps {
  entries: FirstAidEntry[];
  category: FirstAidCategory | '';
  query: string;
  onCategoryChange: (c: FirstAidCategory | '') => void;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
}

export default function FirstAidList({
  entries,
  category,
  query,
  onCategoryChange,
  onQueryChange,
  onSearch,
}: FirstAidListProps) {
  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Category">
          {(
            [
              ['', 'All'],
              ['procedure', 'Procedures'],
              ['technique', 'Techniques'],
            ] as Array<[FirstAidCategory | '', string]>
          ).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              role="tab"
              aria-selected={category === value}
              className={category === value ? styles.activeTab : ''}
              onClick={() => onCategoryChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className={styles.search}
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
          role="search"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search first aid…"
            aria-label="Search first aid"
          />
          <button type="submit">Search</button>
        </form>
      </div>

      {entries.length === 0 ? (
        <p className={styles.empty}>No entries found.</p>
      ) : (
        <ul className={styles.grid}>
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/first-aid/${e.id}`} className={styles.cardLink}>
                <Card as="article" className={styles.card}>
                  {e.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.images[0]} alt="" className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbPlaceholder} aria-hidden="true">
                      ＋
                    </div>
                  )}
                  <div className={styles.cardBody}>
                    <span className={styles.category}>{e.category}</span>
                    <h3 className={styles.title}>{e.title}</h3>
                    {e.definition && <p className={styles.definition}>{e.definition}</p>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
