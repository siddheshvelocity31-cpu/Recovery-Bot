import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { writeEvent } from "@/lib/events/write";
import { extractCommitmentFromText } from "@/lib/replies/extract-commitment";

export interface ProcessInboundReplyParams {
  clientId: string;
  caseId?: string;
  contactId?: string;
  channel: "whatsapp" | "email" | "voice" | "human";
  bodyText: string;
  externalMessageId?: string;
  rawPayload?: Record<string, unknown>;
  receivedAt?: Date;
}

export async function processInboundReply(params: ProcessInboundReplyParams) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;
  const receivedAt = params.receivedAt ?? new Date();

  // 1. If caseId not provided, locate active recovery_case
  let caseId = params.caseId;
  if (!caseId) {
    const { data: activeCase } = await admin
      .from("recovery_case")
      .select("id")
      .eq("client_id", params.clientId)
      .not("status", "in", '("resolved","suppressed")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    caseId = activeCase?.id;
  }

  // 2. Insert into `reply` table
  const { data: replyRow, error: replyError } = await admin
    .from("reply")
    .insert({
      client_id: params.clientId,
      case_id: caseId ?? null,
      contact_id: params.contactId ?? null,
      channel: params.channel,
      body: params.bodyText,
      provider_message_id: params.externalMessageId ?? null,
      raw_payload: params.rawPayload ?? {},
      received_at: receivedAt.toISOString(),
    })
    .select("id")
    .single();

  if (replyError) throw replyError;

  // 3. Write event: reply.received
  await writeEvent({
    clientId: params.clientId,
    caseId: caseId ?? undefined,
    actorType: "client",
    type: "reply.received",
    payload: {
      reply_id: replyRow.id,
      channel: params.channel,
      body_snippet: params.bodyText.slice(0, 150),
    },
  });

  // 4. Extract commitment intent
  const extracted = extractCommitmentFromText(params.bodyText, receivedAt);

  let commitmentId: string | null = null;

  if (extracted.has_commitment && caseId) {
    // Record commitment in DB
    const { data: commRow, error: commError } = await admin
      .from("commitment")
      .insert({
        case_id: caseId,
        reply_id: replyRow.id,
        due_at: extracted.promised_date ? extracted.promised_date.toISOString() : null,
        amount_paise: extracted.promised_amount_paise != null ? Number(extracted.promised_amount_paise) : null,
        status: "confirmed",
        notes: `Extracted from client reply: "${extracted.raw_text_snippet}"`,
      })
      .select("id")
      .single();

    if (commError) throw commError;
    commitmentId = commRow.id;

    // Write commitment event
    await writeEvent({
      clientId: params.clientId,
      caseId,
      actorType: "client",
      type: "commitment.confirmed",
      payload: {
        commitment_id: commitmentId,
        due_at: extracted.promised_date?.toISOString(),
        amount_paise: extracted.promised_amount_paise?.toString(),
      },
    });
  }

  // 5. Enqueue evaluation jobs for this client
  if (caseId) {
    await admin.from("job").insert({
      kind: "case.evaluate",
      payload: { client_id: params.clientId },
    });
  }

  await admin.from("job").insert({
    kind: "flags.evaluate",
    payload: { client_id: params.clientId },
  });

  return {
    reply_id: replyRow.id,
    has_commitment: extracted.has_commitment,
    commitment_id: commitmentId,
    extracted,
  };
}
