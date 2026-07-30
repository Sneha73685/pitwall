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
