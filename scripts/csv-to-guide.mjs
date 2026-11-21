// node scripts/csv-to-guide.mjs <in.csv> <out.json> [title]
// Expects columns C = act (A1..A10, only on the act's first row), D = step text, E = tips.
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

const [, , inp, out, titleArg] = process.argv;
if (!inp || !out) {
  console.error("usage: node scripts/csv-to-guide.mjs <in.csv> <out.json> [title]");
  process.exit(1);
}
const title = titleArg ?? out.replace(/^.*[\/]/, "").replace(/\.json$/i, "");
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
writeFileSync(out, JSON.stringify({ title, steps }, null, 2));
console.log(`${steps.length} steps`);
