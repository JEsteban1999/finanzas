/** Marca de Bolsillo: un bolsillo de bordes suaves con una moneda asomando. */
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <circle cx="40" cy="15" r="10" fill="var(--bar)" />
      <circle cx="40" cy="15" r="5.5" fill="none" stroke="var(--surface)" strokeWidth="2.5" />
      <path
        d="M10 20h44v18c0 12-9.8 20-22 20S10 50 10 38V20z"
        fill="var(--mora)"
      />
      <path
        d="M10 20h44"
        stroke="var(--mora-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 6"
        opacity="0.75"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <span className="text-3xl font-black tracking-tight">Bolsillo</span>
    </div>
  );
}
