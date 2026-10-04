"use client";

import { useState, type FormEvent } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
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
    <li className="row" data-level={item.level}>
      <span className="row-line">
        <span className="flex items-center gap-3 font-bold"><CategoryIcon name={item.category_name} />{item.category_name}</span>
        <span className="text-sm font-extrabold" data-level={item.level}>{LEVEL_LABELS[item.level]}</span>
      </span>
      <span className="font-semibold text-[var(--ink-2)]">
        {item.level === "none" ? `Gastado: ${formatCOP(item.spent)}` : `${formatCOP(item.spent)} de ${formatCOP(item.budget)}`}
      </span>
      {item.level !== "none" && (
        <span aria-hidden className="bar" data-level={item.level}>
          <span style={{ width: `${Math.min(100, item.percent ?? 0)}%` }} />
        </span>
      )}
      {item.committed > 0 && <span className="text-sm font-semibold text-[var(--ink-2)]">Comprometido: {formatCOP(item.committed)}</span>}
      <form onSubmit={save} className="flex items-end gap-2 pt-1">
        <label className="flex-1">
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
    <div className="page">
      <MonthPicker month={month} onChange={setMonth} />
      <p>El presupuesto aplica desde este mes en adelante.</p>
      <FormError error={status.error} />
      <ul className="card !py-1 lg:grid lg:grid-cols-2 lg:gap-x-8">
        {status.data?.items.map((item) => (
          <BudgetRow key={`${month}-${item.category_id}`} item={item} month={month} />
        ))}
      </ul>
    </div>
  );
}
