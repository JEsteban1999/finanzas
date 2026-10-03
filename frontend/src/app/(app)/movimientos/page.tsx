import { PendingList } from "@/features/transactions/PendingList";
import { TransactionList } from "@/features/transactions/TransactionList";

export default function MovementsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Movimientos</h1>
      <PendingList />
      <TransactionList />
    </section>
  );
}
