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

import { statusText } from "./overlay";

describe("statusText", () => {
  it("shows the error when the log can't be read", () => {
    expect(statusText({ connected: false, error: "讀不到日誌" })).toBe("○ 讀不到日誌");
  });
  it("waits for the first zone", () => {
    expect(statusText({ connected: true })).toBe("● 已連線，等待進入區域…");
  });
  it("shows act, zone, area level and time", () => {
    expect(statusText({ connected: true, zone: "漆黑礦坑：第 2 層", act: 4, areaLevel: 34, time: "12:10", tagged: true }))
      .toBe("● 第4章 · 漆黑礦坑：第 2 層 · 區域等級 34 · 12:10");
  });
  it("marks zones the guide does not tag and omits unknown parts", () => {
    expect(statusText({ connected: true, zone: "藏身處 - 富饒之地", areaLevel: 60, time: "12:11", tagged: false }))
      .toBe("● 藏身處 - 富饒之地 · 區域等級 60 · 12:11（攻略未標註）");
  });
});

describe("renderOverlay status line", () => {
  it("renders status with ok/err class", () => {
    const root = document.createElement("div");
    renderOverlay(root, { ...base, status: { connected: false, error: "x" } });
    expect(root.querySelector(".status.err")!.textContent).toBe("○ x");
    renderOverlay(root, { ...base, status: { connected: true } });
    expect(root.querySelector(".status.ok")).not.toBeNull();
  });
});

import { HELP } from "./overlay";

describe("help and hints", () => {
  it("help panel lists every shortcut and replaces the step", () => {
    const root = document.createElement("div");
    renderOverlay(root, { ...base, help: true });
    const t = root.textContent!;
    for (const [key, what] of HELP) {
      expect(t).toContain(key);
      expect(t).toContain(what);
    }
    expect(t).not.toContain("打隊長");
  });
  it("help covers all registered shortcuts", () => {
    const keys = HELP.map(([k]) => k).join(" ");
    for (const k of ["→", "←", "H", "O", "L", "M", "↑", "↓", "U", "K"]) expect(keys).toContain(k);
  });
  it("shows a hint line when given", () => {
    const root = document.createElement("div");
    renderOverlay(root, { ...base, hint: "透明度 70%" });
    expect(root.querySelector(".hint")!.textContent).toBe("透明度 70%");
    renderOverlay(root, base);
    expect(root.querySelector(".hint")).toBeNull();
  });
});

describe("help icon tooltip", () => {
  it("always renders the ? icon", () => {
    const root = document.createElement("div");
    renderOverlay(root, base);
    expect(root.querySelector(".help-icon")!.textContent).toBe("?");
    expect(root.querySelector(".tooltip")).toBeNull();
  });
  it("tooltip lists shortcuts while keeping the current step", () => {
    const root = document.createElement("div");
    renderOverlay(root, { ...base, tooltip: true });
    const tip = root.querySelector(".tooltip")!.textContent!;
    for (const [key] of HELP) expect(tip).toContain(key);
    expect(root.querySelector(".current")!.textContent).toBe("打隊長");
  });
});
