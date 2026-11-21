export type OverlayView = {
  title: string;
  act: string;
  step: number;
  total: number;
  current: string;
  tips?: string;
  next?: string;
  message?: string;
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
  );
}
