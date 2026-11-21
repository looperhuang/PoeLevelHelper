import type { Guide, Step } from "./guide";

export class Navigator {
  private i = 0;
  constructor(private guide: Guide) {}
  get index(): number { return this.i; }
  get current(): Step { return this.guide.steps[this.i]; }
  get upcoming(): Step | undefined { return this.guide.steps[this.i + 1]; }
  next(): void { this.i = Math.min(this.i + 1, this.guide.steps.length - 1); }
  prev(): void { this.i = Math.max(this.i - 1, 0); }
  enterZone(zone: string): boolean {
    // forward only: returning to town or an earlier zone must not rewind progress
    const j = this.guide.steps.findIndex((x, k) => k > this.i && x.zone === zone);
    if (j < 0) return false;
    this.i = j;
    return true;
  }
}
