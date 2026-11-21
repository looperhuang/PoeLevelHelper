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
