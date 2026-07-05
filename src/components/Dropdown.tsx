import { forwardRef, useId } from 'react';
import styles from './Input.module.css';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: DropdownOption[];
  placeholder?: string;
  error?: string;
}

/** Labeled, accessible <select> that reuses the Input field styling. */
const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(function Dropdown(
  { label, options, placeholder, error, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        className={`${styles.input} ${error ? styles.inputError : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
});

export default Dropdown;
