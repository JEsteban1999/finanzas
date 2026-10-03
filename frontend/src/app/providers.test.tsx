import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { makeQueryClient } from "./providers";

describe("makeQueryClient", () => {
  it("calls onUnauthorized when a query fails with NOT_AUTHENTICATED", async () => {
    const onUnauthorized = vi.fn();
    const client = makeQueryClient(onUnauthorized);
    await client
      .fetchQuery({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new ApiError(401, "NOT_AUTHENTICATED", "")),
      })
      .catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("ignores other 401s such as wrong credentials", async () => {
    const onUnauthorized = vi.fn();
    const client = makeQueryClient(onUnauthorized);
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new ApiError(401, "INVALID_CREDENTIALS", "")),
    });
    await mutation.execute(undefined).catch(() => undefined);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
