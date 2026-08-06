/**
 * Deterministic, procedural per-team color -- not real F1 livery colors
 * (CLAUDE.md forbids official logos/liveries/broadcast graphics in this
 * repo). Same team_name always hashes to the same hue, so accents stay
 * consistent across cards without hardcoding any brand's actual colors.
 */
function hashHue(teamName: string): number {
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = (hash << 5) - hash + teamName.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function teamAccent(teamName: string): string {
  return `hsl(${hashHue(teamName)}, 65%, 58%)`;
}

export function teamSurfaceTint(teamName: string): string {
  return `hsla(${hashHue(teamName)}, 55%, 22%, 0.35)`;
}
