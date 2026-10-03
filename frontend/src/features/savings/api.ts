import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type SavingsRule = Schemas["SavingsRuleOut"];

export function useSavingsRule() {
  return useQuery({ queryKey: ["savings-rule"], queryFn: () => unwrap(api.GET("/api/savings-rule")) });
}

function useInvalidateSavings() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["savings-rule"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
}

export function usePutSavingsRule() {
  const invalidate = useInvalidateSavings();
  return useMutation({
    mutationFn: (body: Schemas["SavingsRuleIn"]) => unwrap(api.PUT("/api/savings-rule", { body })),
    onSuccess: invalidate,
  });
}

export function useDeleteSavingsRule() {
  const invalidate = useInvalidateSavings();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/savings-rule")),
    onSuccess: invalidate,
  });
}
