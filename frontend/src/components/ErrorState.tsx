import type { ReactNode } from "react";
import styles from "./StateMessage.module.css";

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.error}>
      {children}
    </p>
  );
}
