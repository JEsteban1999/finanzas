import { MonthlySummary } from "@/features/dashboard/MonthlySummary";

export default function HomePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Inicio</h1>
      <MonthlySummary />
    </section>
  );
}
