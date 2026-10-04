import { Suspense } from "react";
import { Brand } from "@/components/BrandMark";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Brand />
      <section className="card stack">
        <h1>Crea tu cuenta</h1>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </section>
    </main>
  );
}
