const TIME_ZONE = "America/Bogota";
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

export function currentMonth(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}

function split(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  return [y, m];
}

export function addMonths(month: string, n: number): string {
  const [y, m] = split(month);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = split(month);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function monthLabel(month: string): string {
  const [y, m] = split(month);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
