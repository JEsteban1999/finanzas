import { RegisterFlow } from "@/features/quick-entry/RegisterFlow";

export default function RegisterPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Registrar</h1>
      <RegisterFlow />
    </section>
  );
}
