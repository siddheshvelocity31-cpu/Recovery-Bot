"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RadioTower, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface KillSwitchProps {
  enabled: boolean;
  onToggle?: () => void;
}

export function KillSwitch({ enabled, onToggle }: KillSwitchProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const outreachLive = !enabled;

  function handleToggleClick() {
    setConfirming(true);
    setReason("");
    setError(null);
  }

  function handleCancel() {
    setConfirming(false);
    setReason("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError("Reason must be at least 3 characters.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/kill-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !enabled, reason: reason.trim() }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
          setError(body?.error?.message ?? "Request failed. Please try again.");
          return;
        }

        setConfirming(false);
        setReason("");
        onToggle?.();
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Status pill */}
      <div className="flex items-center gap-3">
        <span className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-label font-medium",
          outreachLive
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
        )}>
          {outreachLive ? (
            <RadioTower size={12} aria-hidden="true" />
          ) : (
            <ShieldAlert size={12} aria-hidden="true" />
          )}
          {outreachLive ? "Outreach LIVE" : "Outreach STOPPED"}
        </span>
      </div>

      {/* Toggle button */}
      {!confirming && (
        <Button variant={outreachLive ? "secondary" : "primary"} size="sm" onClick={handleToggleClick} disabled={pending}>
          {outreachLive ? "Enable kill switch" : "Disable kill switch"}
        </Button>
      )}

      {/* Inline confirmation form */}
      {confirming && (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="rounded-sm border border-default bg-neutral-50 p-4 dark:bg-neutral-900 dark:border-white/15 transition-all duration-200 space-y-4">
          {outreachLive && (
            <p className="flex items-start gap-2 rounded-sm border border-error/30 bg-red-50 p-3 text-body text-error dark:bg-red-900/20 dark:border-error/30">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Warning: This will stop ALL outreach immediately.</span>
            </p>
          )}

          <p className="text-body text-secondary">
            {outreachLive
              ? "Confirm enabling the kill switch (stop all outreach):"
              : "Confirm disabling the kill switch (resume outreach):"}
          </p>

          <div className="space-y-1">
            <label htmlFor="kill-switch-reason" className="block text-label text-secondary">
              Reason <span className="text-error">*</span>
            </label>
            <input
              id="kill-switch-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Minimum 3 characters"
              aria-invalid={error !== null}
              aria-describedby={error ? "kill-switch-error" : undefined}
              className="w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-body placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white"
              disabled={pending}
              autoFocus
            />
          </div>

          {error && <p id="kill-switch-error" role="alert" className="text-body text-error">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={pending || reason.trim().length < 3}>
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}