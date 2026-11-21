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
};

function el(cls: string, text: string): HTMLElement {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text; // textContent: guide text is untrusted
  return d;
}

export function renderOverlay(root: HTMLElement, v: OverlayView): void {
  root.replaceChildren(
    el("head", `${v.act} · 步驟 ${v.step}/${v.total}`),
    el("current", v.current),
    ...(v.tips ? [el("tips", `TIPS: ${v.tips}`)] : []),
    ...(v.next ? [el("next", `下一步: ${v.next}`)] : []),
    ...(v.message ? [el("message", v.message)] : []),
    ...(v.status ? [el(`status ${v.status.connected ? "ok" : "err"}`, statusText(v.status))] : []),
  );
}
