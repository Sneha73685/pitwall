import type { ReactNode } from "react";
import styles from "./StateMessage.module.css";

export function LoadingState({ children }: { children: ReactNode }) {
  return <p className={styles.loading}>{children}</p>;
}
