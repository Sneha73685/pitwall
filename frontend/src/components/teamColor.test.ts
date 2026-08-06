import { describe, expect, it } from "vitest";
import { teamAccent, teamSurfaceTint } from "./teamColor";

describe("teamColor", () => {
  it("is deterministic for the same team name", () => {
    expect(teamAccent("Scuderia Ferrari")).toBe(teamAccent("Scuderia Ferrari"));
    expect(teamSurfaceTint("Scuderia Ferrari")).toBe(teamSurfaceTint("Scuderia Ferrari"));
  });

  it("produces distinct colors for different team names", () => {
    expect(teamAccent("Scuderia Ferrari")).not.toBe(teamAccent("Red Bull Racing"));
  });

  it("returns a valid hsl() color string", () => {
    expect(teamAccent("Mercedes")).toMatch(/^hsl\(\d+, 65%, 58%\)$/);
    expect(teamSurfaceTint("Mercedes")).toMatch(/^hsla\(\d+, 55%, 22%, 0\.35\)$/);
  });
});
