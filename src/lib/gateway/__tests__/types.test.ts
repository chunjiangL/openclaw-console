import { describe, it, expect } from "vitest";
import { extractText } from "../types";

describe("extractText", () => {
  it("returns plain string as-is", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("returns empty string for empty string input", () => {
    expect(extractText("")).toBe("");
  });

  it("extracts text from a single content block object", () => {
    expect(extractText({ type: "text", text: "block content" })).toBe("block content");
  });

  it("extracts text from an array of content blocks", () => {
    const blocks = [
      { type: "text", text: "first " },
      { type: "text", text: "second" },
    ];
    expect(extractText(blocks)).toBe("first second");
  });

  it("filters out non-text blocks from array", () => {
    const blocks = [
      { type: "text", text: "keep" },
      { type: "tool_use", id: "abc", name: "tool" },
      { type: "text", text: " this" },
    ];
    expect(extractText(blocks)).toBe("keep this");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });

  it("stringifies unexpected types", () => {
    expect(extractText(42)).toBe("42");
    expect(extractText(true)).toBe("true");
  });

  it("handles object with text field but no type", () => {
    expect(extractText({ text: "partial" })).toBe("partial");
  });

  it("handles content block with empty text", () => {
    expect(extractText({ type: "text", text: "" })).toBe("");
  });
});
