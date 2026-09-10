import "server-only"

import nodemailer from "nodemailer"
import { getAdminClient } from "@/lib/supabase/admin"
import { writeEvent } from "@/lib/events/write"
import { formatPaise } from "@/lib/money"
import { renderMessage, type RenderContext } from "@/lib/outreach/render"
import { dryRunSend } from "@/lib/outreach/adapters/dry-run"

export async function dispatchOutreach(outreachId: string): Promise<void> {
  const admin = getAdminClient()

  // 1. Fetch the outreach row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: outreach, error: outreachError } = await (admin as any)
    .from("outreach")
    .select("*")
    .eq("id", outreachId)
    .single()

  if (outreachError) throw outreachError
  if (!outreach) throw new Error(`Outreach not found: ${outreachId}`)

  // 2. Idempotency: only process queued rows
  if (outreach.status !== "queued") {
    return
  }

  // 3. Kill switch check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: config, error: configError } = await (admin as any)
    .from("system_config")
    .select("outreach_kill_switch")
    .limit(1)
    .single()

  if (configError) throw configError

  if (config?.outreach_kill_switch === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: suppressError } = await (admin as any)
      .from("outreach")
      .update({
        status: "suppressed",
        suppression_reason: "Kill switch active",
      })
      .eq("id", outreachId)

    if (suppressError) throw suppressError

    await writeEvent({
      clientId: outreach.client_id,
      caseId: outreach.case_id,
      actorType: "system",
      type: "outreach.suppressed",
      payload: { outreach_id: outreachId, reason: "Kill switch active" },
    })

    return
  }

  // 4. Fetch recovery_case, client, contact
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recoveryCase, error: caseError } = await (admin as any)
    .from("recovery_case")
    .select("*")
    .eq("id", outreach.case_id)
    .single()

  if (caseError) throw caseError
  if (!recoveryCase) throw new Error(`Recovery case not found: ${outreach.case_id}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client, error: clientError } = await (admin as any)
    .from("client")
    .select("*, persona:persona!inner(salutation, signature)")
    .eq("id", outreach.client_id)
    .single()

  if (clientError) throw clientError
  if (!client) throw new Error(`Client not found: ${outreach.client_id}`)

  let contact: { full_name: string; email?: string } | null = null
  if (outreach.contact_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contactRow, error: contactError } = await (admin as any)
      .from("contact")
      .select("full_name, email")
      .eq("id", outreach.contact_id)
      .single()

    if (contactError) throw contactError
    contact = contactRow
  }

  // 5. Build RenderContext
  //    Compute oldest_due_date, invoice_count, statement_period from open items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openItems } = await (admin as any)
    .from("open_item")
    .select("due_date, issue_date")
    .eq("client_id", outreach.client_id)
    .in("status", ["open", "part_paid"])

  const items: Array<{ due_date: string | null; issue_date: string }> =
    openItems ?? []

  const invoice_count = String(items.length)

  let oldest_due_date = "N/A"
  const dueDates = items
    .map((i) => i.due_date)
    .filter((d): d is string => d !== null)
    .sort()
  if (dueDates.length > 0) {
    const d = new Date(dueDates[0]!)
    oldest_due_date = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  let statement_period = "N/A"
  const issueDates = items.map((i) => i.issue_date).sort()
  if (issueDates.length > 0) {
    const from = new Date(issueDates[0]!)
    const to = new Date(issueDates[issueDates.length - 1]!)
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    statement_period = `${fmt(from)} – ${fmt(to)}`
  }

  const totalOpenPaise = BigInt(recoveryCase.total_open_paise ?? 0)

  const context: RenderContext = {
    contact_name: contact?.full_name ?? "Sir/Madam",
    client_name: client.name,
    total_open: formatPaise(totalOpenPaise),
    oldest_due_date,
    invoice_count,
    statement_period,
  }

  // Persona salutation and signature (joined via client → persona)
  const persona = Array.isArray(client.persona)
    ? client.persona[0]
    : client.persona
  const salutation: string = persona?.salutation ?? "Dear Sir/Madam,"
  const signature: string = persona?.signature ?? "VSAR Technologies"

  // 6. Render
  const renderedMessage = renderMessage({
    template_key: outreach.template_key,
    channel: outreach.channel,
    context,
    persona_tone: outreach.persona_tone,
    salutation,
    signature,
  })

  // 7. Send via SMTP if configured, else dry-run adapter
  let result: { provider: string; provider_message_id: string }

  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (outreach.channel === "email" && smtpUser && smtpPass && contact?.email) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: smtpPass },
      })
      const mailInfo = await transporter.sendMail({
        from: `"VSAR Recovery System" <${smtpUser}>`,
        to: contact.email,
        subject: `Payment Reminder - ${client.name}`,
        text: renderedMessage.body,
      })
      result = {
        provider: "gmail",
        provider_message_id: mailInfo.messageId,
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_sendErr) {
      result = await dryRunSend({
        outreach_id: outreachId,
        rendered_body: renderedMessage.body,
        channel: outreach.channel,
      })
    }
  } else {
    result = await dryRunSend({
      outreach_id: outreachId,
      rendered_body: renderedMessage.body,
      channel: outreach.channel,
    })
  }

  // 8. Mark as sent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (admin as any)
    .from("outreach")
    .update({
      status: "sent",
      provider: result.provider,
      provider_message_id: result.provider_message_id,
      rendered_body: renderedMessage.body,
      sent_at: new Date().toISOString(),
    })
    .eq("id", outreachId)

  if (updateError) throw updateError

  // 9. Write outreach.dry_run event
  await writeEvent({
    clientId: outreach.client_id,
    caseId: outreach.case_id,
    actorType: "system",
    type: "outreach.dry_run",
    payload: {
      channel: outreach.channel,
      template_key: outreach.template_key,
      rendered_body: renderedMessage.body,
    },
  })
}
