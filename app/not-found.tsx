import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 pt-32 text-center">
      <span
        className="font-display text-[44px] font-bold text-bright"
        style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
      >
        404
      </span>
      <p className="text-[11px] tracking-[0.24em] text-ink/50">
        TARGET NOT IN ROSTER
      </p>
      <Link
        href="/"
        className="mt-2 flex min-h-[44px] items-center border border-line px-4 text-[10px] font-bold tracking-[0.24em] text-accent hover:border-line-strong hover:text-bright"
      >
        ◂ RETURN TO GRID
      </Link>
    </div>
  );
}
