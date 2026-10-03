"use client";

import { useState } from "react";
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

function PendingRow({ txn, names }: { txn: Transaction; names: ReturnType<typeof useNames> }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<TransactionSaved | null>(null);
  const confirm = useConfirmTransaction();
  const remove = useDeleteTransaction();
  const { title, detail } = describeTransaction(txn, names);

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{title}</span>
        <span>{signedAmount(txn)}</span>
      </div>
      <span>{shortDate(txn.date)} · {detail}</span>
      {result ? (
        <SaveFeedback result={result} onDone={() => setResult(null)} />
      ) : confirming ? (
        <TransactionForm
          initial={txn}
          submitLabel="Confirmar movimiento"
          onCancel={() => setConfirming(false)}
          onSubmit={async (values) => {
            setResult(await confirm.mutateAsync({ id: txn.id, ...values }));
          }}
        />
      ) : (
        <div className="flex gap-2">
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
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) return <FormError error={list.error} />;
  return (
    <section className="flex flex-col gap-2">
      <h2>Por confirmar</h2>
      <ul>{items.map((txn) => <PendingRow key={txn.id} txn={txn} names={names} />)}</ul>
    </section>
  );
}
