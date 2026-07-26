'use client';

import Link from 'next/link';
import Card from './Card';
import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import { safeHttpUrl } from '@/lib/sanitize';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAidList.module.css';

interface FirstAidListProps {
  entries: FirstAidEntry[];
  category: FirstAidCategory | '';
  tag: string;
  query: string;
  onCategoryChange: (c: FirstAidCategory | '') => void;
  onTagChange: (t: string) => void;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
}

export default function FirstAidList({
  entries,
  category,
  tag,
  query,
  onCategoryChange,
  onTagChange,
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

      <div className={styles.tagFilter} role="group" aria-label="Filter by topic">
        {FIRST_AID_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag === t}
            className={tag === t ? `${styles.tagChip} ${styles.tagChipOn}` : styles.tagChip}
            onClick={() => onTagChange(tag === t ? '' : t)}
          >
            {t}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className={styles.empty}>No entries found.</p>
      ) : (
        <ul className={styles.grid}>
          {entries.map((e) => {
            // Defense in depth: even though URLs are scheme-validated on write,
            // guard the src sink at render so a stale bad value can never
            // produce a javascript: URL.
            const thumb = safeHttpUrl(e.images?.[0]);
            return (
              <li key={e.id}>
                <Link href={`/first-aid/${e.id}`} className={styles.cardLink}>
                  <Card variant="plain" as="article" className={styles.card}>
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className={styles.thumb} />
                    )}
                    <div className={styles.cardBody}>
                      <span className={styles.category}>{e.category}</span>
                      <h3 className={styles.title}>{e.title}</h3>
                      {e.definition && <p className={styles.definition}>{e.definition}</p>}
                      {e.tags?.length > 0 && (
                        <div className={styles.cardTags}>
                          {e.tags.map((t) => (
                            <span key={t} className={styles.cardTag}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
