import Link from "next/link";
import { SectionHeader } from "@/components/hud";
import { Composer } from "@/components/mail/Composer";
import { getAccount, getMessage, mailAccounts } from "@/lib/mail";
import { longDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams: SP;
}) {
  const sp = await searchParams;
  const acc = getAccount(typeof sp.a === "string" ? sp.a : undefined);
  const folder = typeof sp.f === "string" ? sp.f.slice(0, 200) : "INBOX";
  const uid = Number((await params).uid);
  const backHref = `/mail?a=${acc?.id ?? ""}&f=${encodeURIComponent(folder)}`;

  if (!acc || !Number.isInteger(uid) || uid < 1) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="NOT.FOUND" />
        <Link href="/mail" className="text-[10px] font-bold tracking-[0.22em] text-ink/50 hover:text-accent">
          ◂ BACK TO MAIL
        </Link>
      </div>
    );
  }

  let msg;
  try {
    msg = await getMessage(acc, folder, uid);
  } catch (err) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="LINK.DOWN" />
        <div className="hud-panel max-w-2xl p-6 text-[11.5px] text-ink/60">
          {acc.label} UNREACHABLE — {String((err as Error)?.message ?? err)}
        </div>
      </div>
    );
  }
  if (!msg) {
    return (
      <div className="flex flex-col gap-6 pt-5">
        <SectionHeader label="MAIL" sub="NOT.FOUND" />
        <div className="hud-panel max-w-2xl p-6 text-[11.5px] text-ink/60">
          No message with uid {uid} in {folder} on {acc.label}.
        </div>
        <Link href={backHref} className="text-[10px] font-bold tracking-[0.22em] text-ink/50 hover:text-accent">
          ◂ BACK TO {folder.toUpperCase()}
        </Link>
      </div>
    );
  }

  const replySubject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;

  return (
    <div className="flex flex-col gap-6 pt-5">
      <SectionHeader label="MAIL" sub={`${acc.label} · MSG.${uid}`} />
      <Link
        href={backHref}
        className="text-[10px] font-bold tracking-[0.22em] text-ink/50 hover:text-accent"
      >
        ◂ BACK TO {folder.replace(/^(Folders|Labels)\//, "").toUpperCase()}
      </Link>
      <article className="hud-panel flex max-w-3xl flex-col gap-4 p-5">
        <header className="flex flex-col gap-1 border-b border-line pb-3">
          <h1 className="text-[15px] font-bold text-bright">{msg.subject}</h1>
          <p className="text-[10.5px] text-ink/60">
            <span className="text-ink">{msg.from}</span>
            {msg.fromAddr && <span className="text-ink/40"> &lt;{msg.fromAddr}&gt;</span>}
            <span className="text-ink/35"> → {msg.to}</span>
          </p>
          <time className="text-[9.5px] tracking-[0.12em] text-ink/40">
            {longDate(msg.date)}
          </time>
        </header>
        <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-ink/85">
          {msg.text}
        </pre>
      </article>
      <section className="flex max-w-3xl flex-col gap-2">
        <span className="hud-sublabel">REPLY</span>
        <Composer
          accounts={mailAccounts().map((a) => ({ id: a.id, label: a.label, user: a.user }))}
          defaultAccount={acc.id}
          initialTo={msg.fromAddr}
          initialSubject={replySubject}
          inReplyTo={msg.messageId}
        />
      </section>
    </div>
  );
}
