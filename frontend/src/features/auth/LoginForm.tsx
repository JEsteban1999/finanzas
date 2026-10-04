"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useLogin } from "./api";

export function safeNext(next: string | null): string {
  if (!next) return "/";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    const path = url.pathname + url.search + url.hash;
    // "/.//evil.com" se normaliza a "//evil.com", que el navegador trata como otro host.
    return path.startsWith("//") ? "/" : path;
  } catch {
    return "/";
  }
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      router.replace(safeNext(params.get("next")));
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="flex flex-col">
        Email
        <input type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Contraseña
        <input type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <FormError error={login.error} />
      <button type="submit" disabled={login.isPending}>Entrar</button>
    </form>
  );
}
