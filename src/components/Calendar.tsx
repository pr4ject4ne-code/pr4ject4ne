'use client';

import { useState } from 'react';
import styles from './Calendar.module.css';

/** Plain month-view calendar (no queue/booking logic for v1). */
export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<number | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className={styles.label}>{label}</h3>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className={styles.grid} role="grid" aria-label={`Calendar for ${label}`}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className={styles.weekday} role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`e${i}`} className={styles.empty} />
          ) : (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={`${styles.day} ${selected === d ? styles.selected : ''} ${
                isThisMonth && today.getDate() === d ? styles.today : ''
              }`}
              onClick={() => setSelected(d)}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
