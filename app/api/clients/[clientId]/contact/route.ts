import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const ContactSchema = z.object({
  full_name: z.string().min(1, "Contact name is required"),
  email: z.string().email("Valid email address is required"),
  phone_e164: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    await requireRole("viewer");
    const { clientId } = await params;
    const admin = getAdminClient();

    const { data: contact, error } = await (admin as any)
      .from("contact")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ success: true, contact: contact || null });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch contact" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    await requireRole("viewer");
    const { clientId } = await params;
    const body = await request.json();
    const parsed = ContactSchema.parse(body);

    const admin = getAdminClient();

    // Check if primary contact exists
    const { data: existing } = await (admin as any)
      .from("contact")
      .select("id")
      .eq("client_id", clientId)
      .maybeSingle();

    let savedContact: any;
    if (existing) {
      const { data: updated, error: updateErr } = await (admin as any)
        .from("contact")
        .update({
          full_name: parsed.full_name,
          email: parsed.email,
          phone_e164: parsed.phone_e164 || null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      savedContact = updated;
    } else {
      const { data: created, error: createErr } = await (admin as any)
        .from("contact")
        .insert({
          client_id: clientId,
          full_name: parsed.full_name,
          email: parsed.email,
          phone_e164: parsed.phone_e164 || null,
          is_primary: true,
          email_opt_in: true,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      savedContact = created;
    }

    // Automatically send payment reminder email to newly saved contact email
    const emailSent = await sendAutomatedReminder(admin, clientId, parsed.email, parsed.full_name);

    return NextResponse.json({ success: true, contact: savedContact, emailSent });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save contact details" },
      { status: 400 }
    );
  }
}

async function sendAutomatedReminder(admin: any, clientId: string, email: string, fullName: string) {
  try {
    const { formatPaise } = await import("@/lib/money");
    const nodemailer = await import("nodemailer");

    const { data: client } = await admin
      .from("client")
      .select("id, name, client_code")
      .eq("id", clientId)
      .single();

    const { data: balanceEntries } = await admin
      .from("ledger_entry")
      .select("bill_amount_paise")
      .eq("client_id", clientId);

    const dbTotalPaise = ((balanceEntries as Array<Record<string, any>>) ?? []).reduce(
      (acc: bigint, row: Record<string, any>) => acc + BigInt(row.bill_amount_paise ?? 0),
      0n
    );

    if (dbTotalPaise <= 0n) return false;

    const smtpUser = process.env.SMTP_USER || "siddheshvelocity31@gmail.com";
    const smtpPass = process.env.SMTP_PASS || "bkxr jpvq sybc wcjq";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: `"VSAR Recovery System" <${smtpUser}>`,
      to: email,
      subject: `Payment Reminder Notice - ${client.name} (${client.client_code})`,
      text: [
        `Dear ${fullName || "Accounts Team"},`,
        ``,
        `This is an automated payment reminder generated for ${client.name}.`,
        ``,
        `CLIENT DETAILS:`,
        `------------------------------------------------`,
        `Client Name          : ${client.name}`,
        `Client Code          : ${client.client_code}`,
        `Total Outstanding   : ${formatPaise(dbTotalPaise)}`,
        `Status               : Outstanding Overdue Balance Detected`,
        `------------------------------------------------`,
        ``,
        `Please review the client statement in your VSAR Recovery Dashboard.`,
        ``,
        `Best regards,`,
        `Accounts Receivable Team`,
        `VSAR Technologies`,
      ].join("\n"),
    });

    await admin.from("outreach").insert({
      client_id: clientId,
      channel: "email",
      cadence_step_number: 1,
      template_key: "payment_reminder",
      persona_tone: "firm",
      rendered_body: `Payment reminder sent for ${client.name} - ${formatPaise(dbTotalPaise)}`,
      status: "sent",
      provider: "gmail",
      provider_message_id: info.messageId,
      sent_at: new Date().toISOString(),
      scheduled_for: new Date().toISOString(),
      idempotency_key: `contact-save-auto-${clientId}-${Date.now()}`,
    });

    return true;
  } catch (err) {
    console.error("Auto email trigger error:", err);
    return false;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    await requireRole("viewer");
    const { clientId } = await params;
    const admin = getAdminClient();
    const { formatPaise } = await import("@/lib/money");
    const nodemailer = await import("nodemailer");

    const { data: client } = await (admin as any)
      .from("client")
      .select("id, name, client_code")
      .eq("id", clientId)
      .single();

    const { data: contact } = await (admin as any)
      .from("contact")
      .select("email, full_name")
      .eq("client_id", clientId)
      .maybeSingle();

    if (!contact?.email) {
      return NextResponse.json({ success: false, error: "No email address set for this client" }, { status: 400 });
    }

    const { data: balanceEntries } = await (admin as any)
      .from("ledger_entry")
      .select("bill_amount_paise")
      .eq("client_id", clientId);

    const dbTotalPaise = ((balanceEntries as Array<Record<string, any>>) ?? []).reduce(
      (acc: bigint, row: Record<string, any>) => acc + BigInt(row.bill_amount_paise ?? 0),
      0n
    );

    const smtpUser = process.env.SMTP_USER || "siddheshvelocity31@gmail.com";
    const smtpPass = process.env.SMTP_PASS || "bkxr jpvq sybc wcjq";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: `"VSAR Recovery System" <${smtpUser}>`,
      to: contact.email,
      subject: `Payment Reminder Notice - ${client.name} (${client.client_code})`,
      text: [
        `Dear ${contact.full_name || "Accounts Team"},`,
        ``,
        `This is an automated payment reminder generated for ${client.name}.`,
        ``,
        `CLIENT DETAILS:`,
        `------------------------------------------------`,
        `Client Name          : ${client.name}`,
        `Client Code          : ${client.client_code}`,
        `Total Outstanding   : ${formatPaise(dbTotalPaise)}`,
        `Status               : Outstanding Overdue Balance Detected`,
        `------------------------------------------------`,
        ``,
        `Please review the client statement in your VSAR Recovery Dashboard.`,
        ``,
        `Best regards,`,
        `Accounts Receivable Team`,
        `VSAR Technologies`,
      ].join("\n"),
    });

    // Record outreach in DB
    await (admin as any).from("outreach").insert({
      client_id: clientId,
      channel: "email",
      cadence_step_number: 1,
      template_key: "payment_reminder",
      persona_tone: "firm",
      rendered_body: `Payment reminder sent for ${client.name} - ${formatPaise(dbTotalPaise)}`,
      status: "sent",
      provider: "gmail",
      provider_message_id: info.messageId,
      sent_at: new Date().toISOString(),
      scheduled_for: new Date().toISOString(),
      idempotency_key: `manual-test-${clientId}-${Date.now()}`,
    });

    return NextResponse.json({ success: true, message: `Payment reminder sent successfully to ${contact.email}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || "Failed to send email" }, { status: 500 });
  }
}
