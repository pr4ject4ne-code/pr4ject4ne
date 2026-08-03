import { forwardRef, useId, useState } from 'react';
import { useKeyboardSafeFocus } from '@/lib/useKeyboardSafeFocus';
import ErrorBubble from './ErrorBubble';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Extra element id(s) to append to aria-describedby, e.g. a live strength checklist. */
  describedBy?: string;
}

/** Labeled text input with accessible error wiring. */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, describedBy, id, className = '', type, onFocus, onBlur, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  // Peek/show toggle for password fields (founder ask, 2026-07-29) — every
  // password input in the app goes through this shared component, so adding
  // it here covers login, signup, reset-password, change-password, and the
  // IHN-regenerate confirm all at once.
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  // Mobile-keyboard safety, wired once here for the whole app: login, signup,
  // biodata, hospital registration, IHN lookup and password reset all render
  // their text fields through this component, so they all get "the field I am
  // typing in stays on screen when the keyboard opens" from this one place
  // instead of per-form wiring. Default-on rather than opt-in — no field in
  // the app wants the opposite — and no opt-out prop, because the only case
  // that would need one (a field inside a fixed/sticky container, e.g. the
  // email field in SuggestionTab's Modal) is already skipped by
  // keepFocusedElementVisible's own ancestor walk.
  const keyboardSafe = useKeyboardSafeFocus<HTMLInputElement>();

  // Composed, not clobbered: a caller's own onFocus/onBlur (validation-on-blur
  // and the like) still runs, after the scroll wiring.
  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    keyboardSafe.onFocus(e);
    onFocus?.(e);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    keyboardSafe.onBlur();
    onBlur?.(e);
  }

  const input = (
    <input
      ref={ref}
      id={inputId}
      type={isPassword ? (revealed ? 'text' : 'password') : type}
      className={`${styles.input} ${error ? styles.inputError : ''} ${isPassword ? styles.inputWithToggle : ''} ${className}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        [error ? errorId : null, hint ? hintId : null, describedBy ?? null]
          .filter(Boolean)
          .join(' ') || undefined
      }
      {...rest}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {isPassword ? (
        <div className={styles.passwordWrap}>
          {input}
          <button
            type="button"
            className={styles.peekToggle}
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : (
        input
      )}
      <ErrorBubble as="span" variant="field" id={errorId} message={error} />
    </div>
  );
});

export default Input;
