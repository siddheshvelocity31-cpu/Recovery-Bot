import "server-only";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BellRing,
  CheckCircle2,
  CircleDot,
  RadioTower,
} from "lucide-react";
import { requireRole } from "@/lib/auth/require-role";
import { getAdminClient } from "@/lib/supabase/admin";
import { AlertBoard, type FlagRowData } from "@/components/flags/alert-board";

interface RawFlag {
  id: string;
  client_id: string;
  rule: string;
  severity: string;
  message: string;
  dedupe_key: string;
  raised_at: string;
  acknowledged_by: string | null;
  ack_reason: string | null;
  ack_until: string | null;
  resolved_at: string | null;
  client: { name: string; client_code: string } | null;
}

function toFlagRowData(r: RawFlag): FlagRowData {
  return {
    id: r.id,
    client_id: r.client_id,
    rule: r.rule,
    severity: r.severity,
    message: r.message,
    dedupe_key: r.dedupe_key,
    raised_at: r.raised_at,
    acknowledged_by: r.acknowledged_by,
    ack_reason: r.ack_reason,
    ack_until: r.ack_until,
    resolved_at: r.resolved_at,
    client: r.client,
  };
}

function StatCard({ label, value, icon: Icon, tone = "neutral" }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "error" | "warning" | "neutral" | "success";
}) {
  const toneText = {
    error: "text-error",
    warning: "text-warning",
    neutral: "text-primary",
    success: "text-success",
  }[tone];

  const toneIcon = {
    error: "bg-red-500/15 text-error border-red-500/30",
    warning: "bg-amber-500/15 text-warning border-amber-500/30",
    neutral: "bg-white/5 text-primary border-white/15",
    success: "bg-emerald-500/15 text-success border-emerald-500/30",
  }[tone];

  return (
    <div className="glass-strong rounded-sm p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <p className="text-label text-muted">{label}</p>
        <Icon size={14} className={toneIcon.split(" ").find((c) => c.startsWith("text-")) ?? "text-muted"} aria-hidden="true" />
      </div>
      <p className={`text-h2 font-mono tabular-nums ${toneText}`}>{value}</p>
    </div>
  );
}

export default async function AlertBoardPage() {
  await requireRole("viewer");

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const now = new Date().toISOString();

  const { data, error } = await adminAny
    .from("flag")
    .select("id, client_id, rule, severity, message, dedupe_key, raised_at, acknowledged_by, ack_reason, ack_until, resolved_at, client:client(name, client_code)")
    .is("resolved_at", null)
    .order("raised_at", { ascending: false }) as { data: RawFlag[] | null; error: unknown };

  if (error) {
    return (
      <div className="container py-8">
        <h1 className="mb-6 text-h1 text-primary">Alert Board</h1>
        <div className="glass-strong rounded-sm p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <p className="text-body text-error">Failed to load flags.</p>
          </div>
        </div>
      </div>
    );
  }

  const allFlags = (data ?? []).map(toFlagRowData);

  const liveFlags = allFlags.filter((f) => f.ack_until === null || f.ack_until <= now);
  const acknowledgedFlags = allFlags.filter((f) => f.ack_until !== null && f.ack_until > now);

  const severityOrder: Record<string, number> = { red: 0, amber: 1, grey: 2 };
  liveFlags.sort((a, b) => {
    const aS = severityOrder[a.severity] ?? 99;
    const bS = severityOrder[b.severity] ?? 99;
    if (aS !== bS) return aS - bS;
    return b.raised_at.localeCompare(a.raised_at);
  });

  const liveRedCount = liveFlags.filter((f) => f.severity === "red").length;
  const liveAmberCount = liveFlags.filter((f) => f.severity === "amber").length;
  const liveGreyCount = liveFlags.filter((f) => f.severity === "grey").length;
  const showMiscalibration = liveRedCount > 10;

  const totalFlags = liveFlags.length;

  return (
    <div className="container py-8">
      {/* Hero — vsartech.com style */}
      <div className="relative mb-10 overflow-hidden rounded-sm glass-strong p-6 sm:p-8 animate-slide-down">
        <div className="absolute inset-0 -z-10 bg-radial-glow" aria-hidden="true" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <RadioTower size={16} className="text-success animate-pulse-glow" aria-hidden="true" />
            <p className="text-label text-success tracking-widest">Operational Overview</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-h1 text-primary tracking-tight">Alert Board</h1>
              <p className="mt-2 text-body text-secondary">
                {totalFlags > 0
                  ? `${totalFlags} active flag${totalFlags === 1 ? "" : "s"} requiring attention.`
                  : "All systems operating normally."}
              </p>
            </div>
            {totalFlags === 0 && (
              <div className="flex items-center gap-2 rounded-full border border-success/30 bg-emerald-500/10 px-4 py-2">
                <CheckCircle2 size={14} className="text-success" aria-hidden="true" />
                <span className="text-label text-success">All Clear</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat strip — animated on load */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 stagger-children">
        <StatCard label="Red flags" value={liveRedCount} icon={AlertTriangle} tone="error" />
        <StatCard label="Amber flags" value={liveAmberCount} icon={Activity} tone="warning" />
        <StatCard label="Resolved / grey" value={liveGreyCount + acknowledgedFlags.length} icon={CircleDot} tone="neutral" />
      </div>

      {showMiscalibration && (
        <div className="mb-6 glass-strong rounded-sm p-4 animate-slide-up">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="text-label font-semibold text-warning">Miscalibration warning</p>
              <p className="mt-1 text-body text-secondary">
                {liveRedCount} red flags are active — thresholds may be too sensitive.{" "}
                <Link href="/settings/categories" className="underline hover:text-warning">
                  Review category settings
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      <AlertBoard liveFlags={liveFlags} acknowledgedFlags={acknowledgedFlags} />
    </div>
  );
}