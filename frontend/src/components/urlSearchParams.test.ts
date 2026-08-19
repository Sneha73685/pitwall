import { describe, expect, it } from "vitest";
import { getParam, setOrDelete } from "./urlSearchParams";

describe("getParam", () => {
  it("returns null for a missing key", () => {
    const params = new URLSearchParams("");
    expect(getParam(params, "driverA")).toBeNull();
  });

  it("returns null for an empty-string value (a bare '?key=')", () => {
    const params = new URLSearchParams("driverA=");
    expect(getParam(params, "driverA")).toBeNull();
  });

  it("returns the value for a present, non-empty key", () => {
    const params = new URLSearchParams("driverA=VER");
    expect(getParam(params, "driverA")).toBe("VER");
  });
});

describe("setOrDelete", () => {
  it("sets the key when given a non-empty value", () => {
    const params = new URLSearchParams("");
    setOrDelete(params, "driverA", "VER");
    expect(params.get("driverA")).toBe("VER");
  });

  it("deletes the key when given null", () => {
    const params = new URLSearchParams("driverA=VER");
    setOrDelete(params, "driverA", null);
    expect(params.has("driverA")).toBe(false);
  });

  it("deletes the key when given an empty string", () => {
    const params = new URLSearchParams("driverA=VER");
    setOrDelete(params, "driverA", "");
    expect(params.has("driverA")).toBe(false);
  });

  it("is a no-op when the key is already absent and given null/empty", () => {
    const params = new URLSearchParams("");
    setOrDelete(params, "driverA", null);
    expect(params.has("driverA")).toBe(false);
    setOrDelete(params, "driverA", "");
    expect(params.has("driverA")).toBe(false);
  });

  it("overwrites an existing value rather than duplicating the key", () => {
    const params = new URLSearchParams("driverA=VER");
    setOrDelete(params, "driverA", "PER");
    expect(params.getAll("driverA")).toEqual(["PER"]);
  });

  it("does not touch any other key already present in the params", () => {
    const params = new URLSearchParams("driverA=VER&seasonA=2023&utm_source=test");
    setOrDelete(params, "driverA", "PER");
    expect(params.get("seasonA")).toBe("2023");
    expect(params.get("utm_source")).toBe("test");
  });

  it("mutates the passed-in params in place and returns nothing", () => {
    const params = new URLSearchParams("");
    const result = setOrDelete(params, "driverA", "VER");
    expect(result).toBeUndefined();
    expect(params.get("driverA")).toBe("VER");
  });
});
