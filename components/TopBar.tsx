"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ClockDisplay() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setTime(new Date().toTimeString().slice(0, 8));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[10px] font-semibold tracking-[0.14em] text-accent tabular-nums">
      {time}
    </span>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex min-h-[44px] items-center px-2 text-[10px] font-bold tracking-[0.24em] transition-colors ${
        active ? "text-bright" : "text-ink/50 hover:text-accent"
      }`}
    >
      {active && <span className="mr-1.5 text-accent">●</span>}
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
      className="flex min-w-0 flex-1 items-center gap-2 border border-line bg-panel/70 px-3 focus-within:border-line-strong sm:max-w-[300px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <span className="text-[11px] text-accent" aria-hidden>
        ⌕
      </span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="SEARCH EVERYTHING"
        className="min-h-[42px] w-full min-w-0 bg-transparent text-[11px] tracking-[0.08em] text-bright placeholder:text-ink/30 focus:outline-none"
        enterKeyHint="search"
      />
    </form>
  );
}

export function TopBar() {
  return (
    <header className="safe-x safe-top sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
        <Link href="/" className="flex min-h-[44px] flex-col justify-center">
          <span
            className="text-[19px] font-bold tracking-[0.18em] text-bright"
            style={{ textShadow: "0 0 18px rgb(150 110 255 / 0.5)" }}
          >
            R.E.C.T.I.L.E.
          </span>
          <span className="hud-sublabel hidden sm:block">
            PROJECT OPERATIONS TERMINAL
          </span>
        </Link>
        <nav className="flex items-center">
          <NavLink href="/" label="GRID" />
          <NavLink href="/stale" label="STALE" />
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
