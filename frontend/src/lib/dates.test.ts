import { describe, expect, it } from "vitest";
import { addMonths, currentMonth, monthLabel, monthRange, shortDate, todayISO } from "./dates";

describe("todayISO", () => {
  it("uses Bogotá time near midnight", () => {
    // 04:30 UTC del 1-nov = 23:30 del 31-oct en Bogotá
    expect(todayISO(new Date("2026-11-01T04:30:00Z"))).toBe("2026-10-31");
    expect(todayISO(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
  });

  it("currentMonth follows the Bogotá date", () => {
    expect(currentMonth(new Date("2026-11-01T04:30:00Z"))).toBe("2026-10");
  });
});

describe("month helpers", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("computes month ranges including leap years", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("formats labels in Spanish", () => {
    expect(monthLabel("2026-10")).toBe("octubre de 2026");
    expect(shortDate("2026-10-03")).toBe("3 oct");
  });
});
