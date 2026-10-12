"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ClockDisplay() {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0, 5));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[12px] font-medium text-ink/70 tabular-nums">
      {time}
    </span>
  );
}

/** Browser-style controls — the installed PWA window has no chrome, so
 *  back/forward/reload need to live in the app itself. */
function NavControls() {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-[13px] text-ink/60 transition-colors hover:bg-white/10 hover:text-bright";
  return (
    <span className="flex items-center gap-1.5">
      <button onClick={() => history.back()} className={btn} aria-label="back">
        ‹
      </button>
      <button onClick={() => history.forward()} className={btn} aria-label="forward">
        ›
      </button>
      <button onClick={() => location.reload()} className={btn} aria-label="reload">
        ↻
      </button>
    </span>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-medium transition-colors ${
        active
          ? "text-bright"
          : "text-ink/55 hover:text-bright"
      }`}
    >
      {label}
    </Link>
  );
}

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/6 px-4 transition-colors focus-within:bg-white/10 sm:max-w-[300px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-none text-ink/45"
        aria-hidden
      >
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="min-h-[38px] w-full min-w-0 bg-transparent text-[13px] text-bright placeholder:text-ink/35 focus:outline-none"
        enterKeyHint="search"
      />
    </form>
  );
}

/** Routes rendered as full-screen HUD (their chrome replaces the top bar). */
const HUD_ROUTES = new Set(["/", "/calendar", "/mail"]);

export function TopBar() {
  const pathname = usePathname();
  if (HUD_ROUTES.has(pathname)) return null;
  return (
    <header className="safe-x safe-top sticky top-0 z-30 border-b border-line bg-void/70 backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <Link href="/" className="flex min-h-[44px] items-center pr-1">
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-bright">
            Scala
          </span>
        </Link>
        <NavControls />
        <nav className="flex items-center">
          <NavLink href="/" label="Home" />
          <NavLink href="/stale" label="Stale" />
          <NavLink href="/tickets" label="Tickets" />
          <NavLink href="/cpptutor" label="Tutor" />
          <NavLink href="/calendar" label="Calendar" />
          <NavLink href="/reminders" label="Reminders" />
          <NavLink href="/review" label="Week" />
          <NavLink href="/vault" label="Vault" />
          <NavLink href="/mail" label="Mail" />
        </nav>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-4 sm:flex-none">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
          <span className="hidden md:block">
            <ClockDisplay />
          </span>
        </div>
      </div>
    </header>
  );
}
