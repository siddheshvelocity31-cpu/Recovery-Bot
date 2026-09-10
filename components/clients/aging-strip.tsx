import { formatPaise } from "@/lib/money";

export interface AgingStripProps {
  total_paise: string;
  unaged_paise: string;
  current_paise: string;
  d1_30_paise: string;
  d31_60_paise: string;
  d61_90_paise: string;
  d90_plus_paise: string;
}

interface Segment {
  key: string;
  label: string;
  paise: bigint;
  barClassName: string;
  legendClassName: string;
}

function pct(bucket: bigint, total: bigint): string {
  if (total === 0n) return "0";
  const p = (Number(bucket) / Number(total)) * 100;
  return p.toFixed(1);
}

export function AgingStrip({
  total_paise,
  unaged_paise,
  current_paise,
  d1_30_paise,
  d31_60_paise,
  d61_90_paise,
  d90_plus_paise,
}: AgingStripProps) {
  const total = BigInt(total_paise);

  if (total === 0n) {
    return (
      <div className="rounded-sm border border-neutral-200 p-6 text-center dark:border-white/15">
        <p className="text-body text-muted">No outstanding balance.</p>
      </div>
    );
  }

  const segments: Segment[] = [
    {
      key: "unaged",
      label: "B/F (unaged)",
      paise: BigInt(unaged_paise),
      barClassName: "bg-neutral-400",
      legendClassName: "bg-neutral-400",
    },
    {
      key: "current",
      label: "Current",
      paise: BigInt(current_paise),
      barClassName: "bg-success",
      legendClassName: "bg-success",
    },
    {
      key: "d1_30",
      label: "1–30 days",
      paise: BigInt(d1_30_paise),
      barClassName: "bg-info",
      legendClassName: "bg-info",
    },
    {
      key: "d31_60",
      label: "31–60 days",
      paise: BigInt(d31_60_paise),
      barClassName: "bg-warning",
      legendClassName: "bg-warning",
    },
    {
      key: "d61_90",
      label: "61–90 days",
      paise: BigInt(d61_90_paise),
      barClassName: "bg-error/70",
      legendClassName: "bg-error/70",
    },
    {
      key: "d90_plus",
      label: "90+ days",
      paise: BigInt(d90_plus_paise),
      barClassName: "bg-error",
      legendClassName: "bg-error",
    },
  ];

  const nonZero = segments.filter((s) => s.paise > 0n);

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-sm">
        {nonZero.map((s) => {
          const widthPct = pct(s.paise, total);
          return (
            <div
              key={s.key}
              className={s.barClassName}
              style={{ width: `${widthPct}%` }}
              title={`${s.label}: ${formatPaise(s.paise)} (${widthPct}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {nonZero.map((s) => {
          const widthPct = pct(s.paise, total);
          return (
            <div key={s.key} className="flex items-center gap-2 text-body-sm">
              <span className={`inline-block h-3 w-3 rounded-sm ${s.legendClassName}`} />
              <span className="font-medium text-primary">{s.label}</span>
              <span className="text-muted">
                {formatPaise(s.paise)} ({widthPct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}