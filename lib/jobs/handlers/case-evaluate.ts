import "server-only"

import { evaluateCase } from "@/lib/cases/evaluate"
import type { Job } from "@/lib/jobs/queue"

export async function handleCaseEvaluate(job: Job): Promise<void> {
  const client_id = job.payload.client_id as string
  await evaluateCase(client_id, new Date())
}
