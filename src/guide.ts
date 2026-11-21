/** `zone`: entering any of these zones jumps to this step. */
export type Step = { act: string; text: string; tips?: string; zone?: string | string[] };

export function stepZones(s: Step): string[] {
  return s.zone === undefined ? [] : Array.isArray(s.zone) ? s.zone : [s.zone];
}
export type Guide = { title: string; steps: Step[] };

export function parseGuide(raw: string): Guide {
  let data: any;
  try {
    data = JSON.parse(raw.replace(/^﻿/, "")); // Windows Notepad adds a BOM
  } catch (e) {
    throw new Error(`攻略不是合法 JSON: ${(e as Error).message}`);
  }
  if (!data || typeof data.title !== "string") throw new Error("缺少 title");
  if (!Array.isArray(data.steps) || data.steps.length === 0) throw new Error("steps 必須是非空陣列");
  data.steps.forEach((s: any, i: number) => {
    for (const f of ["act", "text"]) {
      if (typeof s?.[f] !== "string") throw new Error(`steps[${i}].${f} 缺少或不是字串`);
    }
    if (s.tips !== undefined && typeof s.tips !== "string") throw new Error(`steps[${i}].tips 必須是字串`);
    const z = s.zone;
    const zoneOk = z === undefined || typeof z === "string" || (Array.isArray(z) && z.every((x) => typeof x === "string"));
    if (!zoneOk) throw new Error(`steps[${i}].zone 必須是字串或字串陣列`);
  });
  return data as Guide;
}
