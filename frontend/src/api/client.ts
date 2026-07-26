/**
 * Typed API client -- the ONLY place in the frontend allowed to call
 * `fetch`. Components must go through here, never call fetch directly
 * (see CLAUDE.md). Every function returns PitWall's own typed shape;
 * this file has no knowledge of FastF1, OpenF1, or Parquet (ADR-0009).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface HealthResponse {
  status: string;
  service: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
