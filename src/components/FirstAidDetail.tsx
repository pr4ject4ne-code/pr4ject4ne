'use client';

import { useState } from 'react';
import { safeHttpUrl } from '@/lib/sanitize';
import type { FirstAidEntry } from '@/types';
import styles from './FirstAidDetail.module.css';

/**
 * Grouped, headed sections (worklist #33 — "doesn't feel intuitive"). Order
 * follows the item's own suggested flow: signs/symptoms (can I tell this
 * applies?) -> process/procedure -> dos/don'ts -> everything else. Polish
 * pass only — same underlying <dl> per-field rendering as before, just
 * grouped under clear <h2> headings instead of one flat list.
 */
const OVERVIEW_FIELDS: Array<[keyof FirstAidEntry, string]> = [
  ['definition', 'Definition'],
  ['description', 'Description'],
];
const PROCESS_FIELDS: Array<[keyof FirstAidEntry, string]> = [['process', 'Process']];
const DOS_DONTS_FIELDS: Array<[keyof FirstAidEntry, string]> = [
  ['dos', "Do's"],
  ['donts', "Don'ts"],
];
const MORE_FIELDS: Array<[keyof FirstAidEntry, string]> = [
  ['things_to_look_out_for', 'Things to look out for'],
  ['indication', 'Indication'],
  ['contraindications', 'Contraindications'],
  ['implications', 'Implications'],
];

function presentFields(entry: FirstAidEntry, fields: Array<[keyof FirstAidEntry, string]>) {
  return fields.filter(([key]) => {
    const value = entry[key];
    return typeof value === 'string' && value.trim();
  });
}

function FieldList({ entry, fields }: { entry: FirstAidEntry; fields: Array<[keyof FirstAidEntry, string]> }) {
  const present = presentFields(entry, fields);
  if (present.length === 0) return null;
  return (
    <dl className={styles.sections}>
      {present.map(([key, label]) => (
        <div key={key} className={styles.section}>
          <dt>{label}</dt>
          <dd>{entry[key] as string}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A group only renders (heading included) when it has content — an empty
 * "Process" heading with nothing under it would be more confusing, not less
 * (worklist #33's whole point). */
function Group({
  title,
  hint,
  entry,
  fields,
}: {
  title: string;
  hint?: string;
  entry: FirstAidEntry;
  fields: Array<[keyof FirstAidEntry, string]>;
}) {
  if (presentFields(entry, fields).length === 0) return null;
  return (
    <div className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      {hint && <p className={styles.groupHint}>{hint}</p>}
      <FieldList entry={entry} fields={fields} />
    </div>
  );
}

export default function FirstAidDetail({ entry }: { entry: FirstAidEntry }) {
  const [active, setActive] = useState(0);
  // Defense in depth: even though URLs are scheme-validated on write, guard the
  // src sink at render so a stale bad value can never produce a javascript: URL.
  const images = (entry.images ?? []).map((src) => safeHttpUrl(src)).filter((src): src is string => Boolean(src));
  const hasImages = images.length > 0;
  const activeIndex = Math.min(active, images.length - 1);
  const signsSymptoms = entry.signs_symptoms ?? [];

  return (
    <article className={styles.detail}>
      <span className={styles.category}>{entry.category}</span>
      <h1 className={styles.title}>{entry.title}</h1>
      {entry.tags?.length > 0 && (
        <div className={styles.tags}>
          {entry.tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}

      {hasImages && (
        <div className={styles.gallery}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[activeIndex]} alt={entry.title} className={styles.hero} />
          {images.length > 1 && (
            <div className={styles.thumbs}>
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  className={i === activeIndex ? styles.activeThumb : ''}
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

      <Group title="Overview" entry={entry} fields={OVERVIEW_FIELDS} />

      {signsSymptoms.length > 0 && (
        <div className={styles.group}>
          <h2 className={styles.groupTitle}>Signs &amp; symptoms</h2>
          <p className={styles.groupHint}>
            This may apply if you notice any of the following:
          </p>
          <div className={styles.tags}>
            {signsSymptoms.map((s) => (
              <span key={s} className={styles.symptomTag}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <Group title="Process" entry={entry} fields={PROCESS_FIELDS} />
      <Group title="Do's & Don'ts" entry={entry} fields={DOS_DONTS_FIELDS} />
      <Group title="Additional guidance" entry={entry} fields={MORE_FIELDS} />
    </article>
  );
}
