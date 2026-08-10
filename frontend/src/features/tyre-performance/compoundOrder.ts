/**
 * Neutral, deterministic compound ordering -- the same fixed FIA/Pirelli
 * taxonomy `compoundColor.ts` already hardcodes
 * (`race-context/compoundColor.ts`), reused here for ordering rather than
 * color. Every list/table/axis/legend in `tyre-performance/` that orders
 * compounds goes through this, never a pace-based sort
 * (docs/m11-frontend-design-note.md §9.1, §21).
 *
 * Compounds outside this fixed vocabulary (older seasons, data-quality gaps
 * -- docs/m11-design-review.md §3.1) are appended afterward in alphabetical
 * order, never dropped.
 */
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

function compoundRank(compound: string): number {
  const index = COMPOUND_ORDER.indexOf(compound.toUpperCase());
  return index === -1 ? COMPOUND_ORDER.length : index;
}

/** Sorts a copy of `items` by neutral compound taxonomy, never by any pace statistic. */
export function sortByCompoundOrder<T>(items: readonly T[], compoundOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const rankA = compoundRank(compoundOf(a));
    const rankB = compoundRank(compoundOf(b));
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return compoundOf(a).toUpperCase().localeCompare(compoundOf(b).toUpperCase());
  });
}
