import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 pt-32 text-center">
      <span className="font-display text-[44px] font-semibold tracking-[-0.03em] text-bright">
        404
      </span>
      <p className="text-[13px] text-ink/60">
        This page doesn&apos;t exist.
      </p>
      <Link href="/" className="btn-tint mt-2 px-5" style={{ minHeight: 44 }}>
        Back to projects
      </Link>
    </div>
  );
}
