"use client";

import { addMonths, monthLabel } from "@/lib/dates";

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => onChange(addMonths(month, -1))}>Mes anterior</button>
      <span>{monthLabel(month)}</span>
      <button type="button" onClick={() => onChange(addMonths(month, 1))}>Mes siguiente</button>
    </div>
  );
}
