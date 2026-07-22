'use client';

import { useMemo, useState } from 'react';
import Modal from './Modal';
import { HELP_CONTENT } from '@/lib/help-content';
import styles from './HelpBar.module.css';

/**
 * Footer "Help" entry point: opens a modal panel with detailed instructions
 * organized by function/procedure, filterable by a client-side keyword search.
 */
export default function HelpBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_CONTENT;
    return HELP_CONTENT.filter(
      (entry) =>
        entry.section.toLowerCase().includes(q) ||
        entry.topic.toLowerCase().includes(q) ||
        entry.answer.toLowerCase().includes(q),
    );
  }, [query]);

  const sections = useMemo(() => {
    const order: string[] = [];
    for (const entry of filtered) {
      if (!order.includes(entry.section)) order.push(entry.section);
    }
    return order;
  }, [filtered]);

  return (
    <>
      <button type="button" className={styles.helpLink} onClick={() => setOpen(true)}>
        Help
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Help">
        <div className={styles.searchField}>
          <label htmlFor="help-search" className={styles.searchLabel}>
            Search help topics
          </label>
          <input
            id="help-search"
            type="search"
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. IHN, search, biodata…"
          />
        </div>
        {filtered.length === 0 ? (
          <p className={styles.empty}>No help topics match that search.</p>
        ) : (
          sections.map((section) => (
            <section key={section} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section}</h3>
              {filtered
                .filter((entry) => entry.section === section)
                .map((entry) => (
                  <div key={entry.topic} className={styles.entry}>
                    <h4 className={styles.topic}>{entry.topic}</h4>
                    <p className={styles.answer}>{entry.answer}</p>
                  </div>
                ))}
            </section>
          ))
        )}
      </Modal>
    </>
  );
}
