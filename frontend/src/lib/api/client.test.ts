import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { api } from "./client";
import { unwrap } from "./errors";

describe("api client", () => {
  it("calls the same-origin /api path through global fetch", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    const me = await unwrap(api.GET("/api/auth/me"));
    expect(me.email).toBe("ana@example.com");
    expect(calls[0].url.origin).toBe("http://localhost:3000");
  });

  it("serializes query params", async () => {
    const { calls } = mockApi({
      "GET /api/transactions": () => ({ body: { items: [], next_cursor: null } }),
    });
    await unwrap(api.GET("/api/transactions", { params: { query: { status: "pending", limit: 20 } } }));
    expect(calls[0].url.searchParams.get("status")).toBe("pending");
    expect(calls[0].url.searchParams.get("limit")).toBe("20");
  });
});
