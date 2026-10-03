"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/registrar", label: "Registrar" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/mas", label: "Más" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 p-4 pb-24">{children}</main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 border-t bg-white">
        <ul className="mx-auto flex max-w-xl justify-between p-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
