"use client";

import { useRouter } from "next/navigation";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";
import { useLogout, useMe } from "@/features/auth/api";

export default function AccountPage() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  async function onLogout() {
    await logout.mutateAsync().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <section className="flex flex-col gap-4">
      <h1>Mi cuenta</h1>
      {me.data && <p>{me.data.email}</p>}
      <h2>Cambiar contraseña</h2>
      <ChangePasswordForm />
      <button type="button" onClick={onLogout} disabled={logout.isPending}>Cerrar sesión</button>
    </section>
  );
}
