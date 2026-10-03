const MAX_AMOUNT = 1_000_000_000_000;
const INVALID = "Usa solo pesos enteros, por ejemplo 35.000";

export function formatCOP(amount: number): string {
  const digits = Math.abs(Math.trunc(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}$${digits}`;
}

export type ParsedAmount = { ok: true; value: number } | { ok: false; error: string };

export function parseAmount(input: string): ParsedAmount {
  const cleaned = input.replace(/[\s$]/g, "");
  if (cleaned === "") return { ok: false, error: "Escribe el monto" };
  const plain = /^\d+$/.test(cleaned);
  const grouped = /^\d{1,3}(\.\d{3})+$/.test(cleaned);
  if (!plain && !grouped) return { ok: false, error: INVALID };
  const value = Number(cleaned.replace(/\./g, ""));
  if (value <= 0) return { ok: false, error: "El monto debe ser mayor que 0" };
  if (value > MAX_AMOUNT) return { ok: false, error: "El monto es demasiado grande" };
  return { ok: true, value };
}
