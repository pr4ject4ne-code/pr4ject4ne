'use client';

import { useEffect, useRef } from 'react';
import { scrollToElement } from '@/lib/scrollToError';
import styles from './ErrorBubble.module.css';

interface ErrorBubbleProps {
  message: string | null | undefined;
  /** 'banner' (default) = page/section-level error, self-scrolls into view.
   * 'field' = compact per-input error (used inside Input.tsx/Dropdown.tsx),
   * never self-scrolls — see the effect comment below for why. */
  variant?: 'banner' | 'field';
  /** Root element tag. Defaults to 'div' for banner, 'span' for field (field
   * bubbles typically live inline after a form control). */
  as?: 'div' | 'span';
  /** Element id, e.g. for a field's aria-describedby wiring from the caller. */
  id?: string;
  className?: string;
}

/** Reusable error surface: tinted bubble with role="alert". `banner` variant
 * (page/section-level errors) self-scrolls into view whenever its message
 * text changes to a new non-empty value — including a second failed submit
 * that swaps one error message for a different one without passing through
 * an intermediate empty state, which a derived boolean (hasError) would miss.
 * `field` variant (per-input errors) never self-scrolls; scrolling to the
 * FIRST invalid field on a validation failure is each form's own job via
 * scrollToFirstInvalidField — if every field bubble scrolled itself,
 * multiple simultaneous field errors would fight over final scroll position. */
export default function ErrorBubble({ message, variant = 'banner', as, id, className = '' }: ErrorBubbleProps) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as ?? (variant === 'field' ? 'span' : 'div');

  useEffect(() => {
    if (variant !== 'banner' || !message) return;
    scrollToElement(ref.current);
  }, [variant, message]);

  if (!message) return null;

  const variantClass = variant === 'field' ? styles.field : styles.banner;

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLSpanElement>}
      id={id}
      role="alert"
      className={`${styles.bubble} ${variantClass} ${className}`}
    >
      {message}
    </Tag>
  );
}
