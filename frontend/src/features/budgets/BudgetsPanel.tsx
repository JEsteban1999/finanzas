"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth } from "@/lib/dates";
import { formatCOP, parseAmount } from "@/lib/money";
import { type BudgetStatusItem, useBudgetStatus, useSetBudget } from "./api";

export const LEVEL_LABELS: Record<BudgetStatusItem["level"], string> = {
  none: "Sin presupuesto",
  ok: "Vas bien",
  warning: "Cerca del límite",
  exceeded: "Te pasaste",
};

function BudgetRow({ item, month }: { item: BudgetStatusItem; month: string }) {
  const setBudget = useSetBudget();
  const [text, setText] = useState(item.budget > 0 ? formatCOP(item.budget).slice(1) : "");
  const [localError, setLocalError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    let amount = 0;
    if (text.trim() !== "" && text.trim() !== "0") {
      const parsed = parseAmount(text);
      if (!parsed.ok) return setLocalError(parsed.error);
      amount = parsed.value;
    }
    setLocalError(null);
    await setBudget.mutateAsync({ category_id: item.category_id, month, amount }).catch(() => undefined);
  }

  return (
    <li className="flex flex-col gap-1 border-b py-2" data-level={item.level}>
      <span>{item.category_name}</span>
      <span>
        {item.level === "none" ? `Gastado: ${formatCOP(item.spent)}` : `${formatCOP(item.spent)} de ${formatCOP(item.budget)}`}
      </span>
      <span>{LEVEL_LABELS[item.level]}</span>
      {item.committed > 0 && <span>Comprometido: {formatCOP(item.committed)}</span>}
      <form onSubmit={save} className="flex gap-2">
        <label className="flex flex-col">
          Presupuesto de {item.category_name}
          <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={setBudget.isPending}>Guardar</button>
      </form>
      <FormError error={localError ?? setBudget.error} />
    </li>
  );
}

export function BudgetsPanel() {
  const [month, setMonth] = useState(currentMonth());
  const status = useBudgetStatus(month);
  return (
    <div className="flex flex-col gap-3">
      <MonthPicker month={month} onChange={setMonth} />
      <p>El presupuesto aplica desde este mes en adelante.</p>
      <FormError error={status.error} />
      <ul>
        {status.data?.items.map((item) => (
          <BudgetRow key={`${month}-${item.category_id}`} item={item} month={month} />
        ))}
      </ul>
    </div>
  );
}
