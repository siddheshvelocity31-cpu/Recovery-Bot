import { failJob } from "@/lib/jobs/queue";
import type { Job } from "@/lib/jobs/queue";
import { handleLedgerParseChunk as _handleLedgerParseChunk } from "@/lib/jobs/handlers/ledger-parse-chunk";
import { handleDeriveOpenItems } from "@/lib/jobs/handlers/ledger-derive-open-items";
import { handleAgingRecompute } from "@/lib/jobs/handlers/aging-recompute";
import { handleCaseEvaluate } from "@/lib/jobs/handlers/case-evaluate";
import { handleOutreachDispatch } from "@/lib/jobs/handlers/outreach-dispatch";
import { handleFlagsEvaluate } from "@/lib/jobs/handlers/flags-evaluate";
import { handleHealthCheck } from "@/lib/jobs/handlers/health-check";
import { handleCommitmentsVerify } from "@/lib/jobs/handlers/commitments-verify";

type JobHandler = (job: Job) => Promise<void>;

const handlerRegistry: Record<string, JobHandler> = {};

export function registerHandler(kind: string, handler: JobHandler) {
  handlerRegistry[kind] = handler;
}

export function getHandler(kind: string): JobHandler | undefined {
  return handlerRegistry[kind];
}

export async function handleJob(job: Job): Promise<void> {
  const handler = getHandler(job.kind);
  if (!handler) {
    await failJob(job.id, `Unknown job kind: ${job.kind}`);
    return;
  }

  try {
    await handler(job);
  } catch (err) {
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function noopHandler(_job: Job): Promise<void> {
  // No-op
}

// Wrap the ledger parse chunk handler to conform to the JobHandler signature
async function handleLedgerParseChunk(job: Job): Promise<void> {
  const importId = job.payload.import_id as string;
  const cursor = (job.payload.cursor as number | undefined) ?? 0;
  await _handleLedgerParseChunk(importId, cursor);
}

// Register all handlers so the cron tick can dispatch them
registerHandler("ledger.parse_chunk", handleLedgerParseChunk);
registerHandler("ledger.derive_open_items", handleDeriveOpenItems);
registerHandler("aging.recompute", handleAgingRecompute);
registerHandler("case.evaluate", handleCaseEvaluate);
registerHandler("outreach.dispatch", handleOutreachDispatch);
registerHandler("flags.evaluate", handleFlagsEvaluate);
registerHandler("health.check", handleHealthCheck);
registerHandler("commitments.verify", handleCommitmentsVerify);
