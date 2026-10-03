import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type BudgetStatusItem = Schemas["BudgetStatusItem"];

export function useBudgetStatus(month: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => unwrap(api.GET("/api/budgets/status", { params: { query: { month } } })),
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["BudgetSet"]) => unwrap(api.PUT("/api/budgets", { body })),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["budgets"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]),
  });
}
