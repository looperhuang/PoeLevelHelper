import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseGuide } from "./guide";

// The guide is third-party content and is not in the repo; run these only when it exists locally.
const file = "guides/static-strike-slayer-3.29.json";
const guide = existsSync(file) ? parseGuide(readFileSync(file, "utf-8")) : undefined;

describe.skipIf(!guide)("static-strike-slayer-3.29 guide", () => {
  it("covers A1..A10", () => {
    const acts = new Set(guide!.steps.map((s) => s.act));
    for (let i = 1; i <= 10; i++) expect(acts.has(`A${i}`)).toBe(true);
  });
  it("has a zone-tagged step in every act", () => {
    for (let i = 1; i <= 10; i++) {
      expect(guide!.steps.some((s) => s.act === `A${i}` && s.zone)).toBe(true);
    }
  });
});
