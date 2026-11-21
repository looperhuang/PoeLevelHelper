import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseGuide } from "./guide";

const guide = parseGuide(readFileSync("guides/static-strike-slayer-3.29.json", "utf-8"));

describe("static-strike-slayer-3.29 guide", () => {
  it("covers A1..A10", () => {
    const acts = new Set(guide.steps.map((s) => s.act));
    for (let i = 1; i <= 10; i++) expect(acts.has(`A${i}`)).toBe(true);
  });
  it("has a zone-tagged step in every act", () => {
    for (let i = 1; i <= 10; i++) {
      expect(guide.steps.some((s) => s.act === `A${i}` && s.zone)).toBe(true);
    }
  });
});
