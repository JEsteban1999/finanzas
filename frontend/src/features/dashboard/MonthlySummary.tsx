"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { useMonthlySummary } from "./api";
import { formatRate } from "./format";

export function MonthlySummary() {
  const [month, setMonth] = useState(currentMonth());
  const summary = useMonthlySummary(month);
  const data = summary.data;
  const maxCategory = Math.max(1, ...(data?.expense_by_category.map((c) => c.amount) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <MonthPicker month={month} onChange={setMonth} />
      <FormError error={summary.error} />
      {data && (
        <>
          <section aria-label="Resumen del mes">
            <dl className="grid grid-cols-2 gap-2">
              <dt>Ingresos</dt><dd>{formatCOP(data.income)}</dd>
              <dt>Gastos</dt><dd>{formatCOP(data.expense)}</dd>
              <dt>Ahorro</dt><dd>{formatCOP(data.savings)}</dd>
              <dt>Balance</dt><dd>{formatCOP(data.balance)}</dd>
              <dt>Tasa de ahorro</dt><dd>{formatRate(data.savings_rate)}</dd>
            </dl>
          </section>

          {data.savings_reminder && (
            <p role="note">
              Recibiste tu salario y aún no apartaste tu ahorro. <Link href="/registrar">Registrar ahorro</Link>
            </p>
          )}

          {data.pending.count > 0 && (
            <Link href="/movimientos">
              {data.pending.count === 1 ? "1 movimiento por confirmar" : `${data.pending.count} movimientos por confirmar`}
            </Link>
          )}

          <section aria-label="Gasto por categoría">
            <h2>Gasto por categoría</h2>
            <ul>
              {data.expense_by_category.map((c) => (
                <li key={c.category_id} className="flex flex-col">
                  <span className="flex justify-between"><span>{c.name}</span><span>{formatCOP(c.amount)}</span></span>
                  <span aria-hidden className="block h-1 bg-current" style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Presupuestos">
            <h2>Presupuestos</h2>
            <ul>
              {data.budgets.filter((b) => b.level !== "none").map((b) => (
                <li key={b.category_id} data-level={b.level}>
                  {`${b.category_name}: ${formatCOP(b.spent)} de ${formatCOP(b.budget)} (${b.percent}%)`}
                </li>
              ))}
            </ul>
            <Link href="/presupuestos">Ver presupuestos</Link>
          </section>

          <section aria-label="Cuentas">
            <h2>Cuentas</h2>
            <ul>
              {data.accounts.map((a) => (
                <li key={a.id} className="flex justify-between"><span>{a.name}</span><span>{formatCOP(a.balance)}</span></li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
