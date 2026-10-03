import { describe, expect, it, vi } from "vitest";
import { getLastAccountId, setLastAccountId } from "./last-account";

describe("last account", () => {
  it("round-trips through localStorage", () => {
    expect(getLastAccountId()).toBeNull();
    setLastAccountId("acc-1");
    expect(getLastAccountId()).toBe("acc-1");
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setLastAccountId("x")).not.toThrow();
    expect(getLastAccountId()).toBeNull();
    vi.restoreAllMocks();
  });
});
