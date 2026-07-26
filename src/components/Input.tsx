import { forwardRef, useId } from 'react';
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
  { label, error, hint, describedBy, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

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
      <input
        ref={ref}
        id={inputId}
        className={`${styles.input} ${error ? styles.inputError : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null, describedBy ?? null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        {...rest}
      />
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
});

export default Input;
