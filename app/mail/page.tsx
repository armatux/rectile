import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { Composer } from "@/components/mail/Composer";
import {
  getAccount,
  listFolders,
  listMailbox,
  mailAccounts,
  type MailEnvelope,
  type MailFolder,
} from "@/lib/mail";
import { relTime } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "mail" };

type SP = Promise<Record<string, string | string[] | undefined>>;

function SetupPanel() {
  return (
    <div className="hud-panel flex max-w-2xl flex-col gap-3 p-6 text-[11.5px] leading-relaxed text-ink/70">
      <span className="text-[10px] font-bold tracking-[0.24em] text-warn">
        NO MAIL ACCOUNTS CONFIGURED
      </span>
      <p>
        Proton: run Proton Mail Bridge and set{" "}
        <code className="text-accent">PROTON_BRIDGE_HOST / _USER / _PASS</code> in .env.
        Other providers (GMX, …): add a <code className="text-accent">MAIL_ACCOUNTS</code>{" "}
        JSON array — see .env.example. Restart the app container afterwards.
      </p>
    </div>
  );
}

export default async function MailPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const accounts = mailAccounts();
  const acc = getAccount(typeof sp.a === "string" ? sp.a : undefined);
  if (!acc) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="SETUP" />
        <SetupPanel />
      </div>
    );
  }
  const folderParam = typeof sp.f === "string" ? sp.f.slice(0, 200) : "INBOX";

  let folders: MailFolder[];
  let inbox: MailEnvelope[];
  try {
    [folders, inbox] = await Promise.all([
      listFolders(acc),
      listMailbox(acc, folderParam),
    ]);
  } catch (err) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="LINK.DOWN" />
        <div className="hud-panel max-w-2xl p-6 text-[11.5px] leading-relaxed text-ink/60">
          <span className="mb-2 block text-[10px] font-bold tracking-[0.24em] text-danger">
            {acc.label} UNREACHABLE
          </span>
          {acc.host}:{acc.imapPort} — {String((err as Error)?.message ?? err)}
        </div>
      </div>
    );
  }

  const current = folders.find((f) => f.path === folderParam);
  const href = (patch: { a?: string; f?: string }) => {
    const qs = new URLSearchParams();
    const a = patch.a ?? acc.id;
    const f = patch.f ?? (patch.a ? "INBOX" : folderParam);
    if (a !== accounts[0].id) qs.set("a", a);
    if (f !== "INBOX") qs.set("f", f);
    const s = qs.toString();
    return s ? `/mail?${s}` : "/mail";
  };

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader
        label="MAIL"
        sub={`${acc.label} · ${current?.name.toUpperCase() ?? folderParam}${
          current?.unseen ? ` · ${current.unseen} UNREAD` : ""
        }`}
      />

      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={href({ a: a.id })}
              className={`flex min-h-[36px] items-center gap-1.5 border px-3 text-[9px] font-bold tracking-[0.2em] transition-colors ${
                a.id === acc.id
                  ? "border-line-strong bg-accent/10 text-bright"
                  : "border-line text-ink/50 hover:border-line-strong hover:text-ink"
              }`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_1fr] xl:grid-cols-[200px_3fr_2fr]">
        {/* folders */}
        <nav className="hud-panel flex flex-row flex-wrap gap-0.5 p-2 lg:flex-col lg:flex-nowrap">
          {folders.map((f) => (
            <Link
              key={f.path}
              href={href({ f: f.path })}
              className={`flex min-h-[36px] items-center gap-2 px-2 text-[10px] tracking-[0.1em] transition-colors ${
                f.path === folderParam
                  ? "bg-accent/10 text-bright"
                  : "text-ink/55 hover:text-accent"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{f.name.toUpperCase()}</span>
              {f.unseen > 0 && (
                <span className="text-[9px] font-bold text-accent">{f.unseen}</span>
              )}
              <span className="text-[8.5px] tabular-nums text-ink/30">{f.messages}</span>
            </Link>
          ))}
        </nav>

        {/* message list */}
        <section className="hud-panel flex flex-col p-2">
          {inbox.length === 0 && (
            <p className="py-8 text-center text-[10px] tracking-[0.2em] text-ink/30">
              FOLDER EMPTY
            </p>
          )}
          {inbox.map((m) => (
            <Link
              key={m.uid}
              href={`/mail/msg/${m.uid}?a=${acc.id}&f=${encodeURIComponent(folderParam)}`}
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
                className={`w-36 flex-none truncate text-[11px] ${
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

        {/* composer */}
        <section className="flex flex-col gap-2 xl:col-start-3">
          <span className="hud-sublabel">COMPOSE</span>
          <Composer
            accounts={accounts.map((a) => ({ id: a.id, label: a.label, user: a.user }))}
            defaultAccount={acc.id}
          />
        </section>
      </div>
    </div>
  );
}
