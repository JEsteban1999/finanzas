import { Greeting } from "@/features/dashboard/Greeting";
import { MonthlySummary } from "@/features/dashboard/MonthlySummary";

export default function HomePage() {
  return (
    <section className="page">
      <div className="flex flex-col gap-1">
        <h1>Inicio</h1>
        <Greeting />
      </div>
      <MonthlySummary />
    </section>
  );
}
