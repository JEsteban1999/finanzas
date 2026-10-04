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
    <section className="page">
      <h1>Mi cuenta</h1>
      {me.data && <p className="muted font-bold">{me.data.email}</p>}
      <div className="card stack">
        <h2>Cambiar contraseña</h2>
        <ChangePasswordForm />
      </div>
      <button type="button" className="self-start" onClick={onLogout} disabled={logout.isPending}>Cerrar sesión</button>
    </section>
  );
}
