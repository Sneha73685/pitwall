import type { Session } from "../api/client";

/** Shared human-readable labels for Session["session_type"] (was duplicated in SessionListPage and TopSummaryPanel). */
export const SESSION_TYPE_LABELS: Record<Session["session_type"], string> = {
  practice_1: "Practice 1",
  practice_2: "Practice 2",
  practice_3: "Practice 3",
  qualifying: "Qualifying",
  sprint_qualifying: "Sprint Qualifying",
  sprint: "Sprint",
  race: "Race",
};
