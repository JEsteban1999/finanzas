"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { currentMonth, monthRange, shortDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import {
  type Transaction, type TransactionType,
  useDeleteTransaction, useTransactions, useUpdateTransaction,
} from "./api";
import { TransactionForm } from "./TransactionForm";

export function signedAmount(txn: Pick<Transaction, "type" | "amount">): string {
  return txn.type === "expense" ? formatCOP(-txn.amount) : formatCOP(txn.amount);
}

export function useNames() {
  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const account = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name ?? "";
  const category = (id: string | null) => categories.data?.find((c) => c.id === id)?.name ?? "";
  return { account, category, accounts: accounts.data ?? [], categories: categories.data ?? [] };
}

export function describeTransaction(txn: Transaction, names: ReturnType<typeof useNames>) {
  const title = txn.description || (txn.type === "transfer" ? "Transferencia" : names.category(txn.category_id));
  const detail =
    txn.type === "transfer"
      ? `${names.account(txn.account_id)} → ${names.account(txn.to_account_id)}`
      : `${names.category(txn.category_id)} · ${names.account(txn.account_id)}`;
  return { title, detail };
}

function TransactionRow({ txn, names }: { txn: Transaction; names: ReturnType<typeof useNames> }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const { title, detail } = describeTransaction(txn, names);

  return (
    <li className="row">
      <div className="flex items-start gap-3">
        <CategoryIcon name={names.category(txn.category_id)} transfer={txn.type === "transfer"} />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="row-line">
            <span className="font-bold">{title}</span>
            <span className={`money ${txn.type === "income" ? "money-in" : ""}`}>{signedAmount(txn)}</span>
          </div>
          <span className="text-sm font-semibold text-[var(--ink-2)]">{shortDate(txn.date)} · {detail}</span>
        </div>
      </div>
      {editing ? (
        <TransactionForm
          initial={txn}
          submitLabel="Guardar cambios"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: txn.id, ...values });
            setEditing(false);
          }}
        />
      ) : (
        <div className="actions pt-1">
          <button type="button" onClick={() => setEditing(true)}>Editar</button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(txn.id)} />
        </div>
      )}
      <FormError error={remove.error} />
    </li>
  );
}

export function TransactionList() {
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState<TransactionType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const names = useNames();
  const range = monthRange(month);
  const list = useTransactions({
    from: range.from,
    to: range.to,
    status: "confirmed",
    type: type || undefined,
    category_id: categoryId || undefined,
    account_id: accountId || undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="page">
      <MonthPicker month={month} onChange={setMonth} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as TransactionType | "")}>
            <option value="">Todos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
            <option value="transfer">Transferencias</option>
          </select>
        </label>
        <label className="flex flex-col">
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {names.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          Cuenta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas</option>
            {names.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <FormError error={list.error} />
      {list.isSuccess && items.length === 0 && <p>No hay movimientos en este mes.</p>}
      {items.length > 0 && (
        <ul className="card !py-1">{items.map((txn) => <TransactionRow key={txn.id} txn={txn} names={names} />)}</ul>
      )}
      {list.hasNextPage && (
        <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          Cargar más
        </button>
      )}
    </section>
  );
}
