import { NextResponse } from "next/server";
import { claimJobs, failJob, reclaimStuckJobs } from "@/lib/jobs/queue";
import { handleJob } from "@/lib/jobs/handlers/index";
import { recordTick } from "@/lib/config/system";

const DEFAULT_BATCH_SIZE = 20;

async function runCronTick(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");

  const cronSecret = process.env.CRON_SECRET;
  // If CRON_SECRET is not set, allow without auth (development / initial setup)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startTime = Date.now();
  const maxElapsedMs = 80 * 1000;
  let processed = 0;
  let failed = 0;

  const { jobs } = await claimJobs(DEFAULT_BATCH_SIZE);

  for (const job of jobs) {
    if (Date.now() - startTime > maxElapsedMs) break;
    try {
      await handleJob(job);
      processed++;
    } catch (err) {
      failed++;
      await failJob(job.id, err instanceof Error ? err.message : String(err));
    }
  }

  const stuckJobs = await reclaimStuckJobs();
  for (const job of stuckJobs) {
    if (Date.now() - startTime > maxElapsedMs) break;
    try {
      await handleJob(job);
      processed++;
    } catch (err) {
      failed++;
      await failJob(job.id, err instanceof Error ? err.message : String(err));
    }
  }

  await recordTick().catch(() => { /* non-fatal */ });

  return NextResponse.json({ claimed: jobs.length, processed, failed });
}

// Vercel Cron sends GET requests — export GET as primary handler
export async function GET(request: Request): Promise<NextResponse> {
  return runCronTick(request);
}

// Also support POST for manual triggering and backward compatibility
export async function POST(request: Request): Promise<NextResponse> {
  return runCronTick(request);
}
