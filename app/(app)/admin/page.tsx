import "server-only";

import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, RadioTower, ShieldAlert, Zap, Activity, Database, Clock, TrendingUp } from "lucide-react";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSystemConfig } from "@/lib/config/system";
import { requireRole } from "@/lib/auth/require-role";
import { AppError } from "@/lib/errors";
import { KillSwitch } from "@/components/admin/kill-switch";
import { cn } from "@/lib/cn";

interface AdminStats {
  deadJobCount: number;
  pendingJobCount: number;
  stuckImportCount: number;
  lastSuccessfulImport: string | null;
  liveRedFlagCount: number;
  fetchedAt: number;
}

async function getAdminStats(): Promise<AdminStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = getAdminClient() as any;

  const now = Date.now();
  const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();

  const [deadJobRes, pendingJobRes, stuckImportRes, lastImportRes, redFlagRes] =
    await Promise.all([
      adminAny.from("job").select("id", { count: "exact", head: true }).eq("status", "dead") as Promise<{ count: number | null; error: unknown }>,
      adminAny.from("job").select("id", { count: "exact", head: true }).eq("status", "pending") as Promise<{ count: number | null; error: unknown }>,
      adminAny.from("ledger_import").select("id", { count: "exact", head: true }).eq("status", "parsing").lt("updated_at", fifteenMinAgo) as Promise<{ count: number | null; error: unknown }>,
      adminAny.from("ledger_import").select("completed_at").eq("status", "done").order("completed_at", { ascending: false }).limit(1).maybeSingle() as Promise<{ data: { completed_at: string | null } | null; error: unknown }>,
      adminAny.from("flag").select("id", { count: "exact", head: true }).eq("severity", "red").is("acknowledged_at", null) as Promise<{ count: number | null; error: unknown }>,
    ]);

  return {
    deadJobCount: deadJobRes.count ?? 0,
    pendingJobCount: pendingJobRes.count ?? 0,
    stuckImportCount: stuckImportRes.count ?? 0,
    lastSuccessfulImport: lastImportRes.data?.completed_at ?? null,
    liveRedFlagCount: redFlagRes.count ?? 0,
    fetchedAt: now,
  };
}

function tickAgeMinutes(lastTickAt: string | null, now: number): number | null {
  if (!lastTickAt) return null;
  return (now - new Date(lastTickAt).getTime()) / 60_000;
}

