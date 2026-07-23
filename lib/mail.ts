import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Proton Mail via Proton Mail Bridge (IMAP/SMTP on the host).
 *
 * The bridge exposes IMAP (STARTTLS, self-signed cert) and SMTP locally with
 * its own generated credentials — the real Proton password never appears
 * here. All config comes from env; nothing works until it is set:
 *
 *   PROTON_BRIDGE_HOST       (e.g. host.containers.internal, or a socat fwd)
 *   PROTON_BRIDGE_IMAP_PORT  (default 1143)
 *   PROTON_BRIDGE_SMTP_PORT  (default 1025)
 *   PROTON_BRIDGE_USER       (bridge username, usually the address)
 *   PROTON_BRIDGE_PASS       (bridge-generated password)
 */

export type MailConfig = {
  host: string;
  imapPort: number;
  smtpPort: number;
  user: string;
  pass: string;
};

export function mailConfig(): MailConfig | null {
  const { PROTON_BRIDGE_HOST, PROTON_BRIDGE_USER, PROTON_BRIDGE_PASS } = process.env;
  if (!PROTON_BRIDGE_HOST || !PROTON_BRIDGE_USER || !PROTON_BRIDGE_PASS) return null;
  return {
    host: PROTON_BRIDGE_HOST,
    imapPort: Number(process.env.PROTON_BRIDGE_IMAP_PORT ?? 1143),
    smtpPort: Number(process.env.PROTON_BRIDGE_SMTP_PORT ?? 1025),
    user: PROTON_BRIDGE_USER,
    pass: PROTON_BRIDGE_PASS,
  };
}

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

async function withImap<T>(cfg: MailConfig, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.imapPort,
    secure: false,
    tls: { rejectUnauthorized: false }, // bridge uses a self-signed local cert
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listInbox(cfg: MailConfig, limit = 30): Promise<MailEnvelope[]> {
  return withImap(cfg, async (c) => {
    const lock = await c.getMailboxLock("INBOX");
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

export async function getMessage(cfg: MailConfig, uid: number): Promise<MailMessage | null> {
  return withImap(cfg, async (c) => {
    const lock = await c.getMailboxLock("INBOX");
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
  cfg: MailConfig,
  input: { to: string; subject: string; body: string; inReplyTo?: string },
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.smtpPort,
    secure: false,
    requireTLS: true,
    tls: { rejectUnauthorized: false },
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transport.sendMail({
    from: cfg.user,
    to: input.to,
    subject: input.subject,
    text: input.body,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo,
  });
}
