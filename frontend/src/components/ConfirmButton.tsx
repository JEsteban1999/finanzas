"use client";

import { useState } from "react";

type Props = { label: string; confirmLabel?: string; onConfirm: () => void };

export function ConfirmButton({ label, confirmLabel = "Sí, borrar", onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="inline-flex gap-2">
      <span>¿Seguro?</span>
      <button type="button" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}
