import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  listSeasons,
  type SeasonPaceTrendResponse,
  type SeasonSummary,
  type SessionType,
} from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels";
import { SeasonPaceTrendChart } from "./components/SeasonPaceTrendChart";
import { useDriverPaceTrendComparison } from "./hooks/useDriverPaceTrendComparison";
import styles from "./DriverPaceTrendComparisonPage.module.css";

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
 * /drivers/pace-trend/compare (M25, docs/m25-design-review.md): two
 * drivers' race-pace trends, each across its own independently-selected
 * season -- the two-driver generalization of DriverSeasonPaceTrendPage
 * (M17), deferred there and in DriverSeasonTyreTrendPage (M21) explicitly
 * (docs/m17-design-review.md §11, docs/m21-design-review.md §7).
 *
 * URL is the sole source of truth for all five fields (driverA/seasonA/
 * driverB/seasonB/sessionType) -- no local-state mirror, unlike M24's
 * comparison pages, because unlike a driver+lap pick, none of these
 * fields has a validation gate to preserve: driver_id has no standalone
 * catalog anywhere in this schema (§2.1), and season is only checkable
 * against GET /seasons as a UI convenience, not a gate. `sessionType`
 * updates the URL immediately on change (mirrors DriverSeasonPaceTrendPage's
 * own live filter exactly -- a discrete <select>, no free-text concern).
 *
 * driverA/seasonA/driverB/seasonB are free text + a season <select>,
 * committed to the URL only via the explicit Compare submit action, never
 * on keystroke -- typing "VER" would otherwise write "V", "VE", "VER" as
 * three separate URL/history entries and fire three separate fetches for
 * a value that isn't done being typed (§6). Local form state initializes
 * from the URL on mount, so re-opening or refreshing an existing
 * comparison pre-fills the form with its current values.
 *
 * Two independent SeasonPaceTrendChart instances, reused completely
 * unchanged -- not a merged/aligned chart (§7/§8): the existing chart's
 * x-axis is a category axis built from each driver's own round/event
 * labels, so two drivers (possibly different seasons) have no shared axis
 * to merge onto without inventing an alignment scheme this milestone
 * explicitly does not attempt.
 */
export function DriverPaceTrendComparisonPage() {
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

  const { comparison, loading, error } = useDriverPaceTrendComparison(
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
        <h2 className={styles.heading}>Compare pace trends</h2>
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
      {loading && <LoadingState>Loading pace trend comparison...</LoadingState>}
      {comparison && (
        <div className={styles.columns}>
          <TrendColumn label="A" side={comparison.a} />
          <TrendColumn label="B" side={comparison.b} />
        </div>
      )}
    </section>
  );
}

function TrendColumn({ label, side }: { label: string; side: SeasonPaceTrendResponse }) {
  return (
    <div
      className={styles.column}
      data-testid={`pace-trend-comparison-side-${label.toLowerCase()}`}
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
          <SeasonPaceTrendChart points={side.points} />
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

// M25 (docs/m25-design-review.md §6, mirrors docs/m24-design-review.md §3):
// "" is a legitimate URLSearchParams value for a bare "?key=" -- normalized
// to absent here so it behaves identically to a missing param.
function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}

// M25 (mirrors docs/m24-design-review.md §3/§9): sets `key` when `value` is
// present, deletes it otherwise -- never writes an empty-string value. Not
// shared with ComparisonPage.tsx/StintComparisonPage.tsx's own identical
// copies (docs/m25-design-review.md §13): a third copy is a real
// rule-of-three trigger, deliberately not pulled in as an unrelated
// refactor during this milestone.
function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
