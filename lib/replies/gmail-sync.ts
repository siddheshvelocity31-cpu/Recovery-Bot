import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getAdminClient } from "@/lib/supabase/admin";
import { processInboundReply } from "@/lib/replies/process-inbound";

export async function syncGmailInboundReplies(): Promise<{ processedCount: number; errors: string[] }> {
  const smtpUser = process.env.SMTP_USER || "siddheshvelocity31@gmail.com";
  const smtpPass = process.env.SMTP_PASS || "bkxr jpvq sybc wcjq";

  if (!smtpUser || !smtpPass) {
    return { processedCount: 0, errors: ["Missing SMTP credentials"] };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    logger: false,
  });

  const errors: string[] = [];
  let processedCount = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen messages
      const searchResult = await client.search({ unseen: true });
      const uids: number[] = Array.isArray(searchResult)
        ? searchResult
        : searchResult ? Array.from(searchResult) : [];

      if (uids.length === 0) {
        return { processedCount: 0, errors: [] };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = getAdminClient() as any;

      // Fetch all contacts to map sender email to client_id
      const { data: contacts } = await admin
        .from("contact")
        .select("id, client_id, email");

      const emailToClientMap = new Map<string, { clientId: string; contactId: string }>();
      (contacts || []).forEach((c: any) => {
        if (c.email) {
          emailToClientMap.set(c.email.toLowerCase().trim(), {
            clientId: c.client_id,
            contactId: c.id,
          });
        }
      });

      // Also get all clients to check if client code/name matches
      const { data: clients } = await admin
        .from("client")
        .select("id, name, client_code");

      for (const uid of uids) {
        try {
          const message = await client.fetchOne(uid, { source: true, envelope: true });
          if (!message || !message.source) continue;

          const parsed = await simpleParser(message.source);
          const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
          const bodyText = parsed.text || parsed.html || "";
          const messageId = message.envelope?.messageId || `gmail-${uid}`;

          if (!bodyText.trim()) continue;

          // Find matching client
          let matchedClientId: string | null = null;
          let matchedContactId: string | null = null;

          if (fromAddress && emailToClientMap.has(fromAddress)) {
            const match = emailToClientMap.get(fromAddress)!;
            matchedClientId = match.clientId;
            matchedContactId = match.contactId;
          } else {
            // Fallback: search subject/body for client name or code
            const subject = message.envelope?.subject || "";
            const fullContent = `${subject} ${bodyText}`.toLowerCase();

            for (const cl of clients || []) {
              if (
                cl.client_code && fullContent.includes(cl.client_code.toLowerCase()) ||
                cl.name && fullContent.includes(cl.name.toLowerCase())
              ) {
                matchedClientId = cl.id;
                break;
              }
            }
          }

          if (!matchedClientId) {
            // Not a client reply, skip processing
            continue;
          }

          if (matchedClientId) {
            await processInboundReply({
              clientId: matchedClientId,
              contactId: matchedContactId || undefined,
              channel: "email",
              bodyText: bodyText.trim(),
              externalMessageId: messageId,
              rawPayload: {
                from: fromAddress,
                subject: message.envelope?.subject,
                uid,
              },
            });
            processedCount++;

            // Mark message as seen
            await client.messageFlagsAdd(uid, ["\\Seen"]);
          }
        } catch (msgErr: any) {
          console.error(`Error processing Gmail msg UID ${uid}:`, msgErr);
          errors.push(msgErr.message || String(msgErr));
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: any) {
    console.error("Gmail IMAP sync error:", err);
    errors.push(err.message || String(err));
  }

  return { processedCount, errors };
}
