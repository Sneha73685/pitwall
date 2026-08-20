/**
 * Typed API client -- the ONLY place in the frontend allowed to call
 * `fetch`. Components must go through here, never call fetch directly
 * (see CLAUDE.md). Every function returns PitWall's own typed shape;
 * this file has no knowledge of FastF1, OpenF1, or Parquet (ADR-0009).
 * Types mirror the backend's response models -- see docs/api-model.md.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface HealthResponse {
  status: string;
  service: string;
}

export type SessionType =
  | "practice_1"
  | "practice_2"
  | "practice_3"
  | "qualifying"
  | "sprint_qualifying"
  | "sprint"
  | "race";

export interface Session {
  session_id: string;
  season: number;
  event_name: string;
  round_number: number;
  location: string;
  country: string;
  session_type: SessionType;
  session_date: string | null;
  /**
   * M12 Phase 4 addition: (season, event slug) -- the identity Season/Event
   * discovery groups by. The backend always sends this key (unlike
   * Lap.compound's genuine nullability), so it's required here, not
   * optional -- matching Session's own field-required convention rather
   * than Lap's.
   */
  event_id: string;
  /**
   * M12 Phase 4 addition: whether this session's telemetry is actually
   * available in PitWall's cache -- not always true even for a
   * successfully ingested session (the real, verified 2018 finding).
   */
  has_telemetry: boolean;
}

/** M12 Phase 4: `GET /seasons` -- one entry per season with at least one
 * locally ingested session. */
export interface SeasonSummary {
  season: number;
  event_count: number;
}

/** M12 Phase 4: `GET /seasons/{season}/events` -- one entry per event
 * PitWall actually has locally ingested sessions for, never an event
 * FastF1's upstream schedule merely knows about. */
export interface EventSummary {
  event_id: string;
  season: number;
  event_name: string;
  round_number: number;
  location: string;
  country: string;
  session_types: SessionType[];
  session_count: number;
}

export interface Driver {
  driver_id: string;
  driver_number: number;
  full_name: string;
  team_name: string;
  /**
   * M34 additions (docs/m34-design-review.md §8/§9). Optional here (not
   * `string | null`), mirroring `Lap.compound`'s own established reasoning:
   * the backend always sends the key, but making these required would force
   * every existing test fixture across the app that builds a `Driver`
   * literal to add them just to keep compiling. `null` for session types
   * FastF1 doesn't populate these for (e.g. Practice) and for any session
   * ingested before M34 (no historical backfill).
   */
  classified_position?: string | null;
  grid_position?: number | null;
  status?: string | null;
  points?: number | null;
}

export interface Lap {
  driver_id: string;
  lap_number: number;
  lap_time_seconds: number | null;
  sector_1_seconds: number | null;
  sector_2_seconds: number | null;
  sector_3_seconds: number | null;
  is_personal_best: boolean;
  is_accurate: boolean;
  /**
   * M10 addition. Optional here (not `compound: string | null`) even
   * though the backend always sends the key -- making it required would
   * force every existing test fixture across the app that builds a `Lap`
   * literal (lap-comparison, track-map, session-select) to add it just to
   * keep compiling, none of which docs/m10-implementation-plan.md Phase 5
   * lists as a file this milestone touches. Optional mirrors the backend
   * field's own `= None` default more faithfully than a required field
   * would anyway.
   */
  compound?: string | null;
}

export interface TelemetrySample {
  distance_m: number;
  time_seconds: number;
  speed_kph: number;
  throttle_pct: number;
  brake_active: boolean;
  rpm: number;
  gear: number;
  drs_active: boolean;
  x: number;
  y: number;
  z: number;
}

export interface TrackPoint {
  distance_m: number;
  x: number;
  y: number;
}

export interface ChannelSeries {
  a: number[];
  b: number[];
}

export type SectorNumber = 1 | 2 | 3;

export interface SectorDelta {
  sector: SectorNumber;
  delta_ms: number;
  faster: "a" | "b";
}

export type WarningCode = "invalid_lap_a" | "invalid_lap_b" | "different_circuit";

export interface ComparisonWarning {
  code: WarningCode;
  detail: string | null;
}

export interface LapComparisonResponse {
  /**
   * M13: each lap resolves from its own independently-selected session --
   * may be the same session on both sides (the M6-era case) or two
   * different ones. Replaces the old single `session_id` field.
   */
  session_id_a: string;
  session_id_b: string;
  lap_a: Lap;
  lap_b: Lap;
  compared_distance_m: number;
  distance_m: number[];
  /** Positive means lap A is faster (ahead) at that distance -- see backend's LapComparisonResponse.delta_ms. */
  delta_ms: number[];
  channels: Record<string, ChannelSeries>;
  sectors: SectorDelta[];
  warnings: ComparisonWarning[];
}

