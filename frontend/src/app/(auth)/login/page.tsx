import { Suspense } from "react";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1>Finanzas</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
