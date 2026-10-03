"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { messageFor } from "@/lib/api/errors";
import { todayISO } from "@/lib/dates";
import { getLastAccountId, setLastAccountId } from "@/lib/last-account";
import { formatCOP, parseAmount } from "@/lib/money";
import type { TransactionType } from "./api";

export type TransactionFormValues = {
  type: TransactionType;
  amount: number;
  date: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  description: string | null;
};

type Initial = Partial<{
  type: TransactionType | null;
  amount: number | null;
  date: string | null;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string | null;
}>;

type Props = {
  initial?: Initial;
  missingFields?: string[];
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel?: () => void;
};

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

export function TransactionForm({ initial = {}, missingFields = [], submitLabel, onSubmit, onCancel }: Props) {
  const accounts = useAccounts();
  const categories = useCategories();
  const allAccounts = useAccounts(true);
  const allCategories = useCategories(true);
  const [type, setType] = useState<TransactionType>(initial.type ?? "expense");
  const [amountText, setAmountText] = useState(initial.amount ? formatCOP(initial.amount).slice(1) : "");
  const [date, setDate] = useState(initial.date ?? todayISO());
  const [accountChoice, setAccountId] = useState<string | null>(initial.account_id ?? null);
  const [toAccountId, setToAccountId] = useState(initial.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Cuenta por defecto: la última usada, si sigue activa (derivada, sin efecto).
  const last = getLastAccountId();
  const defaultAccountId = last && accounts.data?.some((a) => a.id === last) ? last : "";
  const accountId = accountChoice ?? defaultAccountId;

  const kindCategories = (categories.data ?? []).filter((c) => c.kind === type);

  // Cuentas/categorías archivadas que ya vienen en `initial` (editar o confirmar):
  // se ofrecen como opción extra para no perder el valor.
  const initialAccountIds = [initial.account_id, initial.to_account_id];
  const archivedAccounts = (allAccounts.data ?? []).filter(
    (a) => initialAccountIds.includes(a.id) && !(accounts.data ?? []).some((x) => x.id === a.id),
  );
  const archivedCategories = (allCategories.data ?? []).filter(
    (c) => c.id === initial.category_id && c.kind === type && !(categories.data ?? []).some((x) => x.id === c.id),
  );
  const noAccounts = accounts.isSuccess && accounts.data.length === 0;

  function changeType(next: TransactionType) {
    setType(next);
    if (!(categories.data ?? []).some((c) => c.id === categoryId && c.kind === next)) setCategoryId("");
    if (next !== "transfer") setToAccountId("");
  }

  const missing = (field: string) => missingFields.includes(field);
  const fieldProps = (field: string) => ({
    "aria-invalid": missing(field) ? (true as const) : undefined,
    "aria-describedby": missing(field) ? `${field}-missing` : undefined,
  });
  const hint = (field: string) =>
    missing(field) ? <span id={`${field}-missing`}>Revisa este dato</span> : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    const parsed = parseAmount(amountText);
    if (!parsed.ok) problems.push(parsed.error);
    if (!date) problems.push("Elige la fecha");
    if (!accountId) problems.push("Elige una cuenta");
    if (type === "transfer") {
      if (!toAccountId) problems.push("Elige la cuenta de destino");
      else if (toAccountId === accountId) problems.push("La cuenta de destino debe ser distinta");
    } else if (!categoryId) {
      problems.push("Elige una categoría");
    }
    setErrors(problems);
    if (problems.length > 0 || !parsed.ok) return;

    setSaving(true);
    try {
      await onSubmit({
        type,
        amount: parsed.value,
        date,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        description: description.trim() || null,
      });
      setLastAccountId(accountId);
    } catch (error) {
      setErrors([messageFor(error)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <fieldset {...fieldProps("type")}>
        <legend>Tipo</legend>
        {TYPES.map((t) => (
          <label key={t.value} className="mr-3">
            <input type="radio" name="type" value={t.value} checked={type === t.value}
              onChange={() => changeType(t.value)} />
            {t.label}
          </label>
        ))}
        {hint("type")}
      </fieldset>

      <div className="flex flex-col">
        <label className="flex flex-col">
          Monto
          <input inputMode="numeric" placeholder="35.000" value={amountText}
            onChange={(e) => setAmountText(e.target.value)} {...fieldProps("amount")} />
        </label>
        {hint("amount")}
      </div>

      <div className="flex flex-col">
        <label className="flex flex-col">
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} {...fieldProps("date")} />
        </label>
        {hint("date")}
      </div>

      <div className="flex flex-col">
        <label className="flex flex-col">
          Cuenta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} {...fieldProps("account_id")}>
            <option value="">Elige una cuenta</option>
            {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            {archivedAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} (archivada)</option>)}
          </select>
        </label>
        {hint("account_id")}
      </div>

      {type === "transfer" ? (
        <div className="flex flex-col">
          <label className="flex flex-col">
            Hacia la cuenta
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}
              {...fieldProps("to_account_id")}>
              <option value="">Elige la cuenta de destino</option>
              {accounts.data?.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
              {archivedAccounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name} (archivada)</option>
              ))}
            </select>
          </label>
          {hint("to_account_id")}
        </div>
      ) : (
        <div className="flex flex-col">
          <label className="flex flex-col">
            Categoría
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              {...fieldProps("category_id")}>
              <option value="">Elige una categoría</option>
              {kindCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {archivedCategories.map((c) => <option key={c.id} value={c.id}>{c.name} (archivada)</option>)}
            </select>
          </label>
          {hint("category_id")}
        </div>
      )}

      <label className="flex flex-col">
        Descripción
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {errors.length > 0 && (
        <div role="alert">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {noAccounts && (
        <p role="status">
          Primero crea una cuenta. <Link href="/mas/cuentas">Ir a cuentas</Link>
        </p>
      )}
      <FormError error={accounts.error ?? categories.error} />

      <div className="flex gap-2">
        <button type="submit" disabled={saving}>{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
