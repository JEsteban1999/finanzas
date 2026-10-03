import { describe, expect, it } from "vitest";
import { formatDelta, formatRate } from "./format";

describe("dashboard format", () => {
  it("formats rates", () => {
    expect(formatRate(0.1667)).toBe("16,7%");
    expect(formatRate(-0.05)).toBe("-5,0%");
    expect(formatRate(null)).toBe("—");
  });

  it("formats deltas", () => {
    expect(formatDelta(50)).toBe("+50,0%");
    expect(formatDelta(-12.5)).toBe("-12,5%");
    expect(formatDelta(0)).toBe("0,0%");
    expect(formatDelta(null)).toBe("nuevo");
  });
});
