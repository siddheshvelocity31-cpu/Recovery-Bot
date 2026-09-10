import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { StatusDot } from "@/components/ui/status-dot";

interface ClientFlagBannerProps {
  clientId: string;
}

export async function ClientFlagBanner({ clientId }: ClientFlagBannerProps) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminAny = admin as any;

  const { data, error } = await adminAny
    .from("flag")
    .select("id, severity")
    .eq("client_id", clientId)
    .is("resolved_at", null) as {
      data: Array<{ id: string; severity: string }> | null;
      error: unknown;
    };

  if (error || !data || data.length === 0) return null;

  const red = data.filter((f) => f.severity === "red").length;
  const amber = data.filter((f) => f.severity === "amber").length;
  const grey = data.filter((f) => f.severity === "grey").length;

  const parts: string[] = [];
  if (red > 0) parts.push(`${red} red`);
  if (amber > 0) parts.push(`${amber} amber`);
  if (grey > 0) parts.push(`${grey} grey`);

  if (parts.length === 0) return null;

  return (
    <div className="mb-4 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-label uppercase tracking-widest text-warning">Active flags:</span>
        <span className="flex items-center gap-3 text-body-sm">
          {red > 0 && <StatusDot tone="error" label={`${red} red`} />}
          {amber > 0 && <StatusDot tone="warning" label={`${amber} amber`} />}
          {grey > 0 && <StatusDot tone="neutral" label={`${grey} grey`} />}
        </span>
      </div>
    </div>
  );
}