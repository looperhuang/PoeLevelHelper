import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { parseGuide, type Guide } from "./guide";
import { Navigator } from "./navigator";
import { renderOverlay } from "./overlay";
import { singleFlight, stepOpacity } from "./util";

type Settings = { log_path: string; guide_path: string | null; opacity: number | null };
type LogStatus = { ok: boolean; message: string };

const root = document.getElementById("overlay")!;
let guide: Guide | undefined;
let nav: Navigator | undefined;
const msgs = { guide: "", log: "", keys: "", init: "" };
let opacity = 1;
let moving = false;

function applyOpacity() {
  root.style.opacity = String(opacity);
}

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

const pickGuide = singleFlight(async () => {
  const path = await invoke<string | null>("pick_guide_file");
  if (path && (await loadGuide(path))) await invoke("set_guide_path", { path });
});

const pickLog = singleFlight(async () => {
  const path = await invoke<string | null>("pick_log_file");
  if (path) await invoke("set_log_path", { path });
});

/** Move mode: overlay takes the mouse so it can be dragged; leaving saves the position. */
const toggleMove = singleFlight(async () => {
  moving = !moving;
  root.classList.toggle("moving", moving);
  await getCurrentWindow().setIgnoreCursorEvents(!moving);
  if (!moving) await invoke("save_window_position");
});

async function changeOpacity(dir: 1 | -1) {
  opacity = stepOpacity(opacity, dir);
  applyOpacity();
  await invoke("set_opacity", { opacity });
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
  ["Control+Alt+M", toggleMove],
  ["Control+Alt+Up", () => changeOpacity(1)],
  ["Control+Alt+Down", () => changeOpacity(-1)],
];

/** Runs one startup step; a failure is shown on the overlay instead of aborting startup. */
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    msgs.init += `${name}失敗: ${e}\n`;
  }
}

async function main() {
  draw();
  await step("點擊穿透", () => getCurrentWindow().setIgnoreCursorEvents(true));
  const failed: string[] = [];
  for (const [k, fn] of keys) {
    try {
      await register(k, (e) => {
        if (e.state !== "Pressed") return;
        Promise.resolve(fn()).catch((err) => { msgs.init = `${k} 執行失敗: ${err}`; draw(); });
      });
    } catch (e) {
      failed.push(`${k} (${e})`);
    }
  }
  if (failed.length) msgs.keys = `快捷鍵註冊失敗: ${failed.join(", ")}`;

  await step("監聽區域", () => listen<string>("zone-entered", (e) => { if (nav?.enterZone(e.payload)) draw(); }));
  await step("監聽日誌狀態", () =>
    listen<LogStatus>("log-status", (e) => { msgs.log = e.payload.ok ? "" : e.payload.message; draw(); }));
  await step("讀取設定", async () => {
    const s = await invoke<Settings>("get_settings");
    if (s.opacity != null) opacity = s.opacity;
    applyOpacity();
    if (s.guide_path) await loadGuide(s.guide_path);
  });
  draw();
}

main();
