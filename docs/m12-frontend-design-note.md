# PitWall — M12 Frontend Design Note: Season → Event → Session Navigation (Phase 5)

**Status:** Design only — no implementation yet. This is the design note
`docs/m12-implementation-plan.md`'s own Phase 5 entry names as its exit
criteria ("this phase does not start until its own design note exists"),
matching the M8→M9/M10→its-frontend-note/M11-backend→
`docs/m11-frontend-design-note.md` sequencing this project has used every
time frontend work follows a backend milestone.

**Scope:** replace the root session-selection experience
(`SessionListPage`, a flat, client-filtered list of every ingested session)
with a real `Season → Event → Session` hierarchy, consuming the three new
`GET /seasons`/`GET /seasons/{season}/events`/`GET
/seasons/{season}/events/{event_id}/sessions` endpoints (M12 Phase 4,
already shipped, unchanged by this note). Everything from the existing
`/sessions/:sessionId` route onward (drivers, laps, track map, comparison,
session analytics, race-context, tyre-performance) is **untouched** — this
note only replaces what happens before a `session_id` is chosen.

**Explicit non-goals** (per this task's own instructions): no CSV/export
functionality, no new charts/visualizations, no analytics/degradation/
ranking logic, no hardcoded season/event/session values anywhere (the old
`SessionListPage` already avoided this — nothing here regresses it), no new
state-management abstraction beyond additively extending the existing
`selectionStore`.

---

## 1. Existing patterns audited

Read in full before design decisions were made: `App.tsx` (route table),
`SessionListPage.tsx`/`.module.css`/`.test.tsx` (the page being replaced),
`DriverSelectPage.tsx` (the exact `useParams()` → `useEffect` →
store-setter → fetch pattern every session-scoped page already uses),
`Sidebar.tsx` (the cross-cutting nav-trail component, driven by
`selectionStore`, not route params directly, since it renders alongside
routed content, not inside it), `selectionStore.ts` (ADR-0007's scoped-store
convention, and the existing `setSession`/`setDriver`/`setLap` cascading-clear
pattern), `api/client.ts` (the single typed-client-file convention, no
per-feature API modules), `components/Card.tsx`, `sessionTypeLabels.ts`,
`App.test.tsx` (how the root route is exercised today).

**Key finding:** `SessionListPage` is reachable only from the `/` route
(confirmed by grep — its only other mention anywhere is a code comment in
`SessionAnalyticsHeader.tsx`). Nothing downstream depends on it continuing
to exist once `/` renders something else.

---

## 2. Routes

```
/                                                        SeasonListPage        (was: SessionListPage)
/seasons/:season                                         EventListPage         (new)
/seasons/:season/events/:eventId                         SessionListForEventPage (new)
/sessions/:sessionId                                      DriverSelectPage      (existing, unchanged)
...everything else...                                                          (existing, unchanged)
```

`:eventId` is passed as-is (already URL-safe: `{season}_{slug}`, e.g.
`2024_bahrain_grand_prix`) — no new encoding scheme, matching how
`:sessionId` is already used directly in route params elsewhere.

Three new pages, one deleted (`SessionListPage.tsx`/`.module.css`/
`.test.tsx` — confirmed unused elsewhere, §1).

---

## 3. Data fetching

Three new typed-client functions added to the existing single `api/client.ts`
file (not a new `features/season-select/api/` module — the established
precedent every prior milestone's client additions already followed):

```ts
listSeasons(): Promise<SeasonSummary[]>
listEventsForSeason(season: number): Promise<EventSummary[]>
listSessionsForEvent(season: number, eventId: string): Promise<Session[]>
```

`SeasonSummary`/`EventSummary` are new interfaces mirroring the backend's
`app/models/discovery.py` shapes exactly (`season`/`event_count`;
`event_id`/`season`/`event_name`/`round_number`/`location`/`country`/
`session_types`/`session_count`). `Session` is the **existing** interface,
unchanged in shape here (Phase 4 already added `event_id`/`has_telemetry` to
it on the backend; the frontend's `Session` interface gains those two fields
additively, the same way `Lap.compound` was added in M10 — optional-shaped
where the existing type's own nullability convention calls for it, required
where the backend always sends the field).

Each page follows the exact `useState` + `useEffect` fetch pattern already
used by every session-select page (`SessionListPage`/`DriverSelectPage`/
`LapSelectPage`) — plain `null` (loading) / array (loaded) / `error` string
state, no new data-fetching hook or library. `docs/m8-implementation-plan.md`
Phase 0 already confirmed this codebase has no server-state/caching library
anywhere, and three more pages following the same shape doesn't change that.

---

## 4. State: `selectionStore` (additive)

Extended, not replaced (ADR-0007 — one store per concern, this concern is
still "what's currently selected"):

```ts
interface SelectionState {
  season: number | null;       // new
  eventId: string | null;      // new
  sessionId: string | null;
  driverId: string | null;
  lapId: string | null;
  setSeason: (season: number | null) => void;   // new
  setEvent: (eventId: string | null) => void;   // new
  setSession: (sessionId: string | null) => void;
  setDriver: (driverId: string | null) => void;
  setLap: (lapId: string | null) => void;
}
```

Cascading clears mirror the exact existing pattern (`setSession` already
clears `driverId`/`lapId`): `setSeason` clears `eventId`/`sessionId`/
`driverId`/`lapId`; `setEvent` clears `sessionId`/`driverId`/`lapId`.

**Why this needs store state, not just route params:** `Sidebar.tsx` is
rendered by `AppShell` alongside routed content, not inside a route element
— it has no direct access to the current page's `useParams()`. It already
solves this identically for `sessionId`/`driverId`/`lapId` by reading them
from `selectionStore` instead. Adding `season`/`eventId` to the same store,
the same way, is using an existing abstraction for its existing purpose, not
introducing a new one.

Each new page syncs its own route param into the store on mount/param
change, identical to `DriverSelectPage`'s `useEffect(() => { setSession(...);
fetch... }, [sessionId, setSession])` pattern.

---

## 5. Pages

### `SeasonListPage` (`/`)

Fetches `listSeasons()`. Renders a `Card` grid (reusing `SessionListPage`'s
existing `.grid`/`.cardLink`/`.cardBody` CSS exactly — same file, renamed),
one card per season showing the season year and its `event_count`, linking
to `/seasons/:season`. No search/filter control (unlike the old flat list) —
with a small number of seasons this is unnecessary chrome; if/when many
seasons are ingested, filtering is a proportionate follow-up, not built
speculatively now.

Loading/error/empty states reuse `LoadingState`/`ErrorState`/`EmptyState`
verbatim (`"Loading seasons..."` / existing error pattern / `"No seasons
ingested yet."`).

