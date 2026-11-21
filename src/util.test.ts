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

import { isCursorOver } from "./util";

describe("isCursorOver", () => {
  // element rect in CSS px relative to the window; cursor/window in physical px
  const rect = { left: 390, top: 4, right: 410, bottom: 24 };
  it("hits the element at scale 1", () => {
    expect(isCursorOver({ x: 1100, y: 510 }, { x: 700, y: 500 }, rect, 1)).toBe(true);
  });
  it("misses outside the element", () => {
    expect(isCursorOver({ x: 1000, y: 510 }, { x: 700, y: 500 }, rect, 1)).toBe(false);
    expect(isCursorOver({ x: 1100, y: 530 }, { x: 700, y: 500 }, rect, 1)).toBe(false);
  });
  it("accounts for display scaling", () => {
    // at 150%: element spans physical x 700+585..700+615
    expect(isCursorOver({ x: 1300, y: 520 }, { x: 700, y: 500 }, rect, 1.5)).toBe(true);
    expect(isCursorOver({ x: 1100, y: 510 }, { x: 700, y: 500 }, rect, 1.5)).toBe(false);
  });
});