export interface CompareLapsParams {
  sessionIdA: string;
  driverA: string;
  lapA: number;
  sessionIdB: string;
  driverB: string;
  lapB: number;
  resolution?: number;
}

export type SessionAnalyticsWarningCode = "insufficient_laps";

export interface SessionAnalyticsWarning {
  code: SessionAnalyticsWarningCode;
  driver: string;
  detail: string | null;
}

export interface DriverSummary {
  driver: string;
  valid_lap_count: number;
  best_lap_ms: number | null;
  theoretical_best_lap_ms: number | null;
  theoretical_best_delta_ms: number | null;
  median_lap_ms: number | null;
  consistency_ms: number | null;
  consistency_cv: number | null;
  full_throttle_pct: number | null;
  outlier_lap_count: number;
  /**
   * Phase 4 addition (not in the original Phase 0 schema draft): the same
   * lap-time population behind best_lap_ms/median_lap_ms/consistency_ms,
   * needed so PaceDistributionChart can hand raw arrays to ECharts' own
   * boxplot quartile transform rather than the backend pre-computing a
   * five-number summary (design doc B5 decision).
   */
  lap_times_ms: number[];
}

export interface SessionAnalyticsResponse {
  session_id: string;
  session_lap_count: number;
  drivers: DriverSummary[];
  warnings: SessionAnalyticsWarning[];
}

export type ExclusionReason = "yellow_flag";

export interface DriverLapMetrics {
  lap_number: number;
  lap_time_ms: number | null;
  is_valid: boolean;
  exclusion_reason: ExclusionReason | null;
  is_outlier: boolean;
  delta_to_theoretical_best_ms: number | null;
  delta_to_own_median_ms: number | null;
  full_throttle_pct: number | null;
  brake_event_count: number;
}

export interface DriverLapsResponse {
  session_id: string;
  driver: string;
  laps: DriverLapMetrics[];
  warnings: SessionAnalyticsWarning[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>("/health");
}

export async function listSessions(): Promise<Session[]> {
  return getJson<Session[]>("/sessions");
}

/**
 * M12 Phase 4/5: Season -> Event -> Session discovery. Added here, sitting
 * alongside listSessions/getSession, not a new features/season-select/api/
 * module -- same precedent every prior milestone's client additions
 * recorded (M8/M10/M11).
 */
export async function listSeasons(): Promise<SeasonSummary[]> {
  return getJson<SeasonSummary[]>("/seasons");
}

export async function listEventsForSeason(season: number): Promise<EventSummary[]> {
  return getJson<EventSummary[]>(`/seasons/${season}/events`);
}

export async function listSessionsForEvent(season: number, eventId: string): Promise<Session[]> {
  return getJson<Session[]>(`/seasons/${season}/events/${encodeURIComponent(eventId)}/sessions`);
}

export async function getSession(sessionId: string): Promise<Session> {
  return getJson<Session>(`/sessions/${encodeURIComponent(sessionId)}`);
}

export async function listDrivers(sessionId: string): Promise<Driver[]> {
  return getJson<Driver[]>(`/sessions/${encodeURIComponent(sessionId)}/drivers`);
}

export async function listLaps(sessionId: string, driverId?: string): Promise<Lap[]> {
  const query = driverId ? `?driver_id=${encodeURIComponent(driverId)}` : "";
  return getJson<Lap[]>(`/sessions/${encodeURIComponent(sessionId)}/laps${query}`);
}

export async function getTelemetry(
  sessionId: string,
  driverId: string,
  lapNumber: number,
): Promise<TelemetrySample[]> {
  const query = `?driver_id=${encodeURIComponent(driverId)}&lap_number=${lapNumber}`;
  return getJson<TelemetrySample[]>(`/sessions/${encodeURIComponent(sessionId)}/telemetry${query}`);
}

export async function getTrackPoints(sessionId: string): Promise<TrackPoint[]> {
  return getJson<TrackPoint[]>(`/sessions/${encodeURIComponent(sessionId)}/track`);
}

/**
 * M13: `session_id_a`/`session_id_b` are now independent query params, not
 * one shared URL path segment -- see docs/m13-design-review.md §4. The
 * route itself moved from `/sessions/{session_id}/laps/compare` to the
 * top-level `/laps/compare`, retired outright (not kept as a wrapper) per
 * that design's §4/§10.
 */
export async function compareLaps(params: CompareLapsParams): Promise<LapComparisonResponse> {
  const query =
    `?session_id_a=${encodeURIComponent(params.sessionIdA)}` +
    `&driver_a=${encodeURIComponent(params.driverA)}&lap_a=${params.lapA}` +
    `&session_id_b=${encodeURIComponent(params.sessionIdB)}` +
    `&driver_b=${encodeURIComponent(params.driverB)}&lap_b=${params.lapB}` +
    (params.resolution !== undefined ? `&resolution=${params.resolution}` : "");
  return getJson<LapComparisonResponse>(`/laps/compare${query}`);
}

/**
 * M8: session-wide driver performance analytics. Added here, not as a
 * separate features/session-analytics/api/sessionAnalytics.ts module --
 * docs/m8-design-review.md §3 itself says to add these "to the existing
 * typed API client... sitting alongside compareLaps", and that's what M6
 * actually did (compareLaps lives here too, not in a
 * features/lap-comparison/api/ file the M6 design's own file structure
 * once proposed but never shipped). This file remains the only place
 * allowed to call fetch.
 */
export async function getSessionAnalytics(sessionId: string): Promise<SessionAnalyticsResponse> {
  return getJson<SessionAnalyticsResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/analytics/drivers`,
  );
}

export async function getDriverLapMetrics(
  sessionId: string,
  driver: string,
): Promise<DriverLapsResponse> {
  return getJson<DriverLapsResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/analytics/drivers/${encodeURIComponent(driver)}/laps`,
  );
}

