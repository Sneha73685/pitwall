import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  listSeasons,
  type SeasonSummary,
  type SeasonTyreTrendResponse,
  type SessionType,
} from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels";
import { SeasonTyreTrendList } from "./components/SeasonTyreTrendList";
import { useDriverTyreTrendComparison } from "./hooks/useDriverTyreTrendComparison";
import styles from "./DriverTyreTrendComparisonPage.module.css";

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
 * /drivers/tyre-trend/compare (M26, docs/m26-design-review.md): two
 * drivers' stint/tyre-strategy trends, each across its own independently-
 * selected season -- the two-driver generalization of
 * DriverSeasonTyreTrendPage (M21), deferred there and in M17 explicitly,
 * and explicitly handed off by M25 (docs/m17-design-review.md §11,
 * docs/m21-design-review.md §7, docs/m25-design-review.md §13). Mirrors
 * DriverPaceTrendComparisonPage.tsx (M25) exactly for the URL-state model
 * (§5 of the design review): none of driverA/seasonA/driverB/seasonB/
 * sessionType has a validation gate, so the URL is the sole source of
 * truth for all five, with no local-state mirror for resolved state.
 * driverA/seasonA/driverB/seasonB are free text + a season <select>,
 * committed to the URL only via the explicit Compare submit action, never
 * on keystroke. `sessionType` updates the URL immediately on change (a
 * discrete <select>, no free-text concern).
 *
 * Two independent SeasonTyreTrendList instances, reused completely
 * unchanged. Unlike M25's chart-based comparison, there is no x-axis or
 * shared coordinate space to reason about at all here: SeasonTyreTrendList
 * is a plain ordered list with no axis, so no alignment question exists to
 * solve or avoid (docs/m26-design-review.md §2.4/§6).
 */
export function DriverTyreTrendComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);

  useEffect(() => {
    listSeasons()
      .then(setSeasons)
      .catch(() => setSeasons([]));
  }, []);

  const driverA = getParam(searchParams, "driverA");
  const seasonAParam = getParam(searchParams, "seasonA");
  const seasonA = seasonAParam !== null ? Number(seasonAParam) : undefined;
  const driverB = getParam(searchParams, "driverB");
  const seasonBParam = getParam(searchParams, "seasonB");
  const seasonB = seasonBParam !== null ? Number(seasonBParam) : undefined;
  const sessionTypeParam = getParam(searchParams, "sessionType");
  const sessionType: SessionType =
    sessionTypeParam && (FILTERABLE_SESSION_TYPES as string[]).includes(sessionTypeParam)
      ? (sessionTypeParam as SessionType)
      : "race";

  const { comparison, loading, error } = useDriverTyreTrendComparison(
    driverA ?? undefined,
    Number.isFinite(seasonA) ? seasonA : undefined,
    driverB ?? undefined,
    Number.isFinite(seasonB) ? seasonB : undefined,
    sessionType,
  );

  const defaultSeason = seasons?.length ? Math.max(...seasons.map((s) => s.season)).toString() : "";
  const [driverAInput, setDriverAInput] = useState(driverA ?? "");
  const [seasonAInput, setSeasonAInput] = useState(seasonAParam ?? "");
  const [driverBInput, setDriverBInput] = useState(driverB ?? "");
  const [seasonBInput, setSeasonBInput] = useState(seasonBParam ?? "");

  function handleSessionTypeChange(nextSessionType: string) {
    setSearchParams(
      (params) => {
        params.set("sessionType", nextSessionType);
        return params;
      },
      { replace: true },
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSearchParams(
      (params) => {
        setOrDelete(params, "driverA", driverAInput.trim());
        setOrDelete(params, "seasonA", seasonAInput);
        setOrDelete(params, "driverB", driverBInput.trim());
        setOrDelete(params, "seasonB", seasonBInput);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>Compare tyre trends</h2>
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
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.sides}>
          <DriverSeasonFields
            label="Driver A"
            driver={driverAInput}
            onDriverChange={setDriverAInput}
            season={seasonAInput}
            onSeasonChange={setSeasonAInput}
            seasons={seasons}
            defaultSeason={defaultSeason}
          />
          <DriverSeasonFields
            label="Driver B"
            driver={driverBInput}
            onDriverChange={setDriverBInput}
            season={seasonBInput}
            onSeasonChange={setSeasonBInput}
            seasons={seasons}
            defaultSeason={defaultSeason}
          />
        </div>
        <button type="submit" className={styles.compareButton}>
          Compare
        </button>
      </form>

      {error && <ErrorState>{error}</ErrorState>}
      {loading && <LoadingState>Loading tyre trend comparison...</LoadingState>}
      {comparison && (
        <div className={styles.columns}>
          <TrendColumn label="A" side={comparison.a} />
          <TrendColumn label="B" side={comparison.b} />
        </div>
      )}
    </section>
  );
}

function TrendColumn({ label, side }: { label: string; side: SeasonTyreTrendResponse }) {
  return (
    <div
      className={styles.column}
      data-testid={`tyre-trend-comparison-side-${label.toLowerCase()}`}
    >
      <h3 className={styles.columnHeading}>
        {label} — {side.driver_id} — {side.season}
      </h3>
      {side.points.length === 0 ? (
        <EmptyState>
          No sessions found for {side.driver_id} in {side.season}.
        </EmptyState>
      ) : (
        <Card>
          <SeasonTyreTrendList points={side.points} />
        </Card>
      )}
    </div>
  );
}

function DriverSeasonFields({
  label,
  driver,
  onDriverChange,
  season,
  onSeasonChange,
  seasons,
  defaultSeason,
}: {
  label: string;
  driver: string;
  onDriverChange: (value: string) => void;
  season: string;
  onSeasonChange: (value: string) => void;
  seasons: SeasonSummary[] | null;
  defaultSeason: string;
}) {
  const seasonValue = season || defaultSeason;
  return (
    <Card title={label}>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Driver</span>
          <input
            type="text"
            className={styles.input}
            value={driver}
            onChange={(event) => onDriverChange(event.target.value.toUpperCase())}
            placeholder="e.g. VER"
            maxLength={16}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Season</span>
          <select
            className={styles.select}
            value={seasonValue}
            onChange={(event) => onSeasonChange(event.target.value)}
            disabled={seasons === null}
          >
            <option value="">Select a season</option>
            {seasons?.map((s) => (
              <option key={s.season} value={s.season}>
                {s.season}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

// M26 (docs/m26-design-review.md §8, mirrors docs/m25-design-review.md §6):
// "" is a legitimate URLSearchParams value for a bare "?key=" -- normalized
// to absent here so it behaves identically to a missing param. Not shared
// with DriverPaceTrendComparisonPage.tsx's (or ComparisonPage.tsx's/
// StintComparisonPage.tsx's) own identical copies -- explicitly not
// extracted this milestone (docs/m26-design-review.md §8/§13).
function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
