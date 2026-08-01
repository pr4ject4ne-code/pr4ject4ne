import { forwardRef, useId, useState } from 'react';
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
  { label, error, hint, describedBy, id, className = '', type, ...rest },
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
