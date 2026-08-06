/**
 * Fixed colors for the five standard Pirelli/FIA dry/wet compounds -- a
 * standardized, functional motorsport convention used by FastF1 itself and
 * every public F1 tool, not team-specific broadcast branding. This is a
 * different category from teamColor.ts's procedural hashing, which exists
 * specifically because real team liveries ARE trademarked (CLAUDE.md);
 * tyre-compound color-coding carries no such restriction, so hardcoding
 * these five values is not the same mistake teamColor.ts avoids.
 *
 * Falls back to a neutral status color for any compound string this
 * mapping wasn't written against -- real data can report values (older
 * seasons, data-quality gaps) this app has no name for, and must render
 * distinctly rather than throw.
 */
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#da291c",
  MEDIUM: "#ffd400",
  HARD: "#f5f5f5",
  INTERMEDIATE: "#43b02a",
  WET: "#0067ad",
};

const FALLBACK_COLOR = "var(--pw-status-neutral)";

export function compoundColor(compound: string | null | undefined): string {
  if (!compound) {
    return FALLBACK_COLOR;
  }
  return COMPOUND_COLORS[compound.toUpperCase()] ?? FALLBACK_COLOR;
}
