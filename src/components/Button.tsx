import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    // eslint-disable-next-line react/button-has-type
    <button type={type} className={`${styles.btn} ${styles[variant]} ${className}`} {...rest} />
  );
}
