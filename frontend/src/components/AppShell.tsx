import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
}

/** Persistent top header + left sidebar + main workspace grid. */
export function AppShell({ header, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>{header}</header>
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
