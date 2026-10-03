import { Suspense } from "react";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1>Crea tu cuenta</h1>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
