export function LabelChip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-flex flex-none items-center gap-1 border border-line px-1 py-px text-[8px] font-semibold tracking-[0.12em]"
      style={{ color: color ?? "var(--color-dim)" }}
    >
      <span
        className="h-1 w-1 rounded-full"
        style={{ background: color ?? "var(--color-dim)" }}
        aria-hidden
      />
      {label.toUpperCase()}
    </span>
  );
}
