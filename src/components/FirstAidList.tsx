'use client';

import Link from 'next/link';
import Card from './Card';
import Dropdown from './Dropdown';
import { FIRST_AID_TAGS } from '@/lib/first-aid-tags';
import { REGION_TAGS } from '@/lib/first-aid-region-tags';
import { SYSTEM_TAGS } from '@/lib/first-aid-system-tags';
import { safeHttpUrl } from '@/lib/sanitize';
import type { FirstAidEntry, FirstAidCategory } from '@/types';
import styles from './FirstAidList.module.css';

interface FirstAidListProps {
  entries: FirstAidEntry[];
  category: FirstAidCategory | '';
  tag: string;
  region: string;
  system: string;
  query: string;
  onCategoryChange: (c: FirstAidCategory | '') => void;
  onTagChange: (t: string) => void;
  onRegionChange: (r: string) => void;
  onSystemChange: (s: string) => void;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
}

export default function FirstAidList({
  entries,
  category,
  tag,
  region,
  system,
  query,
  onCategoryChange,
  onTagChange,
  onRegionChange,
  onSystemChange,
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
              className={category === value ? styles.activeTab : styles.tab}
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
          <button type="submit" className={styles.searchButton}>
            Search
          </button>
        </form>
      </div>

      <div className={styles.tagFilter} role="group" aria-label="Filter by topic">
        {FIRST_AID_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag === t}
            className={tag === t ? styles.tagChipOn : styles.tagChip}
            onClick={() => onTagChange(tag === t ? '' : t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Region/system are a secondary anatomical axis on top of the topic
          chip wall above — a single-select Dropdown pair tucked behind a
          disclosure keeps the page from turning into three stacked chip
          walls (mirrors the <details>/<summary> pattern IHNCodeDisplay
          already uses for optional/secondary content). */}
      <details className={styles.moreFilters}>
        <summary className={styles.moreFiltersSummary}>
          More filters{(region || system) ? ' (active)' : ''}
        </summary>
        <div className={styles.moreFiltersBody}>
          <Dropdown
            label="Region"
            placeholder="All regions"
            options={REGION_TAGS.map((r) => ({ value: r, label: r }))}
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
          />
          <Dropdown
            label="System"
            placeholder="All systems"
            options={SYSTEM_TAGS.map((s) => ({ value: s, label: s }))}
            value={system}
            onChange={(e) => onSystemChange(e.target.value)}
          />
        </div>
      </details>

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
                  <Card variant="plain" as="article" interactive className={styles.card}>
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
