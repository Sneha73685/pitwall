import styles from "./SkeletonBlock.module.css";

interface SkeletonBlockProps {
  height?: number | string;
  width?: number | string;
}

export function SkeletonBlock({ height = "1rem", width = "100%" }: SkeletonBlockProps) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}
