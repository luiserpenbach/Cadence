import { describe, expect, it } from "vitest";
import { evaluateMeasurement, parseMeasured } from "./measurements";

describe("parseMeasured", () => {
  it("reads a leading number and strips units", () => {
    expect(parseMeasured("50.2 N")).toBe(50.2);
    expect(parseMeasured("-1.5e2 kPa")).toBe(-150);
    expect(parseMeasured("  47")).toBe(47);
    expect(parseMeasured("n/a")).toBeNull();
  });
});

describe("evaluateMeasurement", () => {
  it("passes inside min/max and fails outside", () => {
    const limits = { unit: "N", limitMin: 47, limitMax: 53 };
    expect(evaluateMeasurement(50, limits)).toMatchObject({ status: "pass" });
    expect(evaluateMeasurement(47, limits)).toMatchObject({ status: "pass" });
    expect(evaluateMeasurement(53, limits)).toMatchObject({ status: "pass" });
    expect(evaluateMeasurement(46.9, limits).status).toBe("fail");
    expect(evaluateMeasurement(53.1, limits).status).toBe("fail");
  });

  it("skips evaluation when no limits are set", () => {
    expect(
      evaluateMeasurement(12, { unit: "N", limitMin: null, limitMax: null }).status,
    ).toBeNull();
  });
});
