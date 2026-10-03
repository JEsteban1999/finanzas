import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("next.config rewrites", () => {
  it("proxies /api to the backend", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend:9000");
    const { default: config } = await import("./next.config");
    const rewrites = await config.rewrites!();
    expect(rewrites).toEqual([
      { source: "/api/:path*", destination: "http://backend:9000/api/:path*" },
    ]);
  });

  it("falls back to localhost outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BACKEND_URL", "");
    delete process.env.BACKEND_URL;
    const { default: config } = await import("./next.config");
    expect(await config.rewrites!()).toEqual([
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    ]);
  });

  it("requires BACKEND_URL in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BACKEND_URL", "");
    delete process.env.BACKEND_URL;
    const { default: config } = await import("./next.config");
    await expect(config.rewrites!()).rejects.toThrow("BACKEND_URL es obligatoria en producción");
  });
});
