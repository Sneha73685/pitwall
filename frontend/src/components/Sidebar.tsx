import { NavLink } from "react-router-dom";
import { useSelectionStore } from "../state/selectionStore";
import styles from "./Sidebar.module.css";

/**
 * Contextual navigation trail driven entirely by the existing
 * selectionStore (read-only -- per ADR-0007, `season`/`eventId` were added
 * to that same store in M12 Phase 5, not a new one) so users can jump
 * between Seasons/Events/Sessions/Drivers/Laps/Track Map/Compare/Analytics/
 * Tyre Performance for their current selection without losing context.
 *
 * M25 (docs/m25-design-review.md §8/§15): one new "Compare Pace Trends"
 * link, gated on `driverId && season` and seeding only side A -- mirrors
 * "Compare Sessions"' own seed-one-side-only pattern exactly. No existing
 * link is reordered or modified.
 *
 * M26 (docs/m26-design-review.md §7): one sibling "Compare Tyre Trends"
 * link, identical gating/seeding pattern, placed immediately after
 * "Compare Pace Trends" to group the two trend-comparison entry points
 * together. No existing link is reordered or modified.
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
          {driverId && season && (
            <NavLink
              to={`/drivers/pace-trend/compare?driverA=${driverId}&seasonA=${season}`}
              className={linkClass}
            >
              Compare Pace Trends
            </NavLink>
          )}
          {driverId && season && (
            <NavLink
              to={`/drivers/tyre-trend/compare?driverA=${driverId}&seasonA=${season}`}
              className={linkClass}
            >
              Compare Tyre Trends
            </NavLink>
          )}
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
