import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { useUpdateAccount } from "./accounts/api";
import { useUpdateCategory } from "./categories/api";
import { usePutSavingsRule } from "./savings/api";

function setup(keys: unknown[][]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const key of keys) client.setQueryData(key, []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const isInvalidated = (client: QueryClient, key: unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

describe("cross-domain invalidation", () => {
  it("category mutations also invalidate budgets and dashboard", async () => {
    mockApi({ "PATCH /api/categories/c1": () => ({ body: { id: "c1", name: "X", kind: "expense", archived: false } }) });
    const keys = [["categories", { includeArchived: false }], ["budgets", "2026-10"], ["dashboard", "2026-10"]];
    const { client, wrapper } = setup(keys);
    const { result } = renderHook(() => useUpdateCategory(), { wrapper });
    await act(() => result.current.mutateAsync({ id: "c1", name: "X" }));
    await waitFor(() => keys.forEach((k) => expect(isInvalidated(client, k)).toBe(true)));
  });

  it("account mutations also invalidate the dashboard", async () => {
    mockApi({ "PATCH /api/accounts/a1": () => ({ body: { id: "a1", name: "X" } }) });
    const keys = [["accounts", { includeArchived: false }], ["dashboard", "2026-10"]];
    const { client, wrapper } = setup(keys);
    const { result } = renderHook(() => useUpdateAccount(), { wrapper });
    await act(() => result.current.mutateAsync({ id: "a1", name: "X" }));
    await waitFor(() => keys.forEach((k) => expect(isInvalidated(client, k)).toBe(true)));
  });

  it("savings rule mutations also invalidate the dashboard", async () => {
    mockApi({ "PUT /api/savings-rule": () => ({ body: { id: "r1" } }) });
    const keys = [["savings-rule"], ["dashboard", "2026-10"]];
    const { client, wrapper } = setup(keys);
    const { result } = renderHook(() => usePutSavingsRule(), { wrapper });
    await act(() => result.current.mutateAsync({ percent: "10", destination_account_id: "a1" } as never));
    await waitFor(() => keys.forEach((k) => expect(isInvalidated(client, k)).toBe(true)));
  });
});
