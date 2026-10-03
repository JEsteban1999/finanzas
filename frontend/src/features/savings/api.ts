import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type SavingsRule = Schemas["SavingsRuleOut"];

export function useSavingsRule() {
  return useQuery({ queryKey: ["savings-rule"], queryFn: () => unwrap(api.GET("/api/savings-rule")) });
}

export function usePutSavingsRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["SavingsRuleIn"]) => unwrap(api.PUT("/api/savings-rule", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule"] }),
  });
}

export function useDeleteSavingsRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/savings-rule")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule"] }),
  });
}
