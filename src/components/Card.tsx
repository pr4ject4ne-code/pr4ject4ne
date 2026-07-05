import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'article' | 'section';
}

export default function Card({ as: Tag = 'div', className = '', ...rest }: CardProps) {
  return <Tag className={`${styles.card} ${className}`} {...rest} />;
}
