/**
 * Shared URL query-param helpers for the four comparison pages
 * (ComparisonPage, StintComparisonPage, DriverPaceTrendComparisonPage,
 * DriverTyreTrendComparisonPage) -- extracted from four byte-identical
 * (getParam) / near-identical (setOrDelete) local copies (M24/M25/M26),
 * each of which had already independently arrived at this exact
 * implementation (M27, docs/m27-design-review.md §3/§5). Placed here
 * rather than a new `utils/` directory, matching this project's own
 * existing convention for a small, cross-feature, non-component pure-
 * function module -- the same role teamColor.ts and sessionTypeLabels.ts
 * already play (docs/m27-design-review.md §3.1/§4).
 *
 * No react-router-dom dependency: both functions operate on the standard
 * `URLSearchParams` Web API type, not a router-specific wrapper
 * (docs/m27-design-review.md §5/§7).
 */

/**
 * "" is a legitimate `URLSearchParams` value for a bare "?key=" --
 * normalized to `null` here so it behaves identically to a missing param
 * everywhere this is read.
 */
export function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}

/**
 * Sets `key` when `value` is present, deletes it otherwise -- never
 * writes an empty-string value. Mutates `params` in place and returns
 * nothing; callers invoke this from inside their own `setSearchParams`
 * updater function and return that same, now-mutated object.
 */
export function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
