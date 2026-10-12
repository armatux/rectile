import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriorityMark, SectionHeader, TicketStatusBadge } from "@/components/hud";
import { TicketCommentForm, TicketDecisions } from "@/components/tickets/TicketPanels";
import type { Actor, TicketStatus } from "@/db/schema";
import { NotFoundError } from "@/lib/repo";
import {
  getTicket,
  ticketProject,
  type TicketAttachmentJson,
  type TicketEventJson,
} from "@/lib/tickets";
import { ACTOR_COLOR, longDate, relTime, TICKET_STATUS_META } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { key } = await params;
  return { title: key };
}

/* Everything on this page that agents wrote is rendered as plain text —
   never through renderMarkdown, whose raw-HTML passthrough would let an
   agent token script the owner's (human) session. */

function ActorTag({ actor }: { actor: Actor }) {
  return (
    <span
      className="text-[9px] font-semibold tracking-[0.18em]"
      style={{ color: ACTOR_COLOR[actor] }}
    >
      {actor.toUpperCase()}
    </span>
  );
}

function statusLabel(value: unknown): string {
  return typeof value === "string" && value in TICKET_STATUS_META
    ? TICKET_STATUS_META[value as TicketStatus].label
    : String(value ?? "—").toUpperCase();
}

function EventRow({ e }: { e: TicketEventJson }) {
  const isStatus = e.type === "status_change";
  const tone =
    e.type === "approval"
      ? "var(--color-ok)"
      : e.type === "rejection" || e.type === "question"
        ? "var(--color-warn)"
        : "rgb(217 210 236 / 0.5)";
  const extra = isStatus ? {} : e.data;
  return (
    <article className="flex gap-3 border-b border-line/60 py-3 last:border-b-0">
      <div className="w-12 flex-none pt-0.5 text-right">
        <time
          dateTime={new Date(e.createdAt).toISOString()}
          title={longDate(e.createdAt)}
          className="text-[9.5px] tracking-[0.12em] text-ink/40"
        >
          {relTime(e.createdAt)}
        </time>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <ActorTag actor={e.actor} />
          <span
            className="text-[9px] font-semibold tracking-[0.18em]"
            style={{ color: tone }}
          >
            {e.type.replace("_", " ").toUpperCase()}
          </span>
          {isStatus && (
            <span className="text-[9.5px] tracking-[0.14em] text-ink/70">
              {statusLabel(e.data.from)} <span className="text-accent">→</span>{" "}
              {statusLabel(e.data.to)}
            </span>
          )}
        </div>
        {e.body && (
          <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink/85">
            {e.body}
          </p>
        )}
        {Object.keys(extra).length > 0 && (
          <details className="text-[10px] text-ink/50">
            <summary className="cursor-pointer tracking-[0.16em]">DATA</summary>
            <pre className="mt-1 overflow-x-auto border border-line bg-panel/70 p-2 text-[10px]">
              {JSON.stringify(extra, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </article>
  );
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function formatBytes(n: number | null): string | null {
  if (n === null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function AttachmentRow({ a }: { a: TicketAttachmentJson }) {
  const meta = [a.contentType, formatBytes(a.sizeBytes), `sha256 ${a.sha256.slice(0, 12)}…`]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex min-h-[44px] flex-col justify-center gap-0.5 py-1.5">
      <span className="flex items-center gap-2">
        <span className="text-[10px] text-accent" aria-hidden>
          ◈
        </span>
        {isWebUrl(a.url) ? (
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-[11.5px] text-ink hover:text-accent"
            title={a.url}
          >
            {a.label}
          </a>
        ) : (
          <span className="min-w-0 truncate text-[11.5px] text-ink" title={a.url}>
            {a.label} <span className="text-ink/35">{a.url}</span>
          </span>
        )}
      </span>
      <span className="pl-5 text-[9px] tracking-[0.08em] text-ink/35" title={a.sha256}>
        {meta} · <ActorTag actor={a.actor} />
      </span>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="hud-sublabel">{label}</span>
      <span className="break-words text-[11px] text-ink/80">{children}</span>
    </div>
  );
}

function PathList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <span className="text-ink/30">{empty}</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((p) => (
        <li key={p} className="break-all font-mono text-[10.5px] text-ink/80">
          {p}
        </li>
      ))}
    </ul>
  );
}

export default async function TicketPage({ params }: { params: Params }) {
  const { key } = await params;
  let detail: Awaited<ReturnType<typeof getTicket>>;
  try {
    detail = await getTicket(key);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { ticket: t, events, attachments } = detail;
  const project = await ticketProject(t.projectId);

  return (
    <div className="flex flex-col gap-6 pt-5">
      <header className="flex flex-col gap-2">
        <Link
          href="/tickets"
          className="hud-sublabel self-start hover:text-accent"
        >
          ◂ TICKETS / {t.key}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            className="font-display text-[22px] font-bold tracking-[0.03em] text-bright sm:text-[28px]"
            style={{ textShadow: "0 0 22px rgb(150 110 255 / 0.4)" }}
          >
            {t.title}
          </h1>
          <PriorityMark priority={t.priority} />
          <TicketStatusBadge status={t.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] tracking-[0.18em] text-ink/40">
          <span>
            OWNER · <ActorTag actor={t.ownerAgent} />
          </span>
          <span>{t.kind.replace("_", " ").toUpperCase()}</span>
          <span>VIA {t.source.toUpperCase()}</span>
          <span>
            BY <ActorTag actor={t.createdBy} /> · {longDate(t.createdAt).toUpperCase()}
          </span>
          <span className="text-ink/25">
            v{t.version} · seq {t.seq}
          </span>
        </div>
        {t.description && (
          <p className="max-w-3xl whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink/65">
            {t.description}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          {t.acceptanceCriteria && (
            <div className="flex flex-col gap-3">
              <SectionHeader label="ACCEPTANCE" sub="CRITERIA" />
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink/80">
                {t.acceptanceCriteria}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <SectionHeader label="TIMELINE" sub={`EVENTS.${String(events.length).padStart(2, "0")}`} />
            <div className="flex flex-col">
              {events.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
              {events.length === 0 && (
                <p className="py-6 text-center text-[10px] tracking-[0.2em] text-ink/30">
                  NO EVENTS YET
                </p>
              )}
            </div>
            <TicketCommentForm ticketKey={t.key} />
          </div>
        </div>

        <aside className="flex flex-col gap-8">
          <TicketDecisions ticketKey={t.key} version={t.version} status={t.status} />

          <section className="flex flex-col gap-3">
            <SectionHeader label="FIELDS" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="MODEL">{t.model ?? "default"}</Field>
              <Field label="EFFORT">{t.effort ?? "default"}</Field>
              <Field label="MODE">{t.mode ?? (t.ownerAgent === "visual" ? "editor" : "—")}</Field>
              <Field label="CHANGELIST">{t.changelist ?? "—"}</Field>
              <Field label="UPDATED">{relTime(t.updatedAt)}</Field>
              <Field label="PROJECT">
                {project ? (
                  <Link href={`/p/${project.slug}`} className="text-accent hover:text-bright">
                    {project.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Field>
            </div>
            <Field label="TOUCHED PATHS">
              <PathList items={t.touchedPaths} empty="none declared" />
            </Field>
            <Field label="LINKED CONTRACTS">
              <PathList items={t.linkedContracts} empty="none" />
            </Field>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader label="ATTACHMENTS" sub={`×${attachments.length}`} />
            <ul className="flex flex-col">
              {attachments.map((a) => (
                <AttachmentRow key={a.id} a={a} />
              ))}
            </ul>
            {attachments.length === 0 && (
              <p className="text-[9.5px] tracking-[0.16em] text-ink/30">NONE</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
