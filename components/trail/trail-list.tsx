import { formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  FileText,
  AlertCircle,
  Package,
  CheckCircle,
  MessageSquare,
  Bell,
  Flag,
  Settings,
  Activity,
} from "lucide-react";
import { BUSINESS_TZ } from "@/lib/dates";
import { cn } from "@/lib/cn";

interface TrailEvent {
  id: string;
  type: string;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

interface TrailListProps {
  events: TrailEvent[];
}

function iconForType(type: string) {
  if (type.startsWith("ledger.")) return FileText;
  if (type.startsWith("open_item.")) return Package;
  if (type.startsWith("case.")) return Activity;
  if (type.startsWith("outreach.")) return MessageSquare;
  if (type.startsWith("reply.")) return MessageSquare;
  if (type.startsWith("commitment.")) return CheckCircle;
  if (type.startsWith("flag.")) return Flag;
  if (type.startsWith("client.")) return Bell;
  if (type.startsWith("settings.")) return Settings;
  return AlertCircle;
}

function labelForType(type: string): string {
  return type.replace(/\./g, " ").replace(/_/g, " ");
}

function groupByDay(events: TrailEvent[]): Map<string, TrailEvent[]> {
  const groups = new Map<string, TrailEvent[]>();
  for (const e of events) {
    const ist = toZonedTime(new Date(e.occurred_at), BUSINESS_TZ);
    const key = ist.toLocaleDateString("en-IN", {
      timeZone: BUSINESS_TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  return groups;
}

function PayloadSummary({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "ledger.imported") {
    return (
      <span className="text-mono-sm text-muted">
        {payload["row_count_imported"] as number ?? 0} rows imported
        {(payload["row_count_rejected"] as number) > 0 ? `, ${payload["row_count_rejected"]} rejected` : ""}
      </span>
    );
  }
  if (type === "ledger.import_failed") {
    return <span className="text-mono-sm text-error">{String(payload["error"] ?? "Import failed")}</span>;
  }
  if (type === "commitment.confirmed") {
    const dueAt = payload["due_at"] ? new Date(String(payload["due_at"])).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    }) : null;
    const amountPaise = payload["amount_paise"] ? BigInt(String(payload["amount_paise"])) : null;
    const amountStr = amountPaise ? `₹${(Number(amountPaise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : null;
    return (
      <span className="text-mono-sm text-success font-medium">
        ✅ Promise to Pay{amountStr ? ` ${amountStr}` : ""}{dueAt ? ` by ${dueAt}` : ""}
      </span>
    );
  }
  if (type === "commitment.broken") {
    return (
      <span className="text-mono-sm text-error font-medium">
        ❌ Promise broken — payment not received by due date
      </span>
    );
  }
  if (type === "reply.received") {
    const snippet = payload["body_snippet"] ? String(payload["body_snippet"]) : null;
    const channel = payload["channel"] ? String(payload["channel"]) : null;
    return (
      <span className="text-mono-sm text-muted">
        {channel ? `via ${channel}` : ""}{snippet ? ` — "${snippet.slice(0, 80)}${snippet.length > 80 ? "…" : ""}"` : ""}
      </span>
    );
  }
  const keys = Object.keys(payload).filter((k) => k !== "id");
  if (keys.length === 0) return null;
  return (
    <span className="text-mono-sm text-muted truncate max-w-xs">
      {keys.slice(0, 2).map((k) => `${k}: ${JSON.stringify(payload[k])}`).join(", ")}
    </span>
  );
}

export function TrailList({ events }: TrailListProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-sm border border-neutral-200 p-8 text-center dark:border-white/15">
        <p className="text-body text-muted">No trail events yet.</p>
      </div>
    );
  }

  const groups = groupByDay(events);

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([day, dayEvents]) => (
        <div key={day}>
          <p className="mb-3 text-label uppercase tracking-widest text-secondary">{day}</p>
          <div className="space-y-1">
            {dayEvents.map((e) => {
              const Icon = iconForType(e.type);
              const ist = toZonedTime(new Date(e.occurred_at), BUSINESS_TZ);
              const absoluteIST = ist.toLocaleTimeString("en-IN", {
                timeZone: BUSINESS_TZ,
                hour: "2-digit",
                minute: "2-digit",
              });
              const relative = formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true });
              const isError = e.type.includes("failed");

              return (
                <div key={e.id} className="flex items-start gap-3 py-2">
                  <div
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm",
                      isError
                        ? "bg-red-100 text-error dark:bg-red-900/20"
                        : "bg-neutral-100 text-secondary dark:bg-neutral-800",
                    )}
                  >
                    <Icon size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-medium text-primary capitalize">{labelForType(e.type)}</p>
                    <PayloadSummary type={e.type} payload={e.payload} />
                  </div>
                  <time
                    title={`${absoluteIST} IST`}
                    dateTime={e.occurred_at}
                    className="shrink-0 text-mono-sm text-muted whitespace-nowrap"
                  >
                    {relative}
                  </time>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}