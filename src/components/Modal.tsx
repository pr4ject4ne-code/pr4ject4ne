'use client';

import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Accessible modal dialog: closes on Escape and backdrop click, traps initial focus. */
export default function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus the panel only on the closed->open transition, not on every
  // re-render while open. Bug fix (founder report, 2026-07-28): callers pass
  // an inline `onClose` (a new function every render), and that used to sit
  // in this same effect's deps — so a parent re-render caused by typing in a
  // form field inside the modal (a new keystroke = new state = new inline
  // onClose) re-ran the effect and yanked focus from the field back onto the
  // panel after every character, reading as "retracting on every key tapped."
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="presentation"
      data-testid="modal-backdrop"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
