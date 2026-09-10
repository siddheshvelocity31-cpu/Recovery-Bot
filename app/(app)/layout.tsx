import type { ReactNode } from "react";
import Link from "next/link";
import { Radio, RadioTower, ShieldAlert, Zap } from "lucide-react"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getAdminClient } from "@/lib/supabase/admin";

async function getKillSwitchState(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (getAdminClient() as any)
      .from("system_config")
      .select("outreach_kill_switch")
      .single() as { data: { outreach_kill_switch: boolean } | null };
    return data?.outreach_kill_switch ?? false;
  } catch {
    return false;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const killSwitchEnabled = await getKillSwitchState();
  const outreachLive = !killSwitchEnabled;

  return (
    <div className="flex min-h-screen bg-surface relative overflow-hidden">
      {/* Animated background layer — vsartech.com style */}
      <div className="absolute inset-0 -z-10 bg-radial-glow bg-dot-grid" aria-hidden="true" />

      {/* Sidebar — glass with depth */}
      <nav className="w-56 shrink-0 border-r border-default relative z-10 flex flex-col gap-1 glass px-3 py-6">
        <div className="flex items-center gap-2 px-3 mb-6">
          <RadioTower size={20} className="text-primary" aria-hidden="true" />
          <p className="text-label text-primary tracking-widest">Recovery System</p>
        </div>

        <NavLink href="/">Alerts</NavLink>
        <NavLink href="/clients">Clients</NavLink>
        <NavLink href="/imports">Imports</NavLink>
        <NavLink href="/settings/categories">Settings</NavLink>
        <NavLink href="/admin">Admin</NavLink>

        {/* Outreach status — animated pulse when live */}
        <div className="mt-auto pt-6 animate-fade-in">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm font-medium glass hover:bg-white/10 transition-all duration-200"
            aria-label={outreachLive ? "Outreach is live" : "Outreach is stopped — kill switch enabled"}
          >
            {outreachLive ? (
              <>
                <RadioTower size={14} className="text-success animate-pulse-glow" aria-hidden="true" />
                <Zap size={14} className="text-success" aria-hidden="true" />
              </>
            ) : (
              <ShieldAlert size={14} className="text-error" aria-hidden="true" />
            )}
            <span className={outreachLive ? "text-success" : "text-error"}>
              Outreach {outreachLive ? "live" : "stopped"}
            </span>
          </Link>
        </div>
      </nav>

      {/* Main content with entrance animation */}
      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-surface relative z-10 animate-slide-up">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="relative group flex items-center gap-3 rounded-sm px-3 py-2.5 text-body-sm font-medium text-secondary
                 hover:text-primary hover:bg-white/5 transition-all duration-200
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2
                 focus-visible:ring-offset-surface"
    >
      {children}
    </Link>
  );
}