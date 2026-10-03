import { SavingsRuleForm } from "@/features/savings/SavingsRuleForm";

export default function SavingsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Págate primero</h1>
      <SavingsRuleForm />
    </section>
  );
}
