import { RecurringManager } from "@/features/recurring/RecurringManager";

export default function RecurringPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Recurrentes</h1>
      <RecurringManager />
    </section>
  );
}
