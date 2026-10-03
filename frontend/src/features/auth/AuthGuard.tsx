"use client";

import { ApiError } from "@/lib/api/errors";
import { FormError } from "@/components/FormError";
import { useMe } from "./api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return <p>Cargando…</p>;
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <p>Redirigiendo…</p>;
    return (
      <div>
        <FormError error={me.error} />
        <button type="button" onClick={() => me.refetch()}>Reintentar</button>
      </div>
    );
  }
  return <>{children}</>;
}
