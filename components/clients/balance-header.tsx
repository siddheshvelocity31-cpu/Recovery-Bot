import { formatPaise } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";

interface FlagSummary {
  red: number;
  amber: number;
  grey: number;
}

interface BalanceHeaderProps {
  name: string;
  client_code: string;
  relationship_tier: string | null;
  behaviour_band: string | null;
  balance_paise: string;
  entry_count: number;
  flagSummary?: FlagSummary;
}

export function BalanceHeader({
  name,
  client_code,
  relationship_tier,
  behaviour_band,
  balance_paise,
  entry_count,
  flagSummary,
}: BalanceHeaderProps) {
  const paise = BigInt(balance_paise ?? "0");

  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h1 text-primary">{name}</h1>
          <p className="mt-1 text-mono text-muted">{client_code}</p>
        </div>
        <div className="text-right">
          <p className="text-label text-muted mb-1">Current balance</p>
          <p
            className={cn(
              "text-display font-mono tabular-nums font-medium",
              paise < 0n ? "text-error" : "text-primary",
            )}
          >
            {formatPaise(paise)}
          </p>
          <p className="mt-1 text-body-sm text-muted">
            {entry_count} {entry_count === 1 ? "entry" : "entries"}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {relationship_tier && (
          <Badge variant={
            relationship_tier === "strategic" ? "success"
            : relationship_tier === "watchlist" ? "error"
            : "default"
          }>
            {relationship_tier}
          </Badge>
        )}
        {behaviour_band && behaviour_band !== "unknown" && (
          <Badge variant="outline">{behaviour_band}</Badge>
        )}
      </div>
      {flagSummary && (flagSummary.red > 0 || flagSummary.amber > 0 || flagSummary.grey > 0) && (
        <div className="mt-4 flex items-center gap-3 text-body-sm flex-wrap">
          {flagSummary.red > 0 && (
            <StatusDot tone="error" label={`${flagSummary.red} red`} />
          )}
          {flagSummary.amber > 0 && (
            <StatusDot tone="warning" label={`${flagSummary.amber} amber`} />
          )}
          {flagSummary.grey > 0 && (
            <StatusDot tone="neutral" label={`${flagSummary.grey} grey`} />
          )}
          <span className="text-muted">flags active</span>
        </div>
      )}
    </div>
  );
}