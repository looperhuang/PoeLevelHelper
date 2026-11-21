import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { parseGuide, type Guide } from "./guide";
import { Navigator } from "./navigator";
import { renderOverlay } from "./overlay";

type Settings = { log_path: string; guide_path: string | null };
type LogStatus = { ok: boolean; message: string };

const root = document.getElementById("overlay")!;
let guide: Guide | undefined;
let nav: Navigator | undefined;
const msgs = { guide: "", log: "", keys: "" };

function draw() {
  const message = Object.values(msgs).filter(Boolean).join("\n") || undefined;
  if (!guide || !nav) {
    renderOverlay(root, { title: "", act: "-", step: 0, total: 0, current: "按 Ctrl+Alt+O 選擇攻略 JSON", message });
    return;
  }
  const s = nav.current;
  renderOverlay(root, {
    title: guide.title, act: s.act, step: nav.index + 1, total: guide.steps.length,
    current: s.text, tips: s.tips, next: nav.upcoming?.text, message,
  });
}

async function loadGuide(path: string): Promise<boolean> {
  try {
    const g = parseGuide(await invoke<string>("read_text_file", { path }));
    guide = g;
    nav = new Navigator(g);
    msgs.guide = "";
    return true;
  } catch (e) {
    msgs.guide = `攻略載入失敗: ${e}`; // keep previous guide
    return false;
  } finally {
    draw();
  }
}

async function pickGuide() {
  const path = await invoke<string | null>("pick_guide_file");
  if (path && (await loadGuide(path))) await invoke("set_guide_path", { path });
}

async function pickLog() {
  const path = await invoke<string | null>("pick_log_file");
  if (path) await invoke("set_log_path", { path });
}

async function toggle() {
  const w = getCurrentWindow();
  (await w.isVisible()) ? await w.hide() : await w.show();
}

const keys: [string, () => void | Promise<void>][] = [
  ["Control+Alt+Right", () => { nav?.next(); draw(); }],
  ["Control+Alt+Left", () => { nav?.prev(); draw(); }],
  ["Control+Alt+H", toggle],
  ["Control+Alt+O", pickGuide],
  ["Control+Alt+L", pickLog],
];

async function main() {
  await getCurrentWindow().setIgnoreCursorEvents(true);
  const failed: string[] = [];
  for (const [k, fn] of keys) {
    try {
      await register(k, (e) => { if (e.state === "Pressed") void fn(); });
    } catch (e) {
      failed.push(`${k} (${e})`);
    }
  }
  if (failed.length) msgs.keys = `快捷鍵註冊失敗: ${failed.join(", ")}`;

  await listen<string>("zone-entered", (e) => { if (nav?.enterZone(e.payload)) draw(); });
  await listen<LogStatus>("log-status", (e) => { msgs.log = e.payload.ok ? "" : e.payload.message; draw(); });

  const s = await invoke<Settings>("get_settings");
  if (s.guide_path) await loadGuide(s.guide_path);
  draw();
}

main();
