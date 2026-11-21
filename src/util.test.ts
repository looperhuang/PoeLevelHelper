import { describe, it, expect } from "vitest";
import { singleFlight, stepOpacity } from "./util";

describe("singleFlight", () => {
  it("ignores calls while one is running", async () => {
    let runs = 0;
    let release!: () => void;
    const f = singleFlight(() => { runs++; return new Promise<void>((r) => (release = r)); });
    const a = f();
    f();
    f();
    release();
    await a;
    expect(runs).toBe(1);
    const b = f();
    release();
    await b;
    expect(runs).toBe(2);
  });
  it("allows a new call after the previous one throws", async () => {
    let runs = 0;
    const f = singleFlight(async () => { runs++; throw new Error("x"); });
    await f().catch(() => {});
    await f().catch(() => {});
    expect(runs).toBe(2);
  });
});

describe("stepOpacity", () => {
  it("steps by 0.1 and clamps to 0.2..1", () => {
    expect(stepOpacity(0.6, 1)).toBeCloseTo(0.7);
    expect(stepOpacity(1, 1)).toBe(1);
    expect(stepOpacity(0.2, -1)).toBeCloseTo(0.2);
    expect(stepOpacity(0.25, -1)).toBeCloseTo(0.2);
  });
});
