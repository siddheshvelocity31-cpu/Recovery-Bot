"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/advanced/dialog";

interface AcknowledgeDialogProps {
  flagId: string;
  onClose: () => void;
  onSuccess?: () => void;
  open: boolean;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function AcknowledgeDialog({ flagId, onClose, onSuccess, open }: AcknowledgeDialogProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [ackUntilDate, setAckUntilDate] = useState(addDays(1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/flags/${flagId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          ack_until: new Date(ackUntilDate + "T23:59:59.000Z").toISOString(),
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const msg = typeof json["message"] === "string" ? json["message"] : "Failed to snooze flag.";
        setError(msg);
        setSubmitting(false);
        return;
      }

      onSuccess?.();
      router.refresh();
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-h3 text-primary">Snooze until...</DialogTitle>
          <DialogDescription>
            Acknowledge this flag and set a date for it to re-trigger.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          {/* Reason */}
          <div>
            <label htmlFor="ack-reason" className="mb-2 block text-label uppercase tracking-widest text-secondary">
              Reason <span className="text-error">*</span>
            </label>
            <input
              id="ack-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client confirmed payment on Friday"
              required
              disabled={submitting}
              className="w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-body placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none disabled:opacity-60 dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          {/* Preset buttons */}
          <div>
            <p className="mb-2 text-label uppercase tracking-widest text-secondary">Snooze duration</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "1 day", value: addDays(1) },
                { label: "1 week", value: addDays(7) },
                { label: "1 month", value: addMonths(1) },
              ].map(({ label, value }) => (
                <Button
                  key={label}
                  type="button"
                  variant={ackUntilDate === value ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setAckUntilDate(value)}
                  disabled={submitting}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom date */}
          <div>
            <label htmlFor="ack-until" className="mb-2 block text-label uppercase tracking-widest text-secondary">
              Or pick a date
            </label>
            <input
              id="ack-until"
              type="date"
              value={ackUntilDate}
              min={addDays(1)}
              onChange={(e) => setAckUntilDate(e.target.value)}
              disabled={submitting}
              className="w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-body placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none disabled:opacity-60 dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-sm bg-red-50 p-3 text-body-sm text-error dark:bg-red-900/20">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting || !reason.trim()}>
              {submitting ? "Snoozing…" : "Snooze flag"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
