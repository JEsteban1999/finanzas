import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Category = Schemas["CategoryOut"];
export type CategoryKind = Category["kind"];

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: () =>
      unwrap(api.GET("/api/categories", { params: { query: { include_archived: includeArchived } } })),
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["categories"] }),
      qc.invalidateQueries({ queryKey: ["budgets"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (body: Schemas["CategoryCreate"]) => unwrap(api.POST("/api/categories", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["CategoryUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/categories/{category_id}", { params: { path: { category_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/categories/{category_id}", { params: { path: { category_id: id } } })),
    onSuccess: invalidate,
  });
}
