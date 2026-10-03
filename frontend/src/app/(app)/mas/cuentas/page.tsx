import { AccountsManager } from "@/features/accounts/AccountsManager";

export default function AccountsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Cuentas</h1>
      <AccountsManager />
    </section>
  );
}
