import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseGuide, stepZones } from "./guide";

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
  it("tags only real zones of the step's act (or the previous act, for revisits), never towns", () => {
    const areas = readFileSync("scripts/campaign-areas.tsv", "utf-8").trim().split(/\r?\n/).map((l) => {
      const [id, name] = l.split("\t");
      return { act: Number(id.split("_")[1]), name, town: id.includes("town") };
    });
    const bad: string[] = [];
    guide!.steps.forEach((s, i) => {
      const act = Number(s.act.slice(1));
      for (const z of stepZones(s)) {
        const hit = areas.find((a) => a.name === z && (a.act === act || a.act === act - 1));
        if (!hit || hit.town) bad.push(`#${i} ${s.act} ${z}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it("tags most campaign zones", () => {
    const tagged = new Set(guide!.steps.flatMap(stepZones));
    expect(tagged.size).toBeGreaterThanOrEqual(100);
  });
});
