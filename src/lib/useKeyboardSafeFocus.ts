'use client';

import { useEffect, useRef } from 'react';
import type { FocusEvent } from 'react';
import { keepFocusedElementVisible } from './keyboardSafeScroll';

/**
 * The focus/blur half of the mobile-keyboard fix — the wiring that turns
 * `keepFocusedElementVisible` (lib/keyboardSafeScroll.ts) into something a
 * component can just spread onto a control.
 *
 * `keepFocusedElementVisible` returns a RELEASE function rather than doing its
 * work and finishing, because the on-screen keyboard opens AFTER focus: the
 * watcher it installs on `visualViewport` has to outlive the focus event
 * itself, and must be torn down on blur AND on unmount (a form that navigates
 * away on submit unmounts while its field is still focused, which would
 * otherwise leak a listener onto the shared, page-lifetime `visualViewport`
 * object). That three-part lifecycle is what this hook owns.
 *
 * Usage — spread onto the control, composing with any handler the component
 * already has:
 *
 *   const keyboardSafe = useKeyboardSafeFocus<HTMLTextAreaElement>();
 *   <textarea {...keyboardSafe} />
 *
 * Controls inside a `position: fixed`/`sticky` ancestor (the site header, a
 * Modal) are skipped by keepFocusedElementVisible itself — scrolling the
 * document cannot move something that rides with the viewport — so callers do
 * NOT need to opt out for those cases; the wiring correctly no-ops.
 *
 * SearchBar.tsx predates this hook and wires the same three steps by hand;
 * both are equivalent, and every NEW call site should use this.
 */
export function useKeyboardSafeFocus<T extends HTMLElement>(): {
  onFocus: (e: FocusEvent<T>) => void;
  onBlur: () => void;
} {
  const release = useRef<(() => void) | null>(null);

  useEffect(() => () => release.current?.(), []);

  return {
    onFocus: (e: FocusEvent<T>) => {
      release.current?.();
      release.current = keepFocusedElementVisible(e.currentTarget);
    },
    onBlur: () => {
      release.current?.();
      release.current = null;
    },
  };
}
