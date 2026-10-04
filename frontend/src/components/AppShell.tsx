"use client";

import { Ellipsis, House, ListOrdered, Plus, Target, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./BrandMark";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/registrar", label: "Registrar" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/mas", label: "Más" },
] as const;

const ICONS: Record<(typeof NAV_ITEMS)[number]["href"], LucideIcon> = {
  "/": House,
  "/movimientos": ListOrdered,
  "/registrar": Plus,
  "/presupuestos": Target,
  "/mas": Ellipsis,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-36 lg:max-w-5xl lg:pt-10 lg:pr-10 lg:pb-16 lg:pl-72">
        {children}
      </main>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgb(60_36_14/0.35)] lg:inset-y-0 lg:right-auto lg:w-60 lg:pb-0 lg:shadow-[10px_0_30px_-20px_rgb(60_36_14/0.35)]"
      >
        <div className="hidden items-center gap-2 px-6 pt-8 pb-6 lg:flex">
          <BrandMark size={36} />
          <span className="text-2xl font-black tracking-tight">Bolsillo</span>
        </div>
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-2 pt-2 pb-2 lg:flex lg:max-w-none lg:flex-col lg:items-stretch lg:gap-1 lg:px-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = ICONS[item.href];
            const isPrimary = item.href === "/registrar";
            const tone = active ? "font-extrabold text-[var(--mora)]" : "font-bold text-[var(--ink-2)]";
            return (
              <li key={item.href} className={`flex justify-center lg:block ${isPrimary ? "lg:order-first lg:mb-4" : ""}`}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    isPrimary
                      ? `group flex flex-col items-center justify-end gap-1 text-xs no-underline lg:flex-row lg:justify-start lg:gap-3 lg:rounded-full lg:bg-[var(--mora)] lg:px-5 lg:py-3 lg:text-base lg:font-extrabold lg:text-[var(--mora-ink)] lg:shadow-[0_10px_22px_-12px_var(--mora)] lg:transition-transform lg:active:scale-[0.98] ${tone}`
                      : `flex min-h-12 flex-col items-center justify-end gap-1 rounded-2xl px-2 pb-0.5 text-xs no-underline transition-transform duration-150 active:scale-95 lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base ${tone} ${
                          active ? "lg:bg-[var(--mora-soft)]" : "lg:hover:bg-[var(--surface-2)]"
                        }`
                  }
                >
                  {isPrimary ? (
                    <span className="-mt-7 flex size-15 items-center justify-center rounded-full bg-[var(--mora)] text-[var(--mora-ink)] shadow-[0_12px_24px_-10px_var(--mora)] transition-transform duration-150 group-active:scale-95 lg:mt-0 lg:size-auto lg:bg-transparent lg:shadow-none">
                      <Icon aria-hidden size={30} strokeWidth={2.75} className="lg:size-6" />
                    </span>
                  ) : (
                    <Icon aria-hidden size={24} strokeWidth={active ? 2.75 : 2.25} />
                  )}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
