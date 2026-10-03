"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { formatCOP, parseAmount } from "@/lib/money";
import { type BudgetStatus, type TransactionSaved, useCreateTransaction } from "./api";

function budgetMessage(status: BudgetStatus): string | null {
  const spent = formatCOP(status.spent);
  const budget = formatCOP(status.budget);
  if (status.level === "warning") {
    return `Llevas ${status.percent}% del presupuesto de ${status.category_name} (${spent} de ${budget}).`;
  }
  if (status.level === "exceeded") {
    return `Te pasaste del presupuesto de ${status.category_name}: ${spent} de ${budget}.`;
  }
  return null;
}

type Props = { result: TransactionSaved; onDone: () => void };

export function SaveFeedback({ result, onDone }: Props) {
  const create = useCreateTransaction();
  const suggestion = result.savings_suggestion;
  const [showSuggestion, setShowSuggestion] = useState(Boolean(suggestion));
  const [amountText, setAmountText] = useState(suggestion ? formatCOP(suggestion.amount).slice(1) : "");
  const [saved, setSaved] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const warning = result.budget_status ? budgetMessage(result.budget_status) : null;

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!suggestion) return;
    const parsed = parseAmount(amountText);
    if (!parsed.ok) return setLocalError(parsed.error);
    setLocalError(null);
    try {
      await create.mutateAsync({
        type: "transfer",
        amount: parsed.value,
        date: suggestion.date,
        account_id: suggestion.from_account_id,
        to_account_id: suggestion.to_account_id,
        source: "savings_rule",
      });
      setSaved(parsed.value);
      setShowSuggestion(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <p role="status">Movimiento guardado</p>
      {warning && <p role="alert">{warning}</p>}
      {showSuggestion && suggestion && (
        <form onSubmit={accept} className="flex flex-col gap-2">
          <p>Págate primero: ¿apartas {formatCOP(suggestion.amount)} para tu ahorro?</p>
          <label className="flex flex-col">
            Monto a apartar
            <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </label>
          <FormError error={localError ?? create.error} />
          <div className="flex gap-2">
            <button type="submit" disabled={create.isPending}>Apartar</button>
            <button type="button" onClick={() => setShowSuggestion(false)}>Ahora no</button>
          </div>
        </form>
      )}
      {saved !== null && <p>Listo, apartaste {formatCOP(saved)}.</p>}
      <button type="button" onClick={onDone}>Listo</button>
    </section>
  );
}
