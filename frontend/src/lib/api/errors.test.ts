import { describe, expect, it } from "vitest";
import { ApiError, messageFor, unwrap } from "./errors";

function result(status: number, body: unknown) {
  return Promise.resolve({
    data: status < 300 ? body : undefined,
    error: status >= 300 ? body : undefined,
    response: new Response(null, { status: status === 204 ? 204 : status }),
  });
}

describe("unwrap", () => {
  it("returns data on success", async () => {
    await expect(unwrap(result(200, { id: 1 }))).resolves.toEqual({ id: 1 });
  });

  it("throws ApiError with the backend code", async () => {
    const error = (await unwrap(
      result(422, { error: { code: "ACCOUNT_ARCHIVED", message: "x", details: { a: 1 } } }),
    ).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("ACCOUNT_ARCHIVED");
    expect(error.details).toEqual({ a: 1 });
  });

  it("maps fetch failures to NETWORK_ERROR", async () => {
    const error = (await unwrap(Promise.reject(new TypeError("Failed to fetch"))).catch(
      (e) => e,
    )) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });
});

describe("messageFor", () => {
  it("uses the Spanish message for known codes", () => {
    expect(messageFor(new ApiError(503, "AI_UNAVAILABLE", "x"))).toBe(
      "No pude interpretarlo, complétalo a mano.",
    );
  });

  it("falls back to the server message, then a generic one", () => {
    expect(messageFor(new ApiError(409, "SOMETHING_NEW", "Mensaje del servidor"))).toBe(
      "Mensaje del servidor",
    );
    expect(messageFor(new Error("boom"))).toBe("Algo salió mal. Intenta de nuevo.");
  });
});
