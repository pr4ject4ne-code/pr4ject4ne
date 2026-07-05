'use client';

import { useState } from 'react';
import type { HospitalPhoto } from '@/types';
import styles from './HospitalGallery.module.css';

const SLOT_LABEL: Record<string, string> = {
  outside_far: 'Outside (far)',
  outside_close: 'Outside (entrance)',
  reception: 'Reception',
  other: 'Gallery',
};

export default function HospitalGallery({ photos }: { photos: HospitalPhoto[] }) {
  const [active, setActive] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <div className={styles.emptyHero} aria-label="No photos available">
        <span aria-hidden="true">🏥</span>
        <p>No photos yet.</p>
      </div>
    );
  }

  const current = photos[active]!;

  return (
    <div className={styles.gallery}>
      <figure className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.caption ?? SLOT_LABEL[current.slot ?? 'other'] ?? ''} />
        {(current.caption || current.slot) && (
          <figcaption className={styles.caption}>
            {current.caption ?? SLOT_LABEL[current.slot ?? 'other']}
          </figcaption>
        )}
      </figure>
      <div className={styles.thumbs} role="tablist" aria-label="Photo thumbnails">
        {photos.map((p, i) => (
          <button
            key={p.url + i}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`${styles.thumb} ${i === active ? styles.active : ''}`}
            onClick={() => setActive(i)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? SLOT_LABEL[p.slot ?? 'other'] ?? `Photo ${i + 1}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
