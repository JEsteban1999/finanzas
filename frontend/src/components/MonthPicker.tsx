"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthLabel } from "@/lib/dates";

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Mes anterior"
        className="btn-soft size-12 !p-0"
        onClick={() => onChange(addMonths(month, -1))}
      >
        <ChevronLeft aria-hidden size={24} strokeWidth={2.75} />
      </button>
      <span className="text-lg font-extrabold first-letter:uppercase">{monthLabel(month)}</span>
      <button
        type="button"
        aria-label="Mes siguiente"
        className="btn-soft size-12 !p-0"
        onClick={() => onChange(addMonths(month, 1))}
      >
        <ChevronRight aria-hidden size={24} strokeWidth={2.75} />
      </button>
    </div>
  );
}