### `EventListPage` (`/seasons/:season`)

Fetches `listEventsForSeason(season)`. Renders a `Card` grid, one card per
event: event name, round number, location/country, and its
`session_types` as `StatusChip`s (reusing `SESSION_TYPE_LABELS`, the exact
labels already used for the per-session chip on the old `SessionListPage`)
— visibly showing which session types PitWall actually has for that event,
never implying types it doesn't have. Links to
`/seasons/:season/events/:eventId`.

Empty state: `"No events ingested for {season} yet."` — a real, expected
state for a season Phase 4's own real-data check already proved returns
`200 []` rather than 404 for exactly this case; the UI must render it as a
normal empty state, not an error.

### `SessionListForEventPage` (`/seasons/:season/events/:eventId`)

Fetches `listSessionsForEvent(season, eventId)`. Renders a `Card` list,
ordered exactly as the backend already returns it (real weekend
chronology, §9 of the Phase 4 report) — no client-side re-sort. Each card:
`SESSION_TYPE_LABELS[session_type]`, session date (formatted, reusing
whatever date-formatting convention `SessionAnalyticsHeader`/`TopSummaryPanel`
already use, not inventing a new one), and a small `StatusChip` if
`has_telemetry` is `false` ("no telemetry data" — descriptive, not an error,
directly surfacing the real 2018-class finding rather than letting a user
click through to a track map that has nothing to show). Links to the
**existing**, unchanged `/sessions/:sessionId` route.

Empty state: `"No sessions ingested for this event yet."` — same reasoning
as `EventListPage`'s.

---

## 6. Sidebar

Additive: `"Sessions"` (root label) becomes `"Seasons"` (accurate to what
`/` now shows); two new trail links appear when `season`/`eventId` are set,
inserted before the existing `sessionId`-gated links, in the same
`NavLink`-per-level style already used:

```
Seasons                              (/, always)
  Events                             (/seasons/:season, when season is set)
    Sessions                         (/seasons/:season/events/:eventId, when eventId is set)
      Drivers                        (/sessions/:sessionId, when sessionId is set -- unchanged)
        Laps                         (unchanged)
          Track Map                  (unchanged)
      Lap Comparison / Session Analytics / Tyre Performance  (unchanged)
```

No new component, no new CSS file — extends the existing conditional-`NavLink`
block in place.

---

## 7. What is explicitly not built here

- No search/filter UI on the new pages (§5 — a real, deferred follow-up, not
  a silent regression: the old page's search existed because a flat list of
  many sessions needed it; three shallow, small levels of hierarchy don't,
  yet).
- No CSV/table export, no PNG/chart export, no downloadable report — this
  task's own explicit deferral; nothing in this note's component tree
  produces one.
- No new chart/visualization — the new pages are plain `Card` grids/lists,
  matching the "descriptive, not analytical" posture of every prior
  session-select page in this codebase.
- No change to `TelemetryRepository`/backend contracts — Phase 4's API is
  consumed exactly as shipped.
- No hardcoded season/event/session anywhere — every value rendered comes
  from the fetched `SeasonSummary`/`EventSummary`/`Session` response; the
  Bahrain 2024 Race dataset is exercised only because it is what's currently
  ingested, never assumed structurally.

---

## 8. Testing

Each new page gets a test file matching `DriverSelectPage.test.tsx`'s
pattern (mocked client function, loading/empty/error/happy-path assertions).
`App.test.tsx`'s `beforeEach` mock (`listSessions` → now `listSeasons`, since
that's what the root route fetches) and its "shows no session selected on
the root route" test are updated to match — no other existing `App.test.tsx`
case renders the root route, so no other change there. `Sidebar.test.tsx`
(if one exists) or a new one covers the two new conditional trail links.
`selectionStore`'s new fields/actions get direct unit tests mirroring
whatever coverage the existing fields already have.
