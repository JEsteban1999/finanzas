import { ChevronRight } from "lucide-react";
import Link from "next/link";

const LINKS = [
  { href: "/mas/cuentas", label: "Cuentas", hint: "Efectivo, débito, ahorro y tarjetas" },
  { href: "/mas/categorias", label: "Categorías", hint: "En qué gastas y de dónde te entra" },
  { href: "/mas/recurrentes", label: "Recurrentes", hint: "Arriendo, servicios, suscripciones" },
  { href: "/mas/ahorro", label: "Págate primero", hint: "Aparta tu ahorro al recibir el salario" },
  { href: "/comparar", label: "Comparar meses", hint: "Cómo vas frente a meses anteriores" },
  { href: "/mas/cuenta", label: "Mi cuenta", hint: "Contraseña y sesión" },
];

export default function MorePage() {
  return (
    <section className="page">
      <h1>Más</h1>
      <ul className="card !py-1">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="link-row">
              <span className="flex flex-col">
                {link.label}
                <span className="text-sm font-semibold text-[var(--ink-2)]">
                  {link.hint}
                </span>
              </span>
              <ChevronRight aria-hidden size={22} strokeWidth={2.75} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
