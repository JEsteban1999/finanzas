"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";

function redirectToLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  // Recarga completa a propósito: descarta el caché de React Query de la sesión caducada.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${next}`);
}

export function makeQueryClient(onUnauthorized: () => void = redirectToLogin): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.code === "NOT_AUTHENTICATED") onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
