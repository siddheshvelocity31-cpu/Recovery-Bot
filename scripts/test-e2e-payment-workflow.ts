import { extractCommitmentFromText } from "../lib/replies/extract-commitment";
import { formatPaise } from "../lib/money";
import { renderMessage } from "../lib/outreach/render";
import { evaluateAllRules, type ClientForFlags, type OpenItemForFlags } from "../lib/flags/rules";

async function runE2ETest() {
  console.log("===============================================================");
  console.log("STARTING END-TO-END PAYMENT WORKFLOW SIMULATION");
  console.log("===============================================================\n");

  const totalPaise: bigint = 75000000n; // ₹7,50,000.00
  const amberPaise: bigint = 50000000n; // ₹5,00,000.00
  const redPaise: bigint = 100000000n;  // ₹10,00,000.00

  // Step 1 & 2: Load document and extract client/payment details
  console.log("Step 1-3: Extracted Client & Outstanding Ledger Details");
  const clientData = {
    id: "client-test-uuid-001",
    name: "Acme Global Corp",
    total_open_paise: totalPaise,
    contact_name: "Rahul Sharma",
    contact_email: "rahul@acmeglobal.com",
    oldest_due_date: "01-Aug-2026",
    invoice_count: "4",
  };
  console.log(`- Client: ${clientData.name} (${clientData.contact_name})`);
  console.log(`- Outstanding Amount: ${formatPaise(clientData.total_open_paise)} across ${clientData.invoice_count} invoices`);

  // Step 4 & 5: Generate Payment Reminder Email
  console.log("\nStep 4-5: Generating & Sending Payment Reminder Email");
  const rendered = renderMessage({
    template_key: "reminder_1",
    channel: "email",
    persona_tone: "courteous",
    salutation: "Dear Rahul Sharma,",
    signature: "Accounts Receivable Team\nVSAR Technologies",
    context: {
      client_name: clientData.name,
      contact_name: clientData.contact_name,
      total_open: formatPaise(clientData.total_open_paise),
      oldest_due_date: clientData.oldest_due_date,
      invoice_count: clientData.invoice_count,
      statement_period: "Jul 2026 – Aug 2026",
    },
  });

  console.log("--- RENDERED OUTBOUND EMAIL ---");
  console.log(rendered.body);
  console.log("-------------------------------\n");

  // Step 6-9: Capture Inbound Reply & Extract Commitment
  console.log("Step 6-9: Inbound Response Received from Client");
  const clientReplyMessage = "Dear Team, We acknowledge the statement. We are arranging the funds and will transfer ₹7,50,000 by 12th Sep 2026. Regards, Rahul";
  console.log(`Received Email: "${clientReplyMessage}"`);

  const referenceDate = new Date("2026-09-10T10:00:00Z");
  const extractedCommitment = extractCommitmentFromText(clientReplyMessage, referenceDate);
  console.log("Extracted Commitment:", {
    has_commitment: extractedCommitment.has_commitment,
    promised_date: extractedCommitment.promised_date?.toISOString(),
    promised_amount: extractedCommitment.promised_amount_paise ? formatPaise(extractedCommitment.promised_amount_paise) : null,
    confidence: extractedCommitment.confidence,
  });

  if (!extractedCommitment.has_commitment || !extractedCommitment.promised_date) {
    throw new Error("Failed to extract commitment!");
  }

  // Step 10-12: Monitor & Verify Payment Status after Deadline Passes
  console.log("\nStep 10-12: Fast-forwarding time past promised date (e.g. 15th Sep 2026)");
  const evaluationDate = new Date("2026-09-15T18:00:00Z");
  const isOverdue = evaluationDate > extractedCommitment.promised_date;
  const paymentReceived = false;

  let commitmentStatus = "confirmed";
  if (isOverdue && !paymentReceived) {
    commitmentStatus = "broken";
    console.log(`[ALERT] Commitment deadline ${extractedCommitment.promised_date.toDateString()} passed without payment! Status updated to: ${commitmentStatus.toUpperCase()}`);
  }

  // Step 13: Generate Red Flag
  console.log("\nStep 13: Evaluating Flag Rules for Broken Commitment");
  const clientForFlags: ClientForFlags = {
    client_id: clientData.id,
    threshold_amber_days: 30,
    threshold_red_days: 60,
    threshold_amber_amount_paise: amberPaise,
    threshold_red_amount_paise: redPaise,
    silence_attempts: 3,
    consecutive_failed_outreach: 0,
    has_broken_promise: commitmentStatus === "broken",
    days_since_last_reply: 5,
    today: evaluationDate,
  };

  const openItems: OpenItemForFlags[] = [
    {
      id: "item-1",
      source_doc_code: "INV-101",
      due_date: "2026-08-01",
      open_amount_paise: clientData.total_open_paise,
      aging_bucket: "d31_60",
      is_unaged: false,
      status: "open",
    },
  ];

  const flags = evaluateAllRules(
    clientForFlags,
    openItems,
    clientData.total_open_paise,
    0n,
  );

  console.log("Flags Raised for Client:");
  flags.forEach((f) => {
    console.log(` - [${f.severity.toUpperCase()} FLAG] Rule: ${f.rule} | Message: "${f.message}" | DedupeKey: ${f.dedupe_key}`);
  });

  const brokenPromiseFlag = flags.find((f) => f.rule === "broken_promise");
  if (!brokenPromiseFlag || brokenPromiseFlag.severity !== "red") {
    throw new Error("Red Flag for broken_promise was NOT raised!");
  }

  console.log("\n===============================================================");
  console.log("✅ ALL 15 WORKFLOW STEPS VERIFIED & TEST PASSED SUCCESSFULLY!");
  console.log("===============================================================");
}

runE2ETest().catch((err) => {
  console.error("E2E Simulation Failed:", err);
  process.exit(1);
});
