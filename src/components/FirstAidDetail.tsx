'use client';

import { useState } from 'react';
import Card from './Card';
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
        <div key={String(key)} className={styles.section}>
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

function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) return u.pathname.slice(1);
    if (host.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      // sometimes /embed/ID
      const parts = u.pathname.split('/');
      const idx = parts.indexOf('embed');
      if (idx >= 0 && parts.length > idx + 1) {
        const id = parts[idx + 1];
        return id ?? null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

export default function FirstAidDetail({ entry }: { entry: FirstAidEntry }) {
  const [active, setActive] = useState(0);
  // Defense in depth: even though URLs are scheme-validated on write, guard the
  // src sink at render so a stale bad value can never produce a javascript: URL.
  const imageUrls = (entry.images ?? []).map((src) => safeHttpUrl(src)).filter((src): src is string => Boolean(src));
  const media = (entry.media ?? [])
    .map((m) => ({ ...m, safeUrl: safeHttpUrl(m.url) }))
    .filter((m) => m.safeUrl) as Array<{ id?: string; media_type: 'image' | 'video'; url: string; provider?: string; safeUrl: string }>;

  // Combine images (legacy) and media images into a single gallery array for the
  // classic image gallery behavior. Video items are rendered above the gallery.
  const imagesFromMedia = media.filter((m) => m.media_type === 'image').map((m) => m.safeUrl);
  const images = [...imageUrls, ...imagesFromMedia];
  const hasImages = images.length > 0;

  const videoItems = media.filter((m) => m.media_type === 'video');

  const activeIndex = Math.min(active, images.length - 1);
  const signsSymptoms = entry.signs_symptoms ?? [];

  return (
    <Card variant="plain" as="article" className={styles.detail}>
      <span className={styles.category}>{entry.category}</span>
      <h1 className={styles.title}>{entry.title}</h1>

      {entry.tags.length > 0 && (
        <div className={styles.tags}>
          {entry.tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}

      {entry.region_tags.length > 0 && (
        <div className={styles.tags} aria-label="Region">
          {entry.region_tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}

      {entry.system_tags.length > 0 && (
        <div className={styles.tags} aria-label="System">
          {entry.system_tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Render videos first (if any) */}
      {videoItems.length > 0 && (
        <div className={styles.videoStack}>
          {videoItems.map((v, i) => {
            // v.safeUrl is guaranteed by filter above
            const url = v.safeUrl;
            const yt = extractYoutubeId(url);
            if (yt) {
              const embed = `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`;
              return (
                <div key={v.id ?? `video-${i}`} className={styles.videoWrap}>
                  <iframe
                    title={`${entry.title} — video ${i + 1}`}
                    src={embed}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    className={styles.videoIframe}
                  />
                </div>
              );
            }

            // Otherwise treat as a direct video file (mp4/webm/ogg)
            return (
              <div key={v.id ?? `video-${i}`} className={styles.videoWrap}>
                <video controls src={url} className={styles.videoPlayer} />
              </div>
            );
          })}
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
                  className={i === activeIndex ? styles.activeThumb : styles.thumb}
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
    </Card>
  );
}
