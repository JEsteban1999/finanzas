import { CompareView } from "@/features/dashboard/CompareView";

export default function ComparePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Comparar meses</h1>
      <CompareView />
    </section>
  );
}
