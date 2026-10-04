"use client";

import { useState } from "react";
import { FormError } from "@/components/FormError";
import { currentMonth, monthLabel } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { useCompare } from "./api";
import { formatDelta } from "./format";

export function CompareView() {
  const [months, setMonths] = useState(6);
  const compare = useCompare(months, currentMonth());
  const data = compare.data;

  return (
    <div className="page">
      <label className="flex flex-col">
        Meses
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={3}>3</option>
          <option value={6}>6</option>
          <option value={12}>12</option>
        </select>
      </label>
      <FormError error={compare.error} />
      {data && (
        <>
          <div className="card overflow-x-auto !p-0"><table className="data-table">
            <thead>
              <tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Ahorro</th></tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td>{formatCOP(m.income)}</td>
                  <td>{formatCOP(m.expense)}</td>
                  <td>{formatCOP(m.savings)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <section aria-label="Cambios por categoría" className="card stack">
            <h2>Frente al mes anterior</h2>
            <ul>
              {data.categories.map((c) => (
                <li key={c.category_id}>{`${c.name}: ${formatCOP(c.current)} (${formatDelta(c.delta_pct)})`}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
