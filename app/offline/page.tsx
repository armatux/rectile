export const metadata = { title: "offline" };

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center gap-4 pt-32 text-center">
      <span
        className="font-display text-[44px] font-bold text-bright"
        style={{ textShadow: "0 0 30px rgb(150 110 255 / 0.45)" }}
      >
        LINK · DOWN
      </span>
      <p className="text-[11px] tracking-[0.24em] text-ink/50">
        NO CONNECTION TO CORE
      </p>
      <p className="max-w-sm text-[11px] leading-relaxed text-ink/40">
        no live data, but every project page is cached for offline reading —
        go back and keep browsing. anything you log or change while offline
        is queued and syncs the moment the link returns.
      </p>
    </div>
  );
}
