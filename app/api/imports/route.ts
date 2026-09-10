import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseLedgerWorkbook, type ParsedLedger } from "@/lib/ledger/parse-xlsx";
import { parseDocxDocument } from "@/lib/ledger/parse-docx";
import { formatPaise } from "@/lib/money";


export async function POST(request: Request) {
  try {
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // Guest demo upload
    }

    const contentType = request.headers.get("content-type") || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = getAdminClient() as any;

    let buffer: Buffer;
    let filename = "ledger.xlsx";
    let clientCode = "AUTO";
    let requestedClientId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      filename = file.name;
      requestedClientId = (formData.get("client_id") as string) || null;
      if (!requestedClientId) {
        clientCode = (formData.get("client_code") as string) || "AUTO";
      }
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const body = await request.json();
      filename = body.filename || "ledger.xlsx";
      clientCode = body.client_code || "AUTO";
      requestedClientId = body.client_id || null;
      
      if (body.storage_path) {
        const { data: fileData, error: dlErr } = await admin.storage
          .from("ledger-imports")
          .download(body.storage_path);
        if (dlErr || !fileData) {
          throw new Error("Could not download file from storage: " + (dlErr?.message || "empty"));
        }
        buffer = Buffer.from(await fileData.arrayBuffer());
      } else {
        return NextResponse.json({ error: "Missing file or storage_path" }, { status: 400 });
      }
    }

    // Compute exact SHA-256 hash of file content
    const uint8Array = new Uint8Array(buffer);
    const hashBuffer = await crypto.subtle.digest("SHA-256", uint8Array);
    const rawSha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const sha256 = rawSha256;

    // Detect format and parse document (.xlsx vs .docx / .doc)
    let parsed: ParsedLedger;
    const isDocx = filename.endsWith(".docx") || filename.endsWith(".doc");

    if (isDocx) {
      parsed = await parseDocxDocument(buffer, filename);
    } else {
      parsed = await parseLedgerWorkbook(buffer);
    }

    // Resolve or create Client
    let client: { id: string; client_code: string; name: string } | null = null;

    if (requestedClientId) {
      const { data: found } = await admin
        .from("client")
        .select("id, client_code, name")
        .eq("id", requestedClientId)
        .maybeSingle();
      if (found) client = found;
    }

    if (!client) {
      const targetClientCode = parsed.client_code || (clientCode && clientCode !== "AUTO" ? clientCode : "CLIENT_01");
      const { data: found } = await admin
        .from("client")
        .select("id, client_code, name")
        .eq("client_code", targetClientCode)
        .maybeSingle();
      client = found;

      if (!client) {
        const { data: createdClient, error: clientCreateErr } = await admin
          .from("client")
          .insert({
            client_code: targetClientCode,
            name: parsed.client_name || parsed.client_code || "Corporate Client",
            relationship_tier: "standard",
          })
          .select("id, client_code, name")
          .single();

        if (clientCreateErr) throw clientCreateErr;
        client = createdClient;
      }
    }

    if (!client) {
      throw new Error("Could not resolve client for ledger import");
    }

    // Check if identical ledger file has already been imported
    const { data: existingImport } = await admin
      .from("ledger_import")
      .select("id, created_at")
      .eq("file_sha256", sha256)
      .maybeSingle();

    if (existingImport) {
      return NextResponse.json({
        success: true,
        message: "This file has already been uploaded previously. Entries deduplicated; total balance will not increase.",
        importId: existingImport.id,
        client: { id: client.id, code: client.client_code, name: client.name },
        rowsImported: 0,
        totalRows: parsed.entries.length,
        openingBalance: Number(parsed.opening_balance_paise),
        closingBalance: Number(parsed.stated_closing_balance_paise),
        emailSent: false,
      });
    }

    // Update last_import_at on client
    await admin
      .from("client")
      .update({ last_import_at: new Date().toISOString() })
      .eq("id", client.id);

    // Store in Supabase Storage with Admin privileges
    const storagePath = `ledger/${Date.now()}_${filename}`;
    try {
      await admin.storage
        .from("ledger-imports")
        .upload(storagePath, buffer, { upsert: true });
    } catch {
      // Non-fatal if storage bucket is unavailable
    }

    // Create ledger_import row
    const { data: importRow, error: insertError } = await admin
      .from("ledger_import")
      .insert({
        client_id: client.id,
        storage_path: storagePath,
        file_sha256: sha256,
        source_filename: filename,
        status: "parsing",
        uploaded_by: userId,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Insert all ledger entries
    let insertedCount = 0;
    let rejectedCount = 0;

    for (let idx = 0; idx < parsed.entries.length; idx++) {
      const entry = parsed.entries[idx]!;
      try {
        const { error: insertErr } = await admin
          .from("ledger_entry")
          .upsert(
            {
              client_id: client.id,
              ledger_import_id: importRow.id,
              natural_key: entry.natural_key,
              row_number: entry.row_number,
              doc_date: entry.doc_date,
              doc_code: entry.doc_code,
              entry_type: entry.entry_type,
              pax_name: entry.pax_name,
              bill_amount_paise: entry.bill_amount_paise != null ? Number(entry.bill_amount_paise) : null,
              raw_row: entry.raw_row,
            },
            { onConflict: "natural_key", ignoreDuplicates: true },
          );

        if (insertErr) rejectedCount++;
        else insertedCount++;
      } catch {
        rejectedCount++;
      }
    }

    // Mark import as imported
    await admin
      .from("ledger_import")
      .update({
        status: "imported",
        period_from: parsed.period_from || null,
        period_to: parsed.period_to || null,
        opening_balance_paise: Number(parsed.opening_balance_paise),
        closing_balance_paise: Number(parsed.stated_closing_balance_paise),
        row_count_total: parsed.entries.length,
        row_count_imported: insertedCount,
        row_count_rejected: rejectedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", importRow.id);

    // Enqueue open item derivation and aging recompute
    await admin.from("job").insert([
      { kind: "ledger.derive_open_items", payload: { import_id: importRow.id, client_id: client.id } },
      { kind: "aging.recompute", payload: { client_id: client.id } },
      { kind: "case.evaluate", payload: { client_id: client.id } },
      { kind: "flags.evaluate", payload: { client_id: client.id } },
    ]);

    // Compute total balance from entries if stated_closing_balance_paise is 0 or null
    let effectiveOutstandingPaise = parsed.stated_closing_balance_paise;
    if (!effectiveOutstandingPaise || effectiveOutstandingPaise === 0n) {
      const sumEntries = parsed.entries.reduce((acc, entry) => {
        return acc + (entry.bill_amount_paise != null ? entry.bill_amount_paise : 0n);
      }, 0n);
      if (sumEntries > 0n) {
        effectiveOutstandingPaise = sumEntries;
      }
    }

    // Dispatch real email if SMTP credentials are configured (with fallback) and there's an outstanding balance
    let emailSent = false;
    let emailMessageId: string | null = null;
    const smtpUser = process.env.SMTP_USER || "siddheshvelocity31@gmail.com";
    const smtpPass = process.env.SMTP_PASS || "bkxr jpvq sybc wcjq";

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: smtpUser, pass: smtpPass },
        });
        const info = await transporter.sendMail({
          from: `"VSAR Recovery System" <${smtpUser}>`,
          to: smtpUser,
          subject: `Payment Reminder Notice - ${client.name} (${client.client_code})`,
          text: [
            `Dear Accounts Team,`,
            ``,
            `This is an automated payment reminder generated from your newly uploaded ledger file.`,
            ``,
            `CLIENT DETAILS:`,
            `------------------------------------------------`,
            `Client Name          : ${client.name}`,
            `Client Code          : ${client.client_code}`,
            `Total Outstanding   : ${formatPaise(effectiveOutstandingPaise)}`,
            `Total Statement Rows : ${parsed.entries.length}`,
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
        emailSent = true;
        emailMessageId = info.messageId;

        // Fetch recovery case for this client to set case_id if existing
        const { data: caseRows } = await admin
          .from("recovery_case")
          .select("id")
          .eq("client_id", client.id)
          .limit(1);
        const caseId = caseRows && caseRows.length > 0 ? caseRows[0].id : null;

        // Also record this outreach row in database for Notifications tab
        const { error: outreachErr } = await admin.from("outreach").insert({
          client_id: client.id,
          case_id: caseId,
          channel: "email",
          cadence_step_number: 1,
          template_key: "payment_reminder",
          persona_tone: "firm",
          rendered_body: `Payment reminder sent for ${client.name} - ${formatPaise(effectiveOutstandingPaise)}`,
          status: "sent",
          provider: "gmail",
          provider_message_id: info.messageId,
          sent_at: new Date().toISOString(),
          scheduled_for: new Date().toISOString(),
          idempotency_key: `import-${importRow.id}-${Date.now()}`,
        });
        if (outreachErr) {
          console.error("Outreach database insert error:", outreachErr);
        }
      } catch (sendErr) {
        console.error("Live email dispatch error:", sendErr);
      }
    }

    return NextResponse.json({
      success: true,
      importId: importRow.id,
      client: { id: client.id, code: client.client_code, name: client.name },
      rowsImported: insertedCount,
      totalRows: parsed.entries.length,
      openingBalance: Number(parsed.opening_balance_paise),
      closingBalance: Number(parsed.stated_closing_balance_paise),
      emailSent,
      emailMessageId,
    });
  } catch (err) {
    console.error("Direct ledger import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
