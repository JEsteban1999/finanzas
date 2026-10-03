import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Transaction = Schemas["TransactionOut"];
export type TransactionSaved = Schemas["TransactionSaved"];
export type TransactionType = Transaction["type"];
export type BudgetStatus = Schemas["BudgetStatusItem"];
export type SavingsSuggestion = Schemas["SavingsSuggestion"];

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["transactions", "accounts", "dashboard", "budgets"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: Schemas["TransactionCreate"]) => unwrap(api.POST("/api/transactions", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["TransactionUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/transactions/{transaction_id}", {
        params: { path: { transaction_id: id } },
        body,
      })),
    onSuccess: invalidate,
  });
}

export function useConfirmTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["TransactionUpdate"] & { id: string }) =>
      unwrap(api.POST("/api/transactions/{transaction_id}/confirm", {
        params: { path: { transaction_id: id } },
        body,
      })),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/transactions/{transaction_id}", {
        params: { path: { transaction_id: id } },
      })),
    onSuccess: invalidate,
  });
}
