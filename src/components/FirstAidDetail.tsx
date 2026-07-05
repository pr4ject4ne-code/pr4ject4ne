'use client';

import { useState } from 'react';
import type { FirstAidEntry } from '@/types';
import styles from './FirstAidDetail.module.css';

const SECTIONS: Array<[keyof FirstAidEntry, string]> = [
  ['definition', 'Definition'],
  ['description', 'Description'],
  ['process', 'Process'],
  ['dos', "Do's"],
  ['donts', "Don'ts"],
  ['things_to_look_out_for', 'Things to look out for'],
  ['implications', 'Implications'],
  ['indication', 'Indication'],
  ['contraindications', 'Contraindications'],
];

export default function FirstAidDetail({ entry }: { entry: FirstAidEntry }) {
  const [active, setActive] = useState(0);
  const hasImages = entry.images && entry.images.length > 0;

  return (
    <article className={styles.detail}>
      <span className={styles.category}>{entry.category}</span>
      <h1 className={styles.title}>{entry.title}</h1>

      {hasImages && (
        <div className={styles.gallery}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.images[active]} alt={entry.title} className={styles.hero} />
          {entry.images.length > 1 && (
            <div className={styles.thumbs}>
              {entry.images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  className={i === active ? styles.activeThumb : ''}
                  onClick={() => setActive(i)}
                  aria-label={`Photo ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <dl className={styles.sections}>
        {SECTIONS.map(([key, label]) => {
          const value = entry[key];
          if (typeof value !== 'string' || !value.trim()) return null;
          return (
            <div key={key} className={styles.section}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