export interface Stint {
  stint_number: number;
  compound: string;
  start_lap: number;
  end_lap: number;
  tyre_life_at_start: number | null;
}

export interface PitStop {
  driver_id: string;
  stop_number: number;
  lap_number: number;
  pit_lane_time_seconds: number | null;
}

/**
 * M10: one driver's stints / one session's pit stops. Added here, sitting
 * alongside compareLaps/getSessionAnalytics, not a new
 * features/race-context/api/ module -- same precedent M8 recorded for its
 * own endpoints (docs/m10-implementation-plan.md Phase 5).
 */
export async function getStints(sessionId: string, driverId: string): Promise<Stint[]> {
  return getJson<Stint[]>(
    `/sessions/${encodeURIComponent(sessionId)}/drivers/${encodeURIComponent(driverId)}/stints`,
  );
}

export async function getPitStops(sessionId: string, driverId?: string): Promise<PitStop[]> {
  const query = driverId ? `?driver_id=${encodeURIComponent(driverId)}` : "";
  return getJson<PitStop[]>(`/sessions/${encodeURIComponent(sessionId)}/pit-stops${query}`);
}

export interface StintPaceLap {
  lap_number: number;
  lap_time_seconds: number | null;
  compound: string | null;
  stint_number: number | null;
  lap_in_stint_index: number | null;
  is_valid: boolean;
  is_in_lap: boolean;
  is_out_lap: boolean;
  is_trend_eligible: boolean;
}

export interface StintPace {
  stint_number: number;
  compound: string;
  start_lap: number;
  end_lap: number;
  tyre_life_at_start: number | null;
  eligible_lap_count: number;
  consistency_ms: number | null;
  consistency_cv: number | null;
}

export interface DriverStintPaceResponse {
  session_id: string;
  driver_id: string;
  laps: StintPaceLap[];
  stints: StintPace[];
}

export interface DriverStrategySummary {
  driver_id: string;
  stint_count: number;
  compound_sequence: string[];
  stint_lengths: number[];
}

export interface CompoundUsageCount {
  compound: string;
  stint_count: number;
  driver_count: number;
  total_laps: number;
}

export interface CompoundAggregate {
  compound: string;
  lap_count: number;
  driver_count: number;
  lap_times_ms: number[];
  median_lap_time_ms: number | null;
  p25_lap_time_ms: number | null;
  p75_lap_time_ms: number | null;
}

export interface CompoundLapIndexAggregate {
  compound: string;
  lap_in_stint_index: number;
  lap_count: number;
  lap_times_ms: number[];
  median_lap_time_ms: number | null;
}

export interface RawLapTimeByCompound {
  driver_id: string;
  compound: string;
  lap_count: number;
  lap_times_ms: number[];
  lap_in_stint_indices: number[];
  median_lap_time_ms: number | null;
}

