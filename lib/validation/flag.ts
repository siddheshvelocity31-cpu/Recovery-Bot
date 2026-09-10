import { z } from "zod"

export const AcknowledgeSchema = z.object({
  reason: z.string().min(3),
  ack_until: z.string().datetime(),
})

export type AcknowledgeInput = z.infer<typeof AcknowledgeSchema>
