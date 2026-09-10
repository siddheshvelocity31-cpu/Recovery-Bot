import "server-only";

import type { Job } from "@/lib/jobs/queue";
import { verifyCommitments } from "@/lib/commitments/verify";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleCommitmentsVerify(_job: Job): Promise<void> {
  await verifyCommitments();
}
