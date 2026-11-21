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
