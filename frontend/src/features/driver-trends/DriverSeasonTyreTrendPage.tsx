import { Link, useParams, useSearchParams } from "react-router-dom";
import type { SessionType } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels";
import { SeasonTyreTrendList } from "./components/SeasonTyreTrendList";
import { useDriverSeasonTyreTrend } from "./hooks/useDriverSeasonTyreTrend";
import styles from "./DriverSeasonTyreTrendPage.module.css";

const FILTERABLE_SESSION_TYPES: SessionType[] = [
  "race",
  "sprint",
  "qualifying",
  "sprint_qualifying",
  "practice_1",
  "practice_2",
  "practice_3",
];

/**
 * /drivers/:driverId/seasons/:season/tyre-trend (M21,
 * docs/m21-design-review.md §7): one driver's stint/tyre-strategy trend
 * across one season -- the structural mirror of
 * DriverSeasonPaceTrendPage.tsx (M17). Season/driver are fixed by the
 * route params; no picker UI is needed here, since the one approved entry
 * point (DriverSelectPage's "Tyre Trend" link) already carries both. An
 * optional session-type filter (default "Race") is the only other
 * control, reusing the same FILTERABLE_SESSION_TYPES/SESSION_TYPE_LABELS
 * vocabulary unchanged.
 *
 * No M14 cursor synchronization: this page is one categorical list
 * indexed by session identity, not a distance-aligned telemetry chart,
 * and there is only one view on the page -- nothing here for
 * useCursorSync/cursorStore to synchronize against
 * (docs/m21-design-review.md §7).
 *
 * `fromSession` (optional query param, set by DriverSelectPage's link)
 * drives the "back" link to wherever the user came from; if absent (a
 * direct URL visit), falls back to the trend's own first point's session
 * once loaded, and is omitted entirely if neither is available -- the
 * same convention DriverSeasonPaceTrendPage already establishes.
 */
export function DriverSeasonTyreTrendPage() {
  const { driverId, season: seasonParam } = useParams<{ driverId: string; season: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const season = seasonParam ? Number(seasonParam) : undefined;
  const sessionTypeParam = searchParams.get("session_type");
  const sessionType: SessionType =
    sessionTypeParam && (FILTERABLE_SESSION_TYPES as string[]).includes(sessionTypeParam)
      ? (sessionTypeParam as SessionType)
      : "race";

  const { trend, loading, error } = useDriverSeasonTyreTrend(driverId, season, sessionType);

  if (!driverId || season === undefined || Number.isNaN(season)) {
    return null;
  }

  const fromSession = searchParams.get("fromSession") ?? trend?.points[0]?.session_id ?? null;

  function handleSessionTypeChange(nextSessionType: string) {
    setSearchParams((params) => {
      params.set("session_type", nextSessionType);
      return params;
    });
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>
          Tyre Trend — {driverId} — {season}
        </h2>
        {fromSession && (
          <Link to={`/sessions/${fromSession}/drivers/${driverId}`} className={styles.backLink}>
            ← Back to driver
          </Link>
        )}
      </div>
      <div className={styles.filterRow}>
        <label className={styles.filterLabel} htmlFor="session-type-filter">
          Session type
        </label>
        <select
          id="session-type-filter"
          className={styles.filterSelect}
          value={sessionType}
          onChange={(event) => handleSessionTypeChange(event.target.value)}
        >
          {FILTERABLE_SESSION_TYPES.map((type) => (
            <option key={type} value={type}>
              {SESSION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorState>{error}</ErrorState>}
      {loading && <LoadingState>Loading tyre trend...</LoadingState>}
      {trend && trend.points.length === 0 && (
        <EmptyState>
          No {SESSION_TYPE_LABELS[sessionType].toLowerCase()} sessions found for {driverId} in{" "}
          {season}.
        </EmptyState>
      )}
      {trend && trend.points.length > 0 && (
        <Card title="Stint/tyre strategy by round">
          <SeasonTyreTrendList points={trend.points} />
        </Card>
      )}
    </section>
  );
}