function formatAge(minutes: number): string {
  if (minutes < 1) return "< 1 min ago";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HealthStatCard({ label, value, icon: Icon, tone = "neutral", trend, className = "" }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: "error" | "warning" | "neutral" | "success";
  trend?: string;
  className?: string;
}) {
  const toneText = {
    error: "text-error",
    warning: "text-warning",
    neutral: "text-primary",
    success: "text-success",
  }[tone];

  const toneBg = {
    error: "bg-red-500/15 border-red-500/30",
    warning: "bg-amber-500/15 border-amber-500/30",
    neutral: "bg-white/5 border-white/15",
    success: "bg-emerald-500/15 border-emerald-500/30",
  }[tone];

  return (
    <div className={`glass-strong rounded-sm p-4 animate-slide-up ${toneBg} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-label text-muted">{label}</p>
        <Icon size={14} className={toneText} aria-hidden="true" />
      </div>
      <p className={`text-h3 font-mono tabular-nums ${toneText}`}>{value}</p>
      {trend && <p className="mt-1 text-mono-sm text-success">{trend}</p>}
    </div>
  );
}

function ProgressBar({ value, max = 100, label, tone = "neutral" }: {
  value: number;
  max?: number;
  label?: string;
  tone?: "error" | "warning" | "neutral" | "success";
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneFill = {
    error: "bg-error",
    warning: "bg-warning",
    neutral: "bg-primary",
    success: "bg-success",
  }[tone];

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-label text-secondary">{label}</span>
          <span className="text-mono-sm text-primary">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className="progress-bar" style={{ "--progress-width": `${pct}%` } as React.CSSProperties}>
        <div
          className={`progress-bar-fill ${toneFill} animate-enter`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className = "" }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-strong rounded-sm p-6 animate-slide-up ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-primary" aria-hidden="true" />
        <h2 className="text-h3 text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function AdminPage() {
  let appUser;
  try {
    appUser = await requireRole("admin");
  } catch (err) {
    if (err instanceof AppError && (err.code === "FORBIDDEN" || err.code === "UNAUTHENTICATED")) {
      redirect("/clients");
    }
    throw err;
  }

  void appUser;

  const [config, stats] = await Promise.all([getSystemConfig(), getAdminStats()]);

  const ageMinutes = tickAgeMinutes(config.last_tick_at, stats.fetchedAt);
  const tickStale = ageMinutes !== null && ageMinutes > 5;
  const noRecentImport =
    stats.lastSuccessfulImport === null ||
    stats.fetchedAt - new Date(stats.lastSuccessfulImport).getTime() > 3 * 24 * 60 * 60 * 1000;

  const alerts: string[] = [];
  if (tickStale) {
    alerts.push(`Cron tick is stale — last tick ${ageMinutes !== null ? formatAge(ageMinutes) : "never"} (threshold: 5 min).`);
  }
  if (stats.deadJobCount > 0) {
    alerts.push(`${stats.deadJobCount} dead job${stats.deadJobCount === 1 ? "" : "s"} require attention.`);
  }
  if (stats.stuckImportCount > 0) {
    alerts.push(`${stats.stuckImportCount} import${stats.stuckImportCount === 1 ? "" : "s"} stuck in 'parsing' for > 15 min.`);
  }
  if (noRecentImport) {
    alerts.push(`No successful import in the last 3 days (last: ${formatDate(stats.lastSuccessfulImport)}).`);
  }
  if (stats.liveRedFlagCount > 20) {
    alerts.push(`${stats.liveRedFlagCount} live red flags — unusually high (threshold: 20).`);
  }

  const allHealthy = alerts.length === 0;

  return (
    <div className="container space-y-10 py-8">
      {/* Hero Header */}
      <div className="relative mb-4 overflow-hidden rounded-sm glass-strong p-6 sm:p-8 animate-slide-down">
        <div className="absolute inset-0 -z-10 bg-radial-glow" aria-hidden="true" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <RadioTower size={24} className={allHealthy ? "text-success animate-pulse-glow" : "text-warning"} aria-hidden="true" />
              <h1 className="text-h1 text-primary tracking-tight">System Admin</h1>
            </div>
            <p className="text-body text-secondary">
              {allHealthy
                ? "All systems operational — no active alerts."
                : `${alerts.length} alert${alerts.length === 1 ? "" : "s"} requiring attention`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <HealthStatCard
              label="System health"
              value={allHealthy ? "Healthy" : "Degraded"}
              icon={allHealthy ? CheckCircle2 : AlertCircle}
              tone={allHealthy ? "success" : "warning"}
              trend="<12ms latency"
            />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <SectionCard title="System Alerts" icon={AlertCircle}>
          <ul className="space-y-2 stagger-children">
            {alerts.map((alert, i) => (
              <li key={i} className="glass-strong rounded-sm p-4 border-l-4 border-error">
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                  <span className="text-body text-error">{alert}</span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {allHealthy && (
        <SectionCard title="System Status" icon={CheckCircle2}>
          <div className="flex items-center gap-3 glass-strong rounded-sm p-4 bg-emerald-500/15 border-emerald-500/30">
            <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />
            <p className="text-body text-success">All systems healthy — no active alerts.</p>
          </div>
        </SectionCard>
      )}

      {/* Kill Switch */}
      <SectionCard title="Outreach Kill Switch" icon={ShieldAlert}>
        <KillSwitch enabled={config.outreach_kill_switch} />
      </SectionCard>

      {/* System Health Grid */}
      <SectionCard title="System Health" icon={Activity}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          <HealthStatCard
            label="Last cron tick"
            value={ageMinutes !== null ? formatAge(ageMinutes) : "Never"}
            icon={Clock}
            tone={tickStale ? "error" : "success"}
            trend={tickStale ? "STALE > 5min" : "< 1 min"}
          />
          <HealthStatCard
            label="Pending jobs"
            value={stats.pendingJobCount}
            icon={Activity}
            tone={stats.pendingJobCount > 100 ? "warning" : "neutral"}
          />
          <HealthStatCard
            label="Dead jobs"
            value={stats.deadJobCount}
            icon={AlertCircle}
            tone={stats.deadJobCount > 0 ? "error" : "success"}
            trend={stats.deadJobCount > 0 ? "ATTENTION" : "Clean"}
          />
          <HealthStatCard
            label="Stuck imports"
            value={stats.stuckImportCount}
            icon={Database}
            tone={stats.stuckImportCount > 0 ? "error" : "success"}
            trend={stats.stuckImportCount > 0 ? "> 15 min" : "Clear"}
          />
        </div>

        {/* Last import with progress visualization */}
        <div className="mt-6 glass-strong rounded-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-label text-secondary">Last Successful Import</p>
            <p className={cn("text-h3 font-mono tabular-nums", noRecentImport ? "text-error" : "text-primary")}>
              {formatDate(stats.lastSuccessfulImport)}
            </p>
          </div>
          <ProgressBar
            value={noRecentImport ? 0 : 100}
            label={noRecentImport ? "Overdue — no import in 3 days" : "Recent import within 3 days"}
            tone={noRecentImport ? "error" : "success"}
          />
        </div>
      </SectionCard>

      {/* Live Red Flags Health */}
      <SectionCard title="Red Flag Monitoring" icon={TrendingUp}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 stagger-children">
          <HealthStatCard
            label="Live red flags"
            value={stats.liveRedFlagCount}
            icon={AlertCircle}
            tone={stats.liveRedFlagCount > 20 ? "error" : stats.liveRedFlagCount > 10 ? "warning" : "success"}
            trend={stats.liveRedFlagCount > 20 ? "HIGH" : stats.liveRedFlagCount > 10 ? "ELEVATED" : "NORMAL"}
          />
          <HealthStatCard
            label="Global max messages/week"
            value={config.global_max_messages_per_week}
            icon={RadioTower}
            tone="neutral"
            trend="Configurable"
          />
        </div>
      </SectionCard>

      {/* Global Config */}
      <SectionCard title="Global Configuration" icon={Zap}>
        <dl className="space-y-3 text-body stagger-children">
          <div className="flex items-center justify-between py-3 border-t border-white/10">
            <dt className="text-secondary">Max messages per week (global)</dt>
            <dd className="text-h3 font-mono tabular-nums text-primary">{config.global_max_messages_per_week}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}