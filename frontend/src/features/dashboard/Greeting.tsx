"use client";

import { useMe } from "@/features/auth/api";

export function Greeting() {
  const me = useMe();
  const name = me.data?.display_name?.split(" ")[0];
  return (
    <p className="text-lg font-bold text-[var(--ink-2)]">
      {name ? `Hola, ${name}. Así va tu plata.` : "Así va tu plata."}
    </p>
  );
}
