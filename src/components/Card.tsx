import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'article' | 'section';
  /**
   * 'glass' (default) = frosted, translucent, backdrop-blurred — reserved
   * for floating chrome per Apple's own liquid-glass guidance (navigation/
   * overlay surfaces that float ABOVE other content), since stacking glass
   * everywhere is exactly why nothing reads distinctly AS glass.
   * 'plain' = an on-theme content-card style (off-white surface, hairline
   * border, token shadow, no blur) for page CONTENT sections that aren't
   * floating over anything — most Card usages across the app are this.
   */
  variant?: 'glass' | 'plain';
}

export default function Card({ as: Tag = 'div', variant = 'glass', className = '', ...rest }: CardProps) {
  const variantClass = variant === 'plain' ? styles.plain : styles.glass;
  return <Tag className={`${styles.card} ${variantClass} ${className}`} {...rest} />;
}
