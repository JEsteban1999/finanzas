import Link from "next/link";

const LINKS = [
  { href: "/mas/cuentas", label: "Cuentas" },
  { href: "/mas/categorias", label: "Categorías" },
  { href: "/mas/recurrentes", label: "Recurrentes" },
  { href: "/mas/ahorro", label: "Págate primero" },
  { href: "/comparar", label: "Comparar meses" },
  { href: "/mas/cuenta", label: "Mi cuenta" },
];

export default function MorePage() {
  return (
    <section className="flex flex-col gap-3">
      <h1>Más</h1>
      <ul className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
