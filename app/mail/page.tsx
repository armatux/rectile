import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { Composer } from "@/components/mail/Composer";
import { listInbox, mailConfig, type MailEnvelope } from "@/lib/mail";
import { relTime } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "mail" };

function SetupPanel() {
  return (
    <div className="hud-panel flex max-w-2xl flex-col gap-3 p-6 text-[11.5px] leading-relaxed text-ink/70">
      <span className="text-[10px] font-bold tracking-[0.24em] text-warn">
        BRIDGE NOT CONFIGURED
      </span>
      <p>
        Mail talks to <span className="text-bright">Proton Mail Bridge</span> — Proton&apos;s
        official IMAP/SMTP gateway that runs on your own machine (requires a paid
        Proton plan). Your real Proton password is never used here; the bridge
        generates its own local credentials.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-ink/60">
        <li>Install proton-mail-bridge on the host and sign in to it.</li>
        <li>Copy the bridge&apos;s IMAP/SMTP username + password from its settings.</li>
        <li>
          Add to rectile&apos;s .env:{" "}
          <code className="text-accent">
            PROTON_BRIDGE_HOST / PROTON_BRIDGE_USER / PROTON_BRIDGE_PASS
          </code>{" "}
          (ports default 1143/1025), then restart the app container.
        </li>
        <li>
          The bridge binds to localhost — from the container, reach it via a
          host-side forward (socat) or host.containers.internal.
        </li>
      </ol>
    </div>
  );
}

export default async function MailPage() {
  const cfg = mailConfig();
  if (!cfg) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="PROTON.BRIDGE" />
        <SetupPanel />
      </div>
    );
  }

  let inbox: MailEnvelope[];
  try {
    inbox = await listInbox(cfg);
  } catch (err) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="LINK.DOWN" />
        <div className="hud-panel max-w-2xl p-6 text-[11.5px] leading-relaxed text-ink/60">
          <span className="mb-2 block text-[10px] font-bold tracking-[0.24em] text-danger">
            BRIDGE UNREACHABLE
          </span>
          Could not reach Proton Mail Bridge at {cfg.host}:{cfg.imapPort} —{" "}
          {String((err as Error)?.message ?? err)}. Is the bridge running and the
          port forward up?
        </div>
      </div>
    );
  }

  const unseen = inbox.filter((m) => !m.seen).length;

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader
        label="MAIL"
        sub={unseen ? `INBOX · ${unseen} UNREAD` : "INBOX"}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <section className="hud-panel flex flex-col p-2">
          {inbox.length === 0 && (
            <p className="py-8 text-center text-[10px] tracking-[0.2em] text-ink/30">
              INBOX EMPTY
            </p>
          )}
          {inbox.map((m) => (
            <Link
              key={m.uid}
              href={`/mail/msg/${m.uid}`}
              className="flex items-baseline gap-3 border-b border-line/60 px-2 py-3 last:border-b-0 hover:bg-accent/5"
            >
              <span
                className={`h-1.5 w-1.5 flex-none self-center rounded-full ${
                  m.seen ? "bg-transparent" : "bg-accent"
                }`}
                style={m.seen ? undefined : { boxShadow: "0 0 5px var(--color-accent)" }}
                aria-hidden
              />
              <span
                className={`w-40 flex-none truncate text-[11px] ${
                  m.seen ? "text-ink/50" : "font-semibold text-bright"
                }`}
                title={m.fromAddr}
              >
                {m.from}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[11.5px] ${
                  m.seen ? "text-ink/60" : "text-ink"
                }`}
              >
                {m.subject}
              </span>
              <span className="flex-none text-[9.5px] tabular-nums text-ink/40">
                {relTime(m.date)}
              </span>
            </Link>
          ))}
        </section>
        <section className="flex flex-col gap-2">
          <span className="hud-sublabel">COMPOSE</span>
          <Composer />
        </section>
      </div>
    </div>
  );
}
