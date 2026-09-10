import "server-only"

import { evaluateClientFlags } from "@/lib/flags/evaluate"
import type { Job } from "@/lib/jobs/queue"

export async function handleFlagsEvaluate(job: Job): Promise<void> {
  const client_id = job.payload.client_id as string
  await evaluateClientFlags(client_id, new Date())
}
