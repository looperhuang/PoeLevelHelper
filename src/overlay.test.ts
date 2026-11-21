// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderOverlay, type OverlayView } from "./overlay";

const base: OverlayView = { title: "T", act: "A3", step: 3, total: 140, current: "打隊長" };
const render = (v: Partial<OverlayView>) => {
  const root = document.createElement("div");
  renderOverlay(root, { ...base, ...v });
  return root;
};

describe("renderOverlay", () => {
  it("shows act, progress and current step", () => {
    const t = render({}).textContent!;
    expect(t).toContain("A3");
    expect(t).toContain("步驟 3/140");
    expect(t).toContain("打隊長");
  });
  it("shows tips only when present", () => {
    expect(render({}).querySelector(".tips")).toBeNull();
    expect(render({ tips: "注意昇華" }).querySelector(".tips")!.textContent).toContain("注意昇華");
  });
  it("shows next preview only when present", () => {
    expect(render({}).querySelector(".next")).toBeNull();
    expect(render({ next: "下一件事" }).querySelector(".next")!.textContent).toContain("下一件事");
  });
  it("shows message when present", () => {
    expect(render({ message: "找不到日誌" }).querySelector(".message")!.textContent).toContain("找不到日誌");
  });
  it("does not interpret step text as HTML", () => {
    const root = render({ current: "<img src=x onerror=1>" });
    expect(root.querySelector("img")).toBeNull();
  });
});
