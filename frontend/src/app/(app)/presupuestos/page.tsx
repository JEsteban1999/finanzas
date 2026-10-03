import { BudgetsPanel } from "@/features/budgets/BudgetsPanel";

export default function BudgetsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Presupuestos</h1>
      <BudgetsPanel />
    </section>
  );
}
