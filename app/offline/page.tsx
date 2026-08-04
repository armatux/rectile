export const metadata = { title: "offline" };

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center gap-4 pt-32 text-center">
      <span className="font-display text-[22px] font-bold tracking-[-0.02em] text-bright">
        You&apos;re offline
      </span>
      <p className="text-[13px] text-ink/60">No connection right now.</p>
      <p className="max-w-sm text-[12px] leading-relaxed text-ink/50">
        No live data, but every project page is cached for offline reading —
        go back and keep browsing. Anything you log or change while offline
        is queued and syncs the moment you&apos;re back online.
      </p>
    </div>
  );
}
