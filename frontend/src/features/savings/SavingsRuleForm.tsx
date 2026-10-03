"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { formatCOP, parseAmount } from "@/lib/money";
import { type SavingsRule, useDeleteSavingsRule, usePutSavingsRule, useSavingsRule } from "./api";

type Mode = "percent" | "fixed";

type RuleFieldsProps = {
  current: SavingsRule | null | undefined;
  saved: boolean;
  onSaved: (saved: boolean) => void;
};

function RuleFields({ current, saved, onSaved }: RuleFieldsProps) {
  const rule = useSavingsRule();
  const accounts = useAccounts();
  const categories = useCategories();
  const put = usePutSavingsRule();
  const remove = useDeleteSavingsRule();
  const [mode, setMode] = useState<Mode>(current?.mode ?? "percent");
  const [value, setValue] = useState(
    current ? (current.mode === "percent" ? String(current.value) : formatCOP(current.value).slice(1)) : "",
  );
  const [triggerId, setTriggerId] = useState(current?.trigger_category_id ?? "");
  const [targetId, setTargetId] = useState(current?.target_account_id ?? "");
  const [active, setActive] = useState(current?.active ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  const savingsAccounts = (accounts.data ?? []).filter((a) => a.type === "savings");
  const incomeCategories = (categories.data ?? []).filter((c) => c.kind === "income");

  if (accounts.isSuccess && savingsAccounts.length === 0) {
    return (
      <p>
        Primero crea una cuenta de tipo Ahorro. <Link href="/mas/cuentas">Ir a cuentas</Link>
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    onSaved(false);
    let numeric: number;
    if (mode === "percent") {
      numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
        return setLocalError("El porcentaje debe estar entre 1 y 100");
      }
    } else {
      const parsed = parseAmount(value);
      if (!parsed.ok) return setLocalError(parsed.error);
      numeric = parsed.value;
    }
    if (!triggerId) return setLocalError("Elige la categoría de ingreso");
    if (!targetId) return setLocalError("Elige la cuenta de ahorro");
    setLocalError(null);
    try {
      await put.mutateAsync({ mode, value: numeric, trigger_category_id: triggerId, target_account_id: targetId, active });
      onSaved(true);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p>Cuando recibas un ingreso de esta categoría, te propondré apartar ahorro de inmediato.</p>
      <label className="flex flex-col">
        Modo
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="percent">Porcentaje</option>
          <option value="fixed">Monto fijo</option>
        </select>
      </label>
      <label className="flex flex-col">
        Valor
        <input inputMode="numeric" placeholder={mode === "percent" ? "20" : "500.000"} value={value}
          onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Cuando entre dinero en
        <select value={triggerId} onChange={(e) => setTriggerId(e.target.value)}>
          <option value="">Elige una categoría</option>
          {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col">
        Apartar en la cuenta
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {savingsAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activa
      </label>
      <FormError error={localError ?? put.error ?? remove.error ?? rule.error ?? accounts.error ?? categories.error} />
      {saved && <p role="status">Regla guardada</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={put.isPending}>Guardar regla</button>
        {rule.data && (
          <ConfirmButton label="Quitar regla" confirmLabel="Sí, quitar" onConfirm={() => { onSaved(false); remove.mutate(); }} />
        )}
      </div>
    </form>
  );
}

export function SavingsRuleForm() {
  const rule = useSavingsRule();
  const accounts = useAccounts();
  const categories = useCategories();
  // The confirmation lives here because RuleFields remounts when the rule first appears.
  const [saved, setSaved] = useState(false);
  // Initial state comes from the loaded rule and select values need their options present,
  // so mount the form only once all three queries have settled.
  if (rule.isPending || accounts.isPending || categories.isPending) return null;
  return <RuleFields key={rule.data ? "rule" : "new"} current={rule.data} saved={saved} onSaved={setSaved} />;
}
