"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { formatCOP, parseAmount, type ParsedAmount } from "@/lib/money";
import {
  ACCOUNT_TYPE_LABELS, type Account, type AccountType,
  useAccounts, useCreateAccount, useDeleteAccount, useUpdateAccount,
} from "./api";

export function parseSignedAmount(input: string): ParsedAmount {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  const negative = trimmed.startsWith("-");
  const parsed = parseAmount(negative ? trimmed.slice(1) : trimmed);
  if (!parsed.ok) return parsed;
  return { ok: true, value: negative ? -parsed.value : parsed.value };
}

function AccountRow({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.name);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: account.id, name });
      setRenaming(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <li className="row">
      <div className="row-line font-bold">
        <span>{account.name}</span>
        <span>{formatCOP(account.balance)}</span>
      </div>
      <span>{ACCOUNT_TYPE_LABELS[account.type]}{account.archived ? " · archivada" : ""}</span>
      {renaming ? (
        <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
          <label>
            Nuevo nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">Guardar</button>
          <button type="button" onClick={() => setRenaming(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="actions pt-1">
          <button type="button" onClick={() => setRenaming(true)}>Renombrar</button>
          <button type="button" onClick={() => update.mutate({ id: account.id, archived: !account.archived })}>
            {account.archived ? "Restaurar" : "Archivar"}
          </button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(account.id)} />
        </div>
      )}
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

export function AccountsManager() {
  const [showArchived, setShowArchived] = useState(false);
  const accounts = useAccounts(showArchived);
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("debit");
  const [initial, setInitial] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSignedAmount(initial);
    if (!parsed.ok) return setLocalError(parsed.error);
    setLocalError(null);
    try {
      await create.mutateAsync({ name, type, initial_balance: parsed.value });
      setName("");
      setInitial("");
    } catch {
      // Error visible abajo; los valores se conservan.
    }
  }

  return (
    <div className="page">
      <label>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Mostrar archivadas
      </label>
      <FormError error={accounts.error} />
      <ul className="card !py-1">{accounts.data?.map((a) => <AccountRow key={a.id} account={a} />)}</ul>
      <form onSubmit={onCreate} className="card stack">
        <h2>Nueva cuenta</h2>
        <label className="flex flex-col">
          Nombre de la cuenta
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Saldo inicial
          <input inputMode="numeric" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value)} />
        </label>
        <FormError error={localError ?? create.error} />
        <button type="submit" disabled={create.isPending}>Agregar cuenta</button>
      </form>
    </div>
  );
}
