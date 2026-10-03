import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Account = Schemas["AccountOut"];
export type AccountType = Account["type"];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Efectivo",
  debit: "Débito",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
};

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ["accounts", { includeArchived }],
    queryFn: () =>
      unwrap(api.GET("/api/accounts", { params: { query: { include_archived: includeArchived } } })),
  });
}

function useInvalidateAccounts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["accounts"] });
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (body: Schemas["AccountCreate"]) => unwrap(api.POST("/api/accounts", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["AccountUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/accounts/{account_id}", { params: { path: { account_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/accounts/{account_id}", { params: { path: { account_id: id } } })),
    onSuccess: invalidate,
  });
}
