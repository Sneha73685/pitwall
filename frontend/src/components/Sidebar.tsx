import { NavLink } from "react-router-dom";
import { useSelectionStore } from "../state/selectionStore";
import styles from "./Sidebar.module.css";

/**
 * Contextual navigation trail driven entirely by the existing
 * selectionStore (read-only -- per ADR-0007, `season`/`eventId` were added
 * to that same store in M12 Phase 5, not a new one) so users can jump
 * between Seasons/Events/Sessions/Drivers/Laps/Track Map/Compare/Analytics/
 * Tyre Performance for their current selection without losing context.
 */
export function Sidebar() {
  const season = useSelectionStore((state) => state.season);
  const eventId = useSelectionStore((state) => state.eventId);
  const sessionId = useSelectionStore((state) => state.sessionId);
  const driverId = useSelectionStore((state) => state.driverId);
  const lapId = useSelectionStore((state) => state.lapId);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;

  return (
    <nav className={styles.sidebar} aria-label="Session navigation">
      <NavLink to="/" className={linkClass} end>
        Seasons
      </NavLink>
      {season && (
        <NavLink to={`/seasons/${season}`} className={linkClass} end>
          Events
        </NavLink>
      )}
      {season && eventId && (
        <NavLink to={`/seasons/${season}/events/${eventId}`} className={linkClass} end>
          Sessions
        </NavLink>
      )}
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
          <NavLink to={`/laps/compare?sessionA=${sessionId}`} className={linkClass}>
            Compare Sessions
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
