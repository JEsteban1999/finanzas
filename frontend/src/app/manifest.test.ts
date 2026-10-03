import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("describes an installable standalone app", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: "Finanzas",
      short_name: "Finanzas",
      lang: "es-CO",
      start_url: "/",
      display: "standalone",
    });
    expect(m.icons).toEqual([{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]);
  });
});
