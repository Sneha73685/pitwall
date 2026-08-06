import type { ReactNode } from "react";
import styles from "./StateMessage.module.css";

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
