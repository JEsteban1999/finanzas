"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import type { TransactionType } from "@/features/transactions/api";
import { signedAmount } from "@/features/transactions/TransactionList";
import { shortDate, todayISO } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import {
  type RecurringTemplate,
  useCreateRecurring, useDeleteRecurring, useRecurring, useUpdateRecurring,
} from "./api";

function TemplateRow({ template, title }: { template: RecurringTemplate; title: string }) {
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{title}</span>
        <span>{signedAmount(template)}</span>
      </div>
      <span>{`Día ${template.day_of_month} de cada mes · Próximo: ${shortDate(template.next_run_date)}`}</span>
      {!template.active && <span>Pausada</span>}
      <div className="flex gap-2">
        <button type="button" onClick={() => update.mutate({ id: template.id, active: !template.active })}>
          {template.active ? "Pausar" : "Reanudar"}
        </button>
        <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(template.id)} />
      </div>
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

function NewTemplateForm() {
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateRecurring();
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState("1");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    const dayNumber = Number(day);
    if (!parsed.ok) return setLocalError(parsed.error);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return setLocalError("El día debe estar entre 1 y 31");
    if (!accountId) return setLocalError("Elige una cuenta");
    if (type === "transfer" && !toAccountId) return setLocalError("Elige la cuenta de destino");
    if (type !== "transfer" && !categoryId) return setLocalError("Elige una categoría");
    setLocalError(null);
    try {
      await create.mutateAsync({
        type,
        amount: parsed.value,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        description: description.trim() || null,
        day_of_month: dayNumber,
        start_date: startDate,
        end_date: endDate || null,
      });
      setAmount("");
      setDescription("");
    } catch {
      // Error visible abajo; se conservan los valores.
    }
  }

  return (
    <form aria-label="Nueva plantilla" onSubmit={onSubmit} className="flex flex-col gap-2">
      <h2>Nueva plantilla</h2>
      <label className="flex flex-col">
        Tipo
        <select value={type} onChange={(e) => { setType(e.target.value as TransactionType); setCategoryId(""); }}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Transferencia</option>
        </select>
      </label>
      <label className="flex flex-col">
        Monto
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Cuenta
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {type === "transfer" ? (
        <label className="flex flex-col">
          Hacia la cuenta
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Elige la cuenta de destino</option>
            {accounts.data?.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col">
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Elige una categoría</option>
            {categories.data?.filter((c) => c.kind === type).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col">
        Descripción
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Día del mes
        <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Desde
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Hasta (opcional)
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <FormError error={localError ?? create.error} />
      <button type="submit" disabled={create.isPending}>Agregar plantilla</button>
    </form>
  );
}

export function RecurringManager() {
  const templates = useRecurring();
  const categories = useCategories(true);
  const titleOf = (t: RecurringTemplate) =>
    t.description ||
    (t.type === "transfer" ? "Transferencia" : categories.data?.find((c) => c.id === t.category_id)?.name) ||
    "Recurrente";

  return (
    <div className="flex flex-col gap-4">
      <FormError error={templates.error} />
      <ul>{templates.data?.map((t) => <TemplateRow key={t.id} template={t} title={titleOf(t)} />)}</ul>
      <NewTemplateForm />
    </div>
  );
}
