import { describe, it, expect } from "vitest";
import { parseGuide } from "./guide";

describe("parseGuide", () => {
  it("throws on non-JSON", () => {
    expect(() => parseGuide("not json")).toThrow();
  });
  it("throws on empty steps", () => {
    expect(() => parseGuide('{"title":"t","steps":[]}')).toThrow(/steps/);
  });
  it("names the bad field", () => {
    expect(() => parseGuide('{"title":"t","steps":[{"act":"A1"}]}')).toThrow(/steps\[0\]\.text/);
  });
  it("returns valid guide unchanged", () => {
    const raw = { title: "t", steps: [{ act: "A1", text: "go", zone: "Z" }] };
    expect(parseGuide(JSON.stringify(raw))).toEqual(raw);
  });
});

describe("parseGuide BOM", () => {
  it("accepts a UTF-8 BOM (Windows Notepad)", () => {
    const raw = "\uFEFF" + JSON.stringify({ title: "t", steps: [{ act: "A1", text: "go" }] });
    expect(parseGuide(raw).title).toBe("t");
  });
});

describe("parseGuide optional fields", () => {
  it("rejects non-string zone", () => {
    expect(() => parseGuide('{"title":"t","steps":[{"act":"A1","text":"x","zone":5}]}')).toThrow(/steps\[0\]\.zone/);
  });
  it("rejects non-string tips", () => {
    expect(() => parseGuide('{"title":"t","steps":[{"act":"A1","text":"x","tips":["a"]}]}')).toThrow(/steps\[0\]\.tips/);
  });
});