export interface TyrePerformanceResponse {
  session_id: string;
  driver_strategies: DriverStrategySummary[];
  compound_usage: CompoundUsageCount[];
  compound_aggregates: CompoundAggregate[];
  compound_lap_index_aggregates: CompoundLapIndexAggregate[];
  raw_lap_times_by_compound: RawLapTimeByCompound[];
}

/**
 * M11: descriptive tyre/stint performance analytics. Added here, sitting
 * alongside getStints/getPitStops, not a new features/tyre-performance/api/
 * module -- same precedent M8/M10 recorded for their own endpoints
 * (docs/m11-implementation-plan.md Phase 3).
 */
export async function getDriverStintPace(
  sessionId: string,
  driverId: string,
): Promise<DriverStintPaceResponse> {
  return getJson<DriverStintPaceResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/drivers/${encodeURIComponent(driverId)}/stint-pace`,
  );
}

export async function getTyrePerformance(sessionId: string): Promise<TyrePerformanceResponse> {
  return getJson<TyrePerformanceResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/tyre-performance`,
  );
}

export type StintComparisonWarningCode =
  "different_circuit" | "no_stint_data_a" | "no_stint_data_b";

export interface StintComparisonWarning {
  code: StintComparisonWarningCode;
  detail: string | null;
}

/**
 * M15: one driver's strategy for one session -- one side of a pairwise
 * comparison. `strategy`/`stints`/`pit_stops` are exactly the shapes
 * DriverStintPaceResponse/getStints/getPitStops already return, reused
 * unchanged (docs/m15-design-review.md §4/§6) -- deliberately no per-lap
 * `laps` field (Decision A, approved: summary-level only).
 */
export interface DriverStintComparisonSide {
  session_id: string;
  driver_id: string;
  strategy: DriverStrategySummary;
  stints: StintPace[];
  pit_stops: PitStop[];
}

export interface StintComparisonResponse {
  a: DriverStintComparisonSide;
  b: DriverStintComparisonSide;
  warnings: StintComparisonWarning[];
}

export interface CompareStintsParams {
  sessionIdA: string;
  driverA: string;
  sessionIdB: string;
  driverB: string;
}

/**
 * M15 (docs/m15-design-review.md §4): cross-session stint/tyre-strategy
 * comparison. Mirrors compareLaps' query-string construction exactly, minus
 * the lap-number dimension -- this comparison is session+driver-scoped, not
 * lap-scoped (§8: stints/pit-stops are discrete lists, not continuous
 * samples, so there's no alignment/resolution parameter to carry).
 */
export async function compareStints(params: CompareStintsParams): Promise<StintComparisonResponse> {
  const query =
    `?session_id_a=${encodeURIComponent(params.sessionIdA)}` +
    `&driver_a=${encodeURIComponent(params.driverA)}` +
    `&session_id_b=${encodeURIComponent(params.sessionIdB)}` +
    `&driver_b=${encodeURIComponent(params.driverB)}`;
  return getJson<StintComparisonResponse>(`/stints/compare${query}`);
}

/**
 * M17 (docs/m17-design-review.md §5): one driver's race-pace trend across
 * one season. Deliberately a subset of `DriverSummary`'s fields --
 * `full_throttle_pct` is omitted entirely, not just unused, since the
 * backend never fetches telemetry to compute it (§2). `points` is already
 * ordered by the backend (§6); the frontend does not re-sort.
 */
export interface SeasonPaceTrendPoint {
  session_id: string;
  event_id: string;
  event_name: string;
  round_number: number;
  session_date: string | null;
  valid_lap_count: number;
  best_lap_ms: number | null;
  median_lap_ms: number | null;
  theoretical_best_lap_ms: number | null;
  consistency_ms: number | null;
  consistency_cv: number | null;
}

export interface SeasonPaceTrendResponse {
  driver_id: string;
  season: number;
  session_type: SessionType;
  points: SeasonPaceTrendPoint[];
}

/**
 * M17: cross-season driver pace trend. `sessionType` defaults to `"race"`
 * server-side when omitted -- mirrored here by simply not sending the
 * query param at all rather than hardcoding `"race"` on the client, so the
 * backend's own default stays the single source of truth.
 */
export async function getDriverSeasonPaceTrend(
  driverId: string,
  season: number,
  sessionType?: SessionType,
): Promise<SeasonPaceTrendResponse> {
  const query = sessionType ? `?session_type=${encodeURIComponent(sessionType)}` : "";
  return getJson<SeasonPaceTrendResponse>(
    `/drivers/${encodeURIComponent(driverId)}/seasons/${season}/pace-trend${query}`,
  );
}

