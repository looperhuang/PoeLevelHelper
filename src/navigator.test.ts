import { describe, it, expect } from "vitest";
import { Navigator } from "./navigator";
import type { Guide } from "./guide";

const mk = (zones: (string | undefined)[]): Guide => ({
  title: "t",
  steps: zones.map((z, i) => ({ act: "A1", text: `s${i}`, zone: z })),
});

describe("Navigator", () => {
  it("clamps at both ends", () => {
    const n = new Navigator(mk([undefined, undefined]));
    n.prev();
    expect(n.index).toBe(0);
    n.next();
    n.next();
    expect(n.index).toBe(1);
  });
  it("enterZone only moves forward, never back to an earlier step", () => {
    const n = new Navigator(mk(["A", "B", "A", "B"]));
    expect(n.enterZone("B")).toBe(true);
    expect(n.index).toBe(1);
    n.enterZone("B");
    expect(n.index).toBe(3);
    expect(n.enterZone("B")).toBe(false); // no match ahead: stay (e.g. back in town)
    expect(n.index).toBe(3);
    expect(n.enterZone("A")).toBe(false);
    expect(n.index).toBe(3);
  });
  it("unknown zone does not move", () => {
    const n = new Navigator(mk(["A", "B"]));
    expect(n.enterZone("X")).toBe(false);
    expect(n.index).toBe(0);
  });
});

describe("Navigator zones and acts", () => {
  const g = (steps: { act: string; zone?: string | string[] }[]): Guide => ({
    title: "t",
    steps: steps.map((s, i) => ({ ...s, text: `s${i}` })),
  });

  it("matches any zone in a step's zone list", () => {
    const n = new Navigator(g([{ act: "A1" }, { act: "A1", zone: ["x", "y"] }]));
    expect(n.enterZone("y")).toBe(true);
    expect(n.index).toBe(1);
  });

  it("does not jump to a later act that reuses the zone name", () => {
    const n = new Navigator(g([{ act: "A1", zone: "z" }, { act: "A1" }, { act: "A6", zone: "z" }]));
    n.next();
    expect(n.enterZone("z", 1)).toBe(false);
    expect(n.index).toBe(1);
    expect(n.enterZone("z", 6)).toBe(true);
    expect(n.index).toBe(2);
  });

  it("prefers the current act, and allows the next act's step (revisiting an old zone)", () => {
    const n = new Navigator(g([{ act: "A8" }, { act: "A9", zone: "bath" }, { act: "A8", zone: "bath" }]));
    expect(n.enterZone("bath", 8)).toBe(true);
    expect(n.index).toBe(2); // same act wins over nearer next-act step
    const m = new Navigator(g([{ act: "A8" }, { act: "A9", zone: "bath" }]));
    expect(m.enterZone("bath", 8)).toBe(true);
    expect(m.index).toBe(1);
  });
});
