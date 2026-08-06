import type { CSSProperties, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: ReactNode;
  accent?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, accent, children, className }: CardProps) {
  const style: CSSProperties | undefined = accent ? { borderLeftColor: accent } : undefined;

  return (
    <div className={[styles.card, className].filter(Boolean).join(" ")} style={style}>
      {title && <h3 className={styles.title}>{title}</h3>}
      {children}
    </div>
  );
}
