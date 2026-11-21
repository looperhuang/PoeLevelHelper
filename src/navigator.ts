import { stepZones, type Guide, type Step } from "./guide";

const actOf = (s: Step) => Number(/^A(\d+)$/.exec(s.act)?.[1]);

export class Navigator {
  private i = 0;
  constructor(private guide: Guide) {}
  get index(): number { return this.i; }
  get current(): Step { return this.guide.steps[this.i]; }
  get upcoming(): Step | undefined { return this.guide.steps[this.i + 1]; }
  next(): void { this.i = Math.min(this.i + 1, this.guide.steps.length - 1); }
  prev(): void { this.i = Math.max(this.i - 1, 0); }
  /**
   * Forward only: returning to town or an earlier zone must not rewind progress.
   * `act` (from the game's area id) keeps acts 6-10, which reuse act 1-5 zone names, apart:
   * prefer a step of the same act, else the next act's step (guides revisit old-act zones there).
   */
  enterZone(zone: string, act?: number): boolean {
    const ahead = this.guide.steps
      .map((s, k) => ({ s, k }))
      .filter(({ s, k }) => k > this.i && stepZones(s).includes(zone));
    const hit = act === undefined
      ? ahead[0]
      : ahead.find(({ s }) => actOf(s) === act) ?? ahead.find(({ s }) => actOf(s) === act + 1);
    if (!hit) return false;
    this.i = hit.k;
    return true;
  }
}
