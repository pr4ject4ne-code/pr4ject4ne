'use client';

import { useState } from 'react';
import styles from './StarsInput.module.css';

const SCORES = [1, 2, 3, 4, 5];

interface StarsInputProps {
  /** Currently selected (or, while hovered/focused, previewed) score. */
  value: number;
  onSelect: (score: number) => void;
  disabled?: boolean;
}

/**
 * Interactive 1-5 star picker — the input counterpart to the read-only
 * `Stars` display (same glyph/color tokens, see Stars.module.css, so a
 * filled star always reads the same whether it's static or clickable).
 * Five native `<button type="button">`s: focus/Enter/Space/click all work
 * for free from native button semantics, no extra keyboard wiring needed.
 * Hovering (or keyboard-focusing) star N previews N stars filled without
 * calling `onSelect` — selection only fires on an actual click/activation.
 */
export default function StarsInput({ value, onSelect, disabled = false }: StarsInputProps) {
  const [previewValue, setPreviewValue] = useState<number | null>(null);
  const displayValue = previewValue ?? value;

  return (
    <span className={styles.wrap} onMouseLeave={() => setPreviewValue(null)}>
      {SCORES.map((score) => (
        <button
          key={score}
          type="button"
          className={styles.star}
          aria-label={`Rate ${score} star${score === 1 ? '' : 's'}`}
          aria-pressed={value === score}
          disabled={disabled}
          onMouseEnter={() => setPreviewValue(score)}
          onFocus={() => setPreviewValue(score)}
          onBlur={() => setPreviewValue(null)}
          onClick={() => onSelect(score)}
        >
          <span aria-hidden="true" className={score <= displayValue ? styles.filled : styles.empty}>
            ★
          </span>
        </button>
      ))}
    </span>
  );
}
