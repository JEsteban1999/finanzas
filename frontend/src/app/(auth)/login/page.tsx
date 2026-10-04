import { Suspense } from "react";
import { Brand } from "@/components/BrandMark";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Brand />
      <section className="card stack">
        <h1>Hola de nuevo</h1>
        <p className="muted">Entra para ver cómo va tu mes.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
