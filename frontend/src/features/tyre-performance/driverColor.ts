/**
 * Deterministic, procedural per-driver color -- `teamColor.ts`'s sibling,
 * keyed on `driver_id` instead of `team_name`. Needed because
 * DriverCompoundComparisonChart must keep teammates visually distinct on the
 * same compound; `teamColor.ts` would render two drivers from the same team
 * identically, which defeats that chart's purpose
 * (docs/m11-frontend-design-note.md §8.6). Not a replacement for
 * `teamColor.ts` -- both stay, each keyed on the identity its own callers
 * actually need.
 *
 * Not real F1 livery colors (CLAUDE.md) -- same non-branding reasoning
 * `teamColor.ts` already documents; color is never a function of lap time,
 * only of driver identity.
 */
function hashHue(driverId: string): number {
  let hash = 0;
  for (let i = 0; i < driverId.length; i++) {
    hash = (hash << 5) - hash + driverId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function driverColor(driverId: string): string {
  return `hsl(${hashHue(driverId)}, 65%, 58%)`;
}
