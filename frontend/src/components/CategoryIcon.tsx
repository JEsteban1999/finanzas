import {
  ArrowLeftRight,
  Briefcase,
  Bus,
  HeartPulse,
  House,
  Lightbulb,
  PartyPopper,
  Repeat,
  ShoppingBasket,
  Sparkles,
  Tag,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  salario: Briefcase,
  "ingreso extra": Sparkles,
  comida: ShoppingBasket,
  transporte: Bus,
  vivienda: House,
  servicios: Lightbulb,
  suscripciones: Repeat,
  salud: HeartPulse,
  ocio: PartyPopper,
};

/** Ícono de categoría en una pastilla suave; las categorías propias usan una etiqueta genérica. */
export function CategoryIcon({ name, transfer = false }: { name?: string | null; transfer?: boolean }) {
  const Icon = transfer ? ArrowLeftRight : (ICONS[(name ?? "").trim().toLowerCase()] ?? Tag);
  return (
    <span className="chip" aria-hidden>
      <Icon size={18} strokeWidth={2.5} />
    </span>
  );
}
