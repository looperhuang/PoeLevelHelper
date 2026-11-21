import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { register } from "@tauri-apps/plugin-global-shortcut";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { parseGuide, stepZones, type Guide } from "./guide";
import { Navigator } from "./navigator";
import { renderOverlay, type GameStatus } from "./overlay";
import { isCursorOver, singleFlight, stepOpacity } from "./util";

type Settings = { log_path: string; guide_path: string | null; opacity: number | null };
type LogStatus = { ok: boolean; message: string };
type AreaInfo = { level: number; act: number | null };

const root = document.getElementById("overlay")!;
let guide: Guide | undefined;
let nav: Navigator | undefined;
const msgs = { guide: "", log: "", keys: "", init: "", update: "" };
let pendingUpdate: Update | null = null;
let opacity = 1;
let moving = false;
// starts "not connected" until the watcher reports; area info precedes the zone line in the log
const game: GameStatus = { connected: false, error: "等待讀取日誌…" };
let lastArea: AreaInfo | undefined;
let showHelp = false;
let tooltip = false;
let hidden = false;
let winPos = { x: 0, y: 0 };
let scale = 1;

async function refreshGeometry() {
  const w = getCurrentWindow();
  const p = await w.outerPosition();
  winPos = { x: p.x, y: p.y };
  scale = await w.scaleFactor();
}

/** The window is click-through and gets no mouse events, so hover is detected by polling the cursor. */
async function pollHover() {
  const icon = root.querySelector(".help-icon");
  if (hidden || !icon) return;
  const c = await cursorPosition();
  const over = isCursorOver({ x: c.x, y: c.y }, winPos, icon.getBoundingClientRect(), scale);
  if (over !== tooltip) {
    tooltip = over;
    draw();
  }
}
let hint = "";
let hintTimer: number | undefined;

/** Brief feedback for a shortcut; `ms = 0` keeps it until replaced. */
function flash(text: string, ms = 2000) {
  hint = text;
  clearTimeout(hintTimer);
  if (ms) hintTimer = window.setTimeout(() => { hint = ""; draw(); }, ms);
  draw();
}

function applyOpacity() {
  root.style.opacity = String(opacity);
}

function draw() {
  const message = Object.values(msgs).filter(Boolean).join("\n") || undefined;
  if (!guide || !nav) {
    renderOverlay(root, { title: "", act: "-", step: 0, total: 0, current: "按 Ctrl+Alt+O 選擇攻略 JSON\nCtrl+Alt+K 查看所有快捷鍵", message, status: game,
      help: showHelp, tooltip, hint: hint || undefined });
    return;
  }
  const s = nav.current;
  renderOverlay(root, {
    title: guide.title, act: s.act, step: nav.index + 1, total: guide.steps.length,
    current: s.text, tips: s.tips, next: nav.upcoming?.text, message, status: game,
    help: showHelp, tooltip, hint: hint || undefined,
  });
}

async function loadGuide(path: string): Promise<boolean> {
  try {
    const g = parseGuide(await invoke<string>("read_text_file", { path }));
    guide = g;
    nav = new Navigator(g);
    msgs.guide = "";
    flash(`已載入：${g.title}`);
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
  if (moving) flash("移動模式：用滑鼠拖動疊層，Ctrl+Alt+M 結束", 0);
  else {
    await invoke("save_window_position");
    flash("已記住位置");
  }
});

const installUpdate = singleFlight(async () => {
  if (!pendingUpdate) return;
  msgs.update = `正在下載更新 v${pendingUpdate.version}…`;
  draw();
  try {
    await pendingUpdate.downloadAndInstall();
    await relaunch();
  } catch (e) {
    msgs.update = `更新失敗: ${e}`;
    draw();
  }
});

async function checkUpdate() {
  try {
    pendingUpdate = await check();
    if (pendingUpdate) msgs.update = `有新版 v${pendingUpdate.version}，按 Ctrl+Alt+U 更新`;
  } catch {
    // offline or no published release yet: not worth bothering the player
  }
  draw();
}

async function changeOpacity(dir: 1 | -1) {
  opacity = stepOpacity(opacity, dir);
  applyOpacity();
  flash(`透明度 ${Math.round(opacity * 100)}%`);
  await invoke("set_opacity", { opacity });
}

async function toggle() {
  const w = getCurrentWindow();
  hidden = await w.isVisible();
  hidden ? await w.hide() : await w.show();
}

const keys: [string, () => void | Promise<void>][] = [
  ["Control+Alt+Right", () => { nav?.next(); draw(); }],
  ["Control+Alt+Left", () => { nav?.prev(); draw(); }],
  ["Control+Alt+H", toggle],
  ["Control+Alt+O", pickGuide],
  ["Control+Alt+L", pickLog],
  ["Control+Alt+M", toggleMove],
  ["Control+Alt+U", installUpdate],
  ["Control+Alt+K", () => { showHelp = !showHelp; draw(); }],
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

function applyLogStatus(st: LogStatus) {
  game.connected = st.ok;
  game.error = st.ok ? undefined : st.message;
  msgs.log = st.ok ? st.message : ""; // ok + message = stale-log hint
  draw();
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

  await step("監聽區域", () => listen<string>("zone-entered", (e) => {
    nav?.enterZone(e.payload, lastArea?.act ?? undefined);
    Object.assign(game, {
      zone: e.payload,
      act: lastArea?.act ?? undefined,
      areaLevel: lastArea?.level,
      time: new Date().toTimeString().slice(0, 5),
      tagged: guide ? guide.steps.some((s) => stepZones(s).includes(e.payload)) : undefined,
    });
    lastArea = undefined;
    draw();
  }));
  await step("監聽日誌狀態", () =>
    listen<LogStatus>("log-status", (e) => applyLogStatus(e.payload)));
  // the watcher may have reported before we subscribed
  await step("讀取日誌狀態", async () => {
    const st = await invoke<LogStatus | null>("get_log_status");
    if (st) applyLogStatus(st);
  });
  await step("監聽區域資訊", () => listen<AreaInfo>("area-info", (e) => { lastArea = e.payload; }));
  await step("讀取設定", async () => {
    const s = await invoke<Settings>("get_settings");
    if (s.opacity != null) opacity = s.opacity;
    applyOpacity();
    if (s.guide_path) await loadGuide(s.guide_path);
  });
  draw();
  await step("視窗位置", async () => {
    await refreshGeometry();
    await getCurrentWindow().onMoved(() => void refreshGeometry());
    await getCurrentWindow().onScaleChanged(() => void refreshGeometry());
  });
  window.setInterval(() => void pollHover().catch(() => {}), 100);
  const trayActions: Record<string, () => void | Promise<void>> = {
    toggle,
    guide: pickGuide,
    log: pickLog,
    move: toggleMove,
    help: () => { showHelp = !showHelp; draw(); },
  };
  await step("系統匣", () => listen<string>("tray", (e) => {
    Promise.resolve(trayActions[e.payload]?.()).catch((err) => { msgs.init = `${e.payload} 執行失敗: ${err}`; draw(); });
  }));
  void checkUpdate();
}

main();
