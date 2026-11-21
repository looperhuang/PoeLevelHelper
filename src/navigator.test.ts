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
  it("enterZone jumps to nearest forward match then wraps", () => {
    const n = new Navigator(mk(["A", "B", "A", "B"]));
    expect(n.enterZone("B")).toBe(true);
    expect(n.index).toBe(1);
    n.enterZone("B");
    expect(n.index).toBe(3);
    n.enterZone("B");
    expect(n.index).toBe(1);
  });
  it("unknown zone does not move", () => {
    const n = new Navigator(mk(["A", "B"]));
    expect(n.enterZone("X")).toBe(false);
    expect(n.index).toBe(0);
  });
});
