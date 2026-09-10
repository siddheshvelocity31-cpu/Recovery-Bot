import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface FlagRowFlag {
  id: string;
  rule: string;
  severity: string;
  message: string;
  raised_at: string;
  acknowledged_at: string | null;
  ack_reason: string | null;
  ack_until: string | null;
  client_id: string;
  client_name?: string;
}

interface FlagRowProps {
  flag: FlagRowFlag;
  onSnooze?: (id: string) => void;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { variant: "error" | "warning" | "default" }> = {
    red: { variant: "error" },
    amber: { variant: "warning" },
    grey: { variant: "default" },
  };
  const config = map[severity] ?? { variant: "default" };
  return <Badge variant={config.variant} className="text-label uppercase tracking-wider">{severity}</Badge>;
}

export function FlagRow({ flag, onSnooze }: FlagRowProps) {
  const isAcknowledged = flag.acknowledged_at !== null;
  const relative = formatDistanceToNow(new Date(flag.raised_at), { addSuffix: true });

  const ackUntilFormatted = flag.ack_until
    ? new Date(flag.ack_until).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-sm border p-4 transition-all duration-200",
        isAcknowledged
          ? "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
          : flag.severity === "red"
          ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20"
          : flag.severity === "amber"
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20"
          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
      )}
    >
      {/* Severity badge */}
      <div className="shrink-0 pt-0.5">
        <SeverityBadge severity={flag.severity} />
      </div>

      {/* Main content */}
      <div className={cn("flex-1 min-w-0", isAcknowledged && "opacity-60")}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-body font-semibold text-primary capitalize">{flag.rule.replace(/_/g, " ")}</span>
          {flag.client_name && (
            <Link
              href={`/clients/${flag.client_id}`}
              className="text-body-sm text-secondary hover:text-primary hover:underline dark:text-neutral-400 dark:hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white truncate max-w-48"
            >
              {flag.client_name}
            </Link>
          )}
        </div>
        <p className="mt-1 text-body-sm text-secondary">{flag.message}</p>
        {isAcknowledged && (
          <p className="mt-2 text-mono-sm text-muted italic">
            Acknowledged
            {ackUntilFormatted ? ` until ${ackUntilFormatted}` : ""}
            {flag.ack_reason ? ` — ${flag.ack_reason}` : ""}
          </p>
        )}
      </div>

      {/* Time & Snooze */}
      <div className="flex items-center gap-2 shrink-0">
        <time
          dateTime={flag.raised_at}
          title={new Date(flag.raised_at).toLocaleString("en-IN")}
          className={cn(
            "text-mono-sm whitespace-nowrap",
            isAcknowledged ? "text-muted" : "text-secondary",
          )}
        >
          {relative}
        </time>
        {onSnooze && !isAcknowledged && (
          <Button variant="ghost" size="sm" onClick={() => onSnooze(flag.id)} title="Snooze">
            Snooze
          </Button>
        )}
      </div>
    </div>
  );
}