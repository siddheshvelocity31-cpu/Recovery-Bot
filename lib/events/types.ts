import { z } from "zod";

export const eventTypeSchema = z.union([
  z.literal("ledger.imported"),
  z.literal("ledger.import_failed"),
  z.literal("open_item.created"),
  z.literal("open_item.settled"),
  z.literal("open_item.disputed"),
  z.literal("case.opened"),
  z.literal("case.advanced"),
  z.literal("case.suppressed"),
  z.literal("case.escalated"),
  z.literal("case.resolved"),
  z.literal("outreach.scheduled"),
  z.literal("outreach.suppressed"),
  z.literal("outreach.dry_run"),
  z.literal("outreach.sent"),
  z.literal("outreach.delivered"),
  z.literal("outreach.failed"),
  z.literal("reply.received"),
  z.literal("commitment.proposed"),
  z.literal("commitment.confirmed"),
  z.literal("commitment.kept"),
  z.literal("commitment.broken"),
  z.literal("flag.raised"),
  z.literal("flag.acknowledged"),
  z.literal("flag.resolved"),
  z.literal("client.categorised"),
  z.literal("client.muted"),
  z.literal("client.unmuted"),
  z.literal("settings.changed"),
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export interface EventRow {
  id: string;
  client_id: string;
  case_id: string | null;
  actor_type: "system" | "user" | "client";
  actor_id: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface WriteEventParams {
  clientId: string;
  caseId?: string;
  actorType: "system" | "user" | "client";
  actorId?: string;
  type: EventType;
  payload?: Record<string, unknown>;
}
