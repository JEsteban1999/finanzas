"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useRegister } from "./api";

export function RegisterForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const register = useRegister();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!token) {
    return <p>Para crear tu cuenta necesitas un enlace de invitación.</p>;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setLocalError("La contraseña debe tener al menos 10 caracteres");
    if (password !== confirm) return setLocalError("Las contraseñas no coinciden");
    setLocalError(null);
    try {
      await register.mutateAsync({ token: token!, password, display_name: displayName });
      router.replace("/");
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col">
        Tu nombre
        <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Contraseña
        <input type="password" autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Repite la contraseña
        <input type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <FormError error={localError ?? register.error} />
      <button type="submit" disabled={register.isPending}>Crear cuenta</button>
    </form>
  );
}