/**
 * M25 (docs/m25-design-review.md §4): two complete, unmodified
 * `SeasonPaceTrendResponse` sides -- not a new flattened shape, not a
 * computed-metric shape. No `warnings` field: a season-granularity
 * comparison has no equivalent of `/stints/compare`'s "different circuit"
 * concern.
 */
export interface SeasonPaceTrendComparisonResponse {
  a: SeasonPaceTrendResponse;
  b: SeasonPaceTrendResponse;
}

export interface ComparePaceTrendsParams {
  driverA: string;
  seasonA: number;
  driverB: string;
  seasonB: number;
  sessionType?: SessionType;
}

/**
 * M25: two-driver cross-season pace-trend comparison. Mirrors
 * compareStints' query-string construction pattern; `sessionType` is
 * shared by both sides and omitted (server default "race") the same way
 * getDriverSeasonPaceTrend already omits it when unset (docs/m25-design-
 * review.md §3.1).
 */
export async function comparePaceTrends(
  params: ComparePaceTrendsParams,
): Promise<SeasonPaceTrendComparisonResponse> {
  const query =
    `?driver_a=${encodeURIComponent(params.driverA)}&season_a=${params.seasonA}` +
    `&driver_b=${encodeURIComponent(params.driverB)}&season_b=${params.seasonB}` +
    (params.sessionType ? `&session_type=${encodeURIComponent(params.sessionType)}` : "");
  return getJson<SeasonPaceTrendComparisonResponse>(`/drivers/pace-trend/compare${query}`);
}

/**
 * M21 (docs/m21-design-review.md §3): one driver's stint/tyre-strategy
 * trend across one season. `strategy` reuses the existing
 * `DriverStrategySummary` interface (M15) unchanged -- every field this
 * point exposes beyond identity is that one nested object, never a
 * per-stint consistency figure, raw lap, or pit-stop timing. `points` is
 * already ordered by the backend; the frontend does not re-sort.
 */
export interface SeasonTyreTrendPoint {
  session_id: string;
  event_id: string;
  event_name: string;
  round_number: number;
  session_date: string | null;
  strategy: DriverStrategySummary;
}

export interface SeasonTyreTrendResponse {
  driver_id: string;
  season: number;
  session_type: SessionType;
  points: SeasonTyreTrendPoint[];
}

/**
 * M21: cross-season driver tyre/stint-strategy trend. `sessionType`
 * defaults to `"race"` server-side when omitted, mirrored the same way
 * `getDriverSeasonPaceTrend` already does.
 */
export async function getDriverSeasonTyreTrend(
  driverId: string,
  season: number,
  sessionType?: SessionType,
): Promise<SeasonTyreTrendResponse> {
  const query = sessionType ? `?session_type=${encodeURIComponent(sessionType)}` : "";
  return getJson<SeasonTyreTrendResponse>(
    `/drivers/${encodeURIComponent(driverId)}/seasons/${season}/tyre-trend${query}`,
  );
}

/**
 * M26 (docs/m26-design-review.md §4): two complete, unmodified
 * `SeasonTyreTrendResponse` sides -- mirrors `SeasonPaceTrendComparisonResponse`
 * exactly, one trend over. No `warnings` field, for the identical reason
 * that response has none.
 */
export interface SeasonTyreTrendComparisonResponse {
  a: SeasonTyreTrendResponse;
  b: SeasonTyreTrendResponse;
}

export interface CompareTyreTrendsParams {
  driverA: string;
  seasonA: number;
  driverB: string;
  seasonB: number;
  sessionType?: SessionType;
}

/**
 * M26: two-driver cross-season tyre/stint-strategy trend comparison.
 * Mirrors comparePaceTrends' query-string construction pattern exactly.
 */
export async function compareTyreTrends(
  params: CompareTyreTrendsParams,
): Promise<SeasonTyreTrendComparisonResponse> {
  const query =
    `?driver_a=${encodeURIComponent(params.driverA)}&season_a=${params.seasonA}` +
    `&driver_b=${encodeURIComponent(params.driverB)}&season_b=${params.seasonB}` +
    (params.sessionType ? `&session_type=${encodeURIComponent(params.sessionType)}` : "");
  return getJson<SeasonTyreTrendComparisonResponse>(`/drivers/tyre-trend/compare${query}`);
}
