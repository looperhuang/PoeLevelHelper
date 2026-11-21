// One-off: node scripts/csv-to-guide.mjs <in.csv> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

function parseCsv(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const [, , inp, out] = process.argv;
let act = null;
const steps = [];
for (const r of parseCsv(readFileSync(inp, "utf-8"))) {
  if (/^A\d+$/.test((r[2] ?? "").trim())) act = r[2].trim();
  const text = (r[3] ?? "").trim();
  if (!act || !text) continue;
  const step = { act, text };
  const tips = (r[4] ?? "").trim();
  if (tips) step.tips = tips;
  steps.push(step);
}
writeFileSync(out, JSON.stringify({ title: "3.29 靈體投擲轉充能打擊 章節拓荒", steps }, null, 2));
console.log(`${steps.length} steps`);
