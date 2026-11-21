export type Step = { act: string; text: string; tips?: string; zone?: string };
export type Guide = { title: string; steps: Step[] };

export function parseGuide(raw: string): Guide {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`攻略不是合法 JSON: ${(e as Error).message}`);
  }
  if (!data || typeof data.title !== "string") throw new Error("缺少 title");
  if (!Array.isArray(data.steps) || data.steps.length === 0) throw new Error("steps 必須是非空陣列");
  data.steps.forEach((s: any, i: number) => {
    for (const f of ["act", "text"]) {
      if (typeof s?.[f] !== "string") throw new Error(`steps[${i}].${f} 缺少或不是字串`);
    }
  });
  return data as Guide;
}
