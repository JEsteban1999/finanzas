"use client";

import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
