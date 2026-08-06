import type { ReactNode } from "react";
import styles from "./StatusChip.module.css";

export type StatusTone = "positive" | "neutral" | "warning" | "error";

interface StatusChipProps {
  tone: StatusTone;
  children: ReactNode;
}

/** Visual pill wrapping existing text -- never replaces the text it wraps. */
export function StatusChip({ tone, children }: StatusChipProps) {
  return <span className={`${styles.chip} ${styles[tone]}`}>{children}</span>;
}
