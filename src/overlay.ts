export type GameStatus = {
  connected: boolean;
  error?: string;
  zone?: string;
  act?: number;
  areaLevel?: number;
  time?: string;
  tagged?: boolean;
};

/** One line telling the player the overlay is reading the game: ● ok / ○ not readable. */
export function statusText(g: GameStatus): string {
  if (!g.connected) return `○ ${g.error ?? "未連線"}`;
  if (!g.zone) return "● 已連線，等待進入區域…";
  const parts = [
    g.act != null ? `第${g.act}章` : undefined,
    g.zone,
    g.areaLevel != null ? `區域等級 ${g.areaLevel}` : undefined,
    g.time,
  ].filter(Boolean);
  return `● ${parts.join(" · ")}${g.tagged === false ? "（攻略未標註）" : ""}`;
}

/** Shortcut help shown by Ctrl+Alt+K; keep in sync with the keys registered in main.ts. */
export const HELP: [string, string][] = [
  ["Ctrl+Alt+→ / ←", "下一步 / 上一步"],
  ["Ctrl+Alt+H", "顯示 / 隱藏疊層"],
  ["Ctrl+Alt+O", "選擇攻略 JSON"],
  ["Ctrl+Alt+L", "選擇 Client.txt"],
  ["Ctrl+Alt+M", "移動模式（拖動位置）"],
  ["Ctrl+Alt+↑ / ↓", "調整透明度"],
  ["Ctrl+Alt+U", "安裝新版（有提示時）"],
  ["Ctrl+Alt+K", "開關此說明"],
];

export type OverlayView = {
  title: string;
  act: string;
  step: number;
  total: number;
  current: string;
  tips?: string;
  next?: string;
  message?: string;
  status?: GameStatus;
  help?: boolean;
  tooltip?: boolean;
  hint?: string;
};

function el(cls: string, text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text; // textContent: guide text is untrusted
  return d;
}

export function renderOverlay(root: HTMLElement, v: OverlayView): void {
  const body = v.help
    ? [el("head", "快捷鍵"), ...HELP.map(([k, what]) => el("help-row", `${k}　${what}`))]
    : [
        el("head", `${v.act} · 步驟 ${v.step}/${v.total}`),
        el("current", v.current),
        ...(v.tips ? [el("tips", `TIPS: ${v.tips}`)] : []),
        ...(v.next ? [el("next", `下一步: ${v.next}`)] : []),
      ];
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.append(...HELP.map(([k, what]) => el("help-row", `${k}　${what}`)));
  root.replaceChildren(
    el("help-icon", "?"),
    ...(v.tooltip ? [tip] : []),
    ...body,
    ...(v.hint ? [el("hint", v.hint)] : []),
    ...(v.message ? [el("message", v.message)] : []),
    ...(v.status ? [el(`status ${v.status.connected ? "ok" : "err"}`, statusText(v.status))] : []),
  );
}
