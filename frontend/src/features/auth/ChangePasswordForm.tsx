"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useChangePassword } from "./api";

export function ChangePasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next.length < 10) return setLocalError("La nueva contraseña debe tener al menos 10 caracteres");
    if (next !== confirm) return setLocalError("Las contraseñas no coinciden");
    setLocalError(null);
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <label className="flex flex-col">
        Contraseña actual
        <input type="password" autoComplete="current-password" required value={current}
          onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Nueva contraseña
        <input type="password" autoComplete="new-password" required value={next}
          onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Repite la nueva contraseña
        <input type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <FormError error={localError ?? change.error} />
      {done && <p role="status">Contraseña actualizada</p>}
      <button type="submit" disabled={change.isPending}>Cambiar contraseña</button>
    </form>
  );
}
