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
}

export interface Driver {
  driver_id: string;
  driver_number: number;
  full_name: string;
  team_name: string;
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

export type WarningCode = "invalid_lap_a" | "invalid_lap_b";

export interface ComparisonWarning {
  code: WarningCode;
  detail: string | null;
}

export interface LapComparisonResponse {
  session_id: string;
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
  driverA: string;
  lapA: number;
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

export async function compareLaps(
  sessionId: string,
  params: CompareLapsParams,
): Promise<LapComparisonResponse> {
  const query =
    `?driver_a=${encodeURIComponent(params.driverA)}&lap_a=${params.lapA}` +
    `&driver_b=${encodeURIComponent(params.driverB)}&lap_b=${params.lapB}` +
    (params.resolution !== undefined ? `&resolution=${params.resolution}` : "");
  return getJson<LapComparisonResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/laps/compare${query}`,
  );
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
