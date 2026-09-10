import "server-only"

import { dispatchOutreach } from "@/lib/outreach/dispatch"
import type { Job } from "@/lib/jobs/queue"

export async function handleOutreachDispatch(job: Job): Promise<void> {
  const outreach_id = job.payload.outreach_id as string
  await dispatchOutreach(outreach_id)
}
