import { NavLink } from "react-router-dom";
import { useSelectionStore } from "../state/selectionStore";
import styles from "./Sidebar.module.css";

/**
 * Contextual navigation trail driven entirely by the existing
 * selectionStore (read-only -- no new store state per ADR-0007) so users
 * can jump between Sessions/Drivers/Laps/Track Map/Compare/Analytics/Tyre
 * Performance for their current session without losing context.
 */
export function Sidebar() {
  const sessionId = useSelectionStore((state) => state.sessionId);
  const driverId = useSelectionStore((state) => state.driverId);
  const lapId = useSelectionStore((state) => state.lapId);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <nav className={styles.sidebar} aria-label="Session navigation">
      <NavLink to="/" className={linkClass} end>
        Sessions
      </NavLink>
      {sessionId && (
        <>
          <NavLink to={`/sessions/${sessionId}`} className={linkClass} end>
            Drivers
          </NavLink>
          {driverId && (
            <NavLink to={`/sessions/${sessionId}/drivers/${driverId}`} className={linkClass} end>
              Laps
            </NavLink>
          )}
          {driverId && lapId && (
            <NavLink
              to={`/sessions/${sessionId}/drivers/${driverId}/laps/${lapId}`}
              className={linkClass}
            >
              Track Map
            </NavLink>
          )}
          <NavLink to={`/sessions/${sessionId}/compare`} className={linkClass}>
            Lap Comparison
          </NavLink>
          <NavLink to={`/sessions/${sessionId}/analytics`} className={linkClass}>
            Session Analytics
          </NavLink>
          <NavLink to={`/sessions/${sessionId}/tyre-performance`} className={linkClass}>
            Tyre Performance
          </NavLink>
        </>
      )}
    </nav>
  );
}
