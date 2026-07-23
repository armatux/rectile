import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Multi-account mail over IMAP/SMTP.
 *
 * Accounts come from env:
 *  - PROTON_BRIDGE_HOST/USER/PASS (+ _IMAP_PORT/_SMTP_PORT) → account "proton"
 *    (Proton Mail Bridge: STARTTLS with a self-signed local cert)
 *  - MAIL_ACCOUNTS — single-line JSON array for everything else, e.g.
 *    [{"label":"GMX","host":"imap.gmx.net","imapPort":993,
 *      "smtpHost":"mail.gmx.net","smtpPort":587,
 *      "user":"you@gmx.net","pass":"..."}]
 *
 * TLS defaults: IMAP port 993 → implicit TLS, else STARTTLS; SMTP port 465 →
 * implicit TLS, else STARTTLS. `insecureTLS: true` disables cert verification
 * (the bridge needs it; real providers must not).
 */

export type MailAccount = {
  id: string;
  label: string;
  host: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  pass: string;
  insecureTLS: boolean;
};

export function mailAccounts(): MailAccount[] {
  const out: MailAccount[] = [];
  const { PROTON_BRIDGE_HOST, PROTON_BRIDGE_USER, PROTON_BRIDGE_PASS } = process.env;
  if (PROTON_BRIDGE_HOST && PROTON_BRIDGE_USER && PROTON_BRIDGE_PASS) {
    out.push({
      id: "proton",
      label: "PROTON",
      host: PROTON_BRIDGE_HOST,
      imapPort: Number(process.env.PROTON_BRIDGE_IMAP_PORT ?? 1143),
      smtpHost: PROTON_BRIDGE_HOST,
      smtpPort: Number(process.env.PROTON_BRIDGE_SMTP_PORT ?? 1025),
      user: PROTON_BRIDGE_USER,
      pass: PROTON_BRIDGE_PASS,
      insecureTLS: true, // bridge presents a self-signed local cert
    });
  }
  try {
    const extra = JSON.parse(process.env.MAIL_ACCOUNTS ?? "[]") as Array<
      Partial<MailAccount> & { label: string; host: string; user: string; pass: string }
    >;
    for (const a of extra) {
      if (!a.label || !a.host || !a.user || !a.pass) continue;
      const id = a.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      out.push({
        id,
        label: a.label.toUpperCase(),
        host: a.host,
        imapPort: a.imapPort ?? 993,
        smtpHost: a.smtpHost ?? a.host,
        smtpPort: a.smtpPort ?? 587,
        user: a.user,
        pass: a.pass,
        insecureTLS: a.insecureTLS ?? false,
      });
    }
  } catch {
    console.error("[mail] MAIL_ACCOUNTS is not valid JSON — ignoring");
  }
  return out;
}

export function getAccount(id: string | undefined): MailAccount | null {
  const accounts = mailAccounts();
  if (!accounts.length) return null;
  return accounts.find((a) => a.id === id) ?? accounts[0];
}

/* --------------------------------- folders -------------------------------- */

export type MailFolder = {
  path: string;
  name: string;
  messages: number;
  unseen: number;
};

/** Sort: INBOX, working folders, then the archive/junk tail. */
function folderRank(path: string): number {
  const p = path.toUpperCase();
  if (p === "INBOX") return 0;
  if (p === "STARRED") return 1;
  if (p.startsWith("FOLDERS/")) return 2;
  if (p.startsWith("LABELS/")) return 3;
  if (p === "DRAFTS") return 4;
  if (p === "SENT") return 5;
  if (p === "ARCHIVE") return 6;
  if (p === "ALL MAIL") return 7;
  if (p === "SPAM") return 8;
  if (p === "TRASH") return 9;
  return 4;
}

async function withImap<T>(acc: MailAccount, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const secure = acc.imapPort === 993;
  const client = new ImapFlow({
    host: acc.host,
    port: acc.imapPort,
    secure,
    tls: acc.insecureTLS ? { rejectUnauthorized: false } : undefined,
    auth: { user: acc.user, pass: acc.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listFolders(acc: MailAccount): Promise<MailFolder[]> {
  return withImap(acc, async (c) => {
    const boxes = await c.list();
    const out: MailFolder[] = [];
    for (const b of boxes) {
      if (b.flags?.has("\\Noselect")) continue;
      try {
        const st = await c.status(b.path, { messages: true, unseen: true });
        // hide empty structural nodes, keep the core mailboxes
        if ((st.messages ?? 0) === 0 && folderRank(b.path) >= 2 && b.path !== "INBOX") continue;
        out.push({
          path: b.path,
          name: b.path.replace(/^(Folders|Labels)\//, ""),
          messages: st.messages ?? 0,
          unseen: st.unseen ?? 0,
        });
      } catch {
        /* skip un-statusable mailboxes */
      }
    }
    out.sort((a, b) => folderRank(a.path) - folderRank(b.path) || a.path.localeCompare(b.path));
    return out;
  });
}

/* -------------------------------- messages -------------------------------- */

export type MailEnvelope = {
  uid: number;
  subject: string;
  from: string;
  fromAddr: string;
  date: string;
  seen: boolean;
};

export type MailMessage = MailEnvelope & {
  to: string;
  text: string;
  messageId?: string;
};

export async function listMailbox(
  acc: MailAccount,
  path: string,
  limit = 40,
): Promise<MailEnvelope[]> {
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(path);
    try {
      const total = typeof c.mailbox === "object" ? c.mailbox.exists : 0;
      if (!total) return [];
      const fromSeq = Math.max(1, total - limit + 1);
      const out: MailEnvelope[] = [];
      for await (const msg of c.fetch(`${fromSeq}:*`, { uid: true, envelope: true, flags: true })) {
        const from = msg.envelope?.from?.[0];
        out.push({
          uid: msg.uid,
          subject: msg.envelope?.subject ?? "(no subject)",
          from: from?.name || from?.address || "unknown",
          fromAddr: from?.address ?? "",
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          seen: msg.flags?.has("\\Seen") ?? false,
        });
      }
      return out.reverse();
    } finally {
      lock.release();
    }
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function getMessage(
  acc: MailAccount,
  path: string,
  uid: number,
): Promise<MailMessage | null> {
  return withImap(acc, async (c) => {
    const lock = await c.getMailboxLock(path);
    try {
      const msg = await c.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, source: true },
        { uid: true },
      );
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const from = msg.envelope?.from?.[0];
      await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
      return {
        uid,
        seen: true,
        subject: msg.envelope?.subject ?? "(no subject)",
        from: from?.name || from?.address || "unknown",
        fromAddr: from?.address ?? "",
        to: (msg.envelope?.to ?? []).map((t) => t.address).filter(Boolean).join(", "),
        date: (msg.envelope?.date ?? new Date()).toISOString(),
        text: parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "(empty message)"),
        messageId: msg.envelope?.messageId,
      };
    } finally {
      lock.release();
    }
  });
}

export async function sendMail(
  acc: MailAccount,
  input: { to: string; subject: string; body: string; inReplyTo?: string },
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: acc.smtpHost,
    port: acc.smtpPort,
    secure: acc.smtpPort === 465,
    requireTLS: true,
    tls: acc.insecureTLS ? { rejectUnauthorized: false } : undefined,
    auth: { user: acc.user, pass: acc.pass },
  });
  await transport.sendMail({
    from: acc.user,
    to: input.to,
    subject: input.subject,
    text: input.body,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo,
  });
}
