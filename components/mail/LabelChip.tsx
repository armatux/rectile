export function LabelChip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex flex-none items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium"
      style={{ color: color ?? "var(--color-dim)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color ?? "var(--color-dim)" }}
        aria-hidden
      />
      {label}
    </span>
  );
}
