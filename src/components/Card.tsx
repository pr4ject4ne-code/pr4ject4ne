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
  /**
   * Opt-in for a card that WRAPS clickable content (a whole-card link, a
   * tappable list row): applies the shared `.cardLift` mechanic from
   * `src/styles/interactions.module.css` — hover lift + glow + amethyst
   * border tint, and a real press — so no page has to hand-roll its own
   * card hover. Leave it off for static content sections; the class declares
   * `cursor: pointer`, so it's a lie on anything that isn't actually
   * clickable end to end.
   */
  interactive?: boolean;
}

export default function Card({
  as: Tag = 'div',
  variant = 'glass',
  interactive = false,
  className = '',
  ...rest
}: CardProps) {
  const variantClass = variant === 'plain' ? styles.plain : styles.glass;
  const classes = [styles.card, variantClass, interactive && styles.interactive, className]
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes} {...rest} />;
}
