import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export const meKey = ["me"] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => unwrap(api.GET("/api/auth/me")) });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["LoginIn"]) => unwrap(api.POST("/api/auth/login", { body })),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["RegisterIn"]) => unwrap(api.POST("/api/auth/register", { body })),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/auth/logout")),
    onSuccess: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: Schemas["ChangePasswordIn"]) =>
      unwrap(api.POST("/api/auth/change-password", { body })),
  });
}
