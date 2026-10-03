import { describe, expect, it } from "vitest";

describe("next.config rewrites", () => {
  it("proxies /api to the backend", async () => {
    process.env.BACKEND_URL = "http://backend:9000";
    const { default: config } = await import("./next.config");
    const rewrites = await config.rewrites!();
    expect(rewrites).toEqual([
      { source: "/api/:path*", destination: "http://backend:9000/api/:path*" },
    ]);
  });
});
