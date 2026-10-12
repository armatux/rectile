import Link from "next/link";
import { PriorityMark, SectionHeader, TicketStatusBadge } from "@/components/hud";
import { TICKET_OWNERS, type Ticket, type TicketStatus } from "@/db/schema";
import { listTicketsForBoard } from "@/lib/tickets";
import { ACTOR_COLOR, relTime, TICKET_STATUS_META, TICKET_STATUS_ORDER } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "tickets" };

type SP = Promise<Record<string, string | string[] | undefined>>;

function OwnerChip({
  owner,
  active,
}: {
  owner?: (typeof TICKET_OWNERS)[number];
  active: boolean;
}) {
  return (
    <Link
      href={owner ? `/tickets?owner=${owner}` : "/tickets"}
      className={`flex min-h-[36px] items-center gap-1.5 border px-2.5 text-[9px] font-semibold tracking-[0.18em] transition-colors ${
        active
          ? "border-line-strong bg-accent/10 text-bright"
          : "border-line text-ink/50 hover:border-line-strong hover:text-ink"
      }`}
    >
      {owner && (
        <span
          className="h-1 w-1 rounded-full"
          style={{ background: ACTOR_COLOR[owner] }}
          aria-hidden
        />
      )}
      {owner ? owner.toUpperCase() : "ALL"}
    </Link>
  );
}

export default async function TicketsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const owner = TICKET_OWNERS.find((o) => o === sp.owner);
  const all = await listTicketsForBoard(owner);

  const groups = new Map<TicketStatus, Ticket[]>();
  for (const t of all) groups.set(t.status, [...(groups.get(t.status) ?? []), t]);
  const open = all.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;

  return (
    <div className="flex flex-col gap-5 pt-5">
      <SectionHeader
        label="TICKET QUEUE"
        sub={`OPEN.${String(open).padStart(2, "0")} · VESTIGE.ORCHESTRATOR`}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hud-sublabel mr-1 w-14 flex-none">OWNER</span>
        <OwnerChip active={!owner} />
        {TICKET_OWNERS.map((o) => (
          <OwnerChip key={o} owner={o} active={owner === o} />
        ))}
      </div>

      {TICKET_STATUS_ORDER.filter((s) => groups.has(s)).map((status) => {
        const rows = groups.get(status)!;
        return (
          <section key={status} className="flex flex-col">
            <div className="flex items-center gap-2">
              <TicketStatusBadge status={status} />
              <span className="hud-sublabel">×{rows.length}</span>
              <div className="hud-rule" />
            </div>
            <ol className="flex flex-col">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.key}`}
                    className="group flex min-h-[52px] items-center gap-3 border-b border-line/60 py-2.5 transition-colors hover:bg-accent/5"
                  >
                    <span className="w-16 flex-none text-[10px] font-semibold tracking-[0.1em] text-ink/45">
                      {t.key}
                    </span>
                    <PriorityMark priority={t.priority} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold tracking-[0.04em] text-bright group-hover:text-accent">
                      {t.title}
                    </span>
                    <span
                      className="hidden flex-none text-[9px] font-semibold tracking-[0.18em] sm:inline"
                      style={{ color: ACTOR_COLOR[t.ownerAgent] }}
                    >
                      {t.ownerAgent.toUpperCase()}
                    </span>
                    <span
                      className="w-10 flex-none text-right text-[10px] tracking-[0.12em] text-ink/40"
                      title={new Date(t.updatedAt).toLocaleString()}
                    >
                      {relTime(t.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {all.length === 0 && (
        <p className="py-10 text-center text-[11px] tracking-[0.2em] text-ink/40">
          NO TICKETS{owner ? ` FOR ${owner.toUpperCase()}` : ""} · THE ORCHESTRATOR
          FILES THEM VIA /api/v1/tickets
        </p>
      )}
      <p className="text-[9px] tracking-[0.14em] text-ink/30">
        {TICKET_STATUS_ORDER.filter((s) => !groups.has(s))
          .map((s) => TICKET_STATUS_META[s].label)
          .join(" · ")}
        {groups.size < TICKET_STATUS_ORDER.length && " — EMPTY"}
      </p>
    </div>
  );
}
