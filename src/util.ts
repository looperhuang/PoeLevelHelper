/** Wraps an async action so repeated triggers (e.g. a held hotkey) are ignored while it runs. */
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
}

/** Opacity steps of 0.1, clamped so the overlay never becomes fully invisible. */
export function stepOpacity(current: number, dir: 1 | -1): number {
  return Math.min(1, Math.max(0.2, Math.round((current + dir * 0.1) * 10) / 10));
}

type Pt = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

/** Hover test for a click-through window: cursor and window are physical px, rect is CSS px. */
export function isCursorOver(cursor: Pt, win: Pt, rect: Rect, scale: number): boolean {
  const x = (cursor.x - win.x) / scale;
  const y = (cursor.y - win.y) / scale;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
