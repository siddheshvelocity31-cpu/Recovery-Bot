import "server-only"

import { logger } from "@/lib/logger"

export interface DryRunSendInput {
  outreach_id: string
  rendered_body: string
  channel: string
}

export interface DryRunSendResult {
  provider: "dry-run"
  provider_message_id: string
  status: "sent"
}

export async function dryRunSend(
  input: DryRunSendInput,
): Promise<DryRunSendResult> {
  logger.info("dry-run outreach", {
    outreach_id: input.outreach_id,
    channel: input.channel,
    rendered_body: input.rendered_body,
  })

  return {
    provider: "dry-run",
    provider_message_id: `dry-run-${input.outreach_id}`,
    status: "sent",
  }
}
