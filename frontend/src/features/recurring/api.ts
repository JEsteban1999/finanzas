import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type RecurringTemplate = Schemas["RecurringOut"];

export function useRecurring() {
  return useQuery({ queryKey: ["recurring"], queryFn: () => unwrap(api.GET("/api/recurring")) });
}

function useInvalidateRecurring() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["recurring"] });
}

export function useCreateRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (body: Schemas["RecurringCreate"]) => unwrap(api.POST("/api/recurring", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["RecurringUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/recurring/{template_id}", { params: { path: { template_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/recurring/{template_id}", { params: { path: { template_id: id } } })),
    onSuccess: invalidate,
  });
}
