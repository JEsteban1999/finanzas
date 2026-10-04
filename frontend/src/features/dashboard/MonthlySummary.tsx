"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { LEVEL_LABELS } from "@/features/budgets/BudgetsPanel";
import { currentMonth } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { useMonthlySummary } from "./api";
import { formatRate } from "./format";

export function MonthlySummary() {
  const [month, setMonth] = useState(currentMonth());
  const summary = useMonthlySummary(month);
  const data = summary.data;
  const maxCategory = Math.max(1, ...(data?.expense_by_category.map((c) => c.amount) ?? [1]));
  const budgets = data?.budgets.filter((b) => b.level !== "none") ?? [];

  return (
    <div className="page">
      <MonthPicker month={month} onChange={setMonth} />
      <FormError error={summary.error} />
      {summary.isPending && <p className="muted">Cargando tu mes…</p>}
      {data && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="page">
          <section aria-label="Resumen del mes" className="card card-tint stack">
            <h2>Tu mes</h2>
            <p className="text-[1.35rem] leading-snug font-semibold">
              Te entraron <strong className="money money-in">{formatCOP(data.income)}</strong> y gastaste{" "}
              <strong className="money">{formatCOP(data.expense)}</strong>. Apartaste{" "}
              <strong className="money">{formatCOP(data.savings)}</strong> para tu ahorro.
            </p>
            <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--line)] pt-3 font-bold text-[var(--ink-2)]">
              <span>
                Balance <strong className="money text-[var(--ink)]">{formatCOP(data.balance)}</strong>
              </span>
              <span>
                Tasa de ahorro <strong className="money text-[var(--ink)]">{formatRate(data.savings_rate)}</strong>
              </span>
            </p>
          </section>

          {data.savings_reminder && (
            <p role="note">
              Recibiste tu salario y aún no apartaste tu ahorro. <Link href="/registrar">Registrar ahorro</Link>
            </p>
          )}

          {data.pending.count > 0 && (
            <Link href="/movimientos" className="card link-row !border-0 !px-5">
              {data.pending.count === 1 ? "1 movimiento por confirmar" : `${data.pending.count} movimientos por confirmar`}
              <ChevronRight aria-hidden size={22} strokeWidth={2.75} />
            </Link>
          )}

          <section aria-label="Gasto por categoría" className="card stack">
            <h2>Gasto por categoría</h2>
            {data.expense_by_category.length === 0 ? (
              <p className="muted">Aún no hay gastos este mes.</p>
            ) : (
              <ul className="stack">
                {data.expense_by_category.map((c) => (
                  <li key={c.category_id} className="flex items-center gap-3">
                    <CategoryIcon name={c.name} />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span className="row-line font-bold">
                        <span>{c.name}</span>
                        <span className="money">{formatCOP(c.amount)}</span>
                      </span>
                      <span aria-hidden className="bar">
                        <span style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          </div>
          <div className="page">
          <section aria-label="Presupuestos" className="card stack">
            <h2>Presupuestos</h2>
            {budgets.length === 0 ? (
              <p className="muted">No tienes presupuestos activos este mes.</p>
            ) : (
              <ul className="stack">
                {budgets.map((b) => (
                  <li key={b.category_id} data-level={b.level} className="flex flex-col gap-1.5 font-bold">
                    <span className="row-line">
                      <span>{`${b.category_name}: ${formatCOP(b.spent)} de ${formatCOP(b.budget)} (${b.percent}%)`}</span>
                      <span className="text-sm font-extrabold whitespace-nowrap" data-level={b.level}>{LEVEL_LABELS[b.level]}</span>
                    </span>
                    <span aria-hidden className="bar" data-level={b.level}>
                      <span style={{ width: `${Math.min(100, b.percent ?? 0)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/presupuestos">Ver presupuestos</Link>
          </section>

          <section aria-label="Cuentas" className="card stack">
            <h2>Cuentas</h2>
            <ul>
              {data.accounts.map((a) => (
                <li key={a.id} className="row row-line">
                  <span className="font-bold">{a.name}</span>
                  <span className={`money ${a.balance < 0 ? "text-[var(--bad)]" : ""}`}>{formatCOP(a.balance)}</span>
                </li>
              ))}
            </ul>
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
