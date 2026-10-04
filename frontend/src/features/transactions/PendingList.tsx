"use client";

import { useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { shortDate } from "@/lib/dates";
import {
  type Transaction, type TransactionSaved,
  useConfirmTransaction, useDeleteTransaction, useTransactions,
} from "./api";
import { SaveFeedback } from "./SaveFeedback";
import { TransactionForm } from "./TransactionForm";
import { describeTransaction, signedAmount, useNames } from "./TransactionList";

function PendingRow({
  txn, names, onConfirmed,
}: { txn: Transaction; names: ReturnType<typeof useNames>; onConfirmed: (result: TransactionSaved) => void }) {
  const [confirming, setConfirming] = useState(false);
  const confirm = useConfirmTransaction();
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
      {confirming ? (
        <TransactionForm
          initial={txn}
          submitLabel="Confirmar movimiento"
          onCancel={() => setConfirming(false)}
          onSubmit={async (values) => {
            onConfirmed(await confirm.mutateAsync({ id: txn.id, ...values }));
            setConfirming(false);
          }}
        />
      ) : (
        <div className="actions pt-1">
          <button type="button" onClick={() => setConfirming(true)}>Confirmar</button>
          <ConfirmButton label="Descartar" confirmLabel="Sí, descartar" onConfirm={() => remove.mutate(txn.id)} />
        </div>
      )}
      <FormError error={remove.error} />
    </li>
  );
}

export function PendingList() {
  const names = useNames();
  const list = useTransactions({ status: "pending" });
  const [result, setResult] = useState<TransactionSaved | null>(null);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0 && !result) return <FormError error={list.error} />;
  return (
    <section className="stack">
      {result && <SaveFeedback result={result} onDone={() => setResult(null)} />}
      {items.length > 0 && (
        <>
          <h2>Por confirmar</h2>
          <ul className="card !py-1 ring-2 ring-[var(--warn-soft)]">
            {items.map((txn) => <PendingRow key={txn.id} txn={txn} names={names} onConfirmed={setResult} />)}
          </ul>
        </>
      )}
    </section>
  );
}
