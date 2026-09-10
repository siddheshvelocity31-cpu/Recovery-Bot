import { AlertCircle, AlertTriangle, Circle, CheckCircle2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "error" | "warning" | "success" | "neutral" | "info";

const toneClasses: Record<Tone, string> = {
  error: "text-error bg-red-100 dark:bg-red-900/20",
  warning: "text-warning bg-amber-100 dark:bg-amber-900/20",
  success: "text-success bg-emerald-100 dark:bg-emerald-900/20",
  neutral: "text-neutral-600 bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300",
  info: "text-info bg-cyan-100 dark:bg-cyan-900/20",
};

const defaultIcons: Record<Tone, LucideIcon> = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  neutral: Circle,
  info: Circle,
};

interface StatusDotProps {
  tone: Tone;
  className?: string;
  label?: string;
  icon?: LucideIcon;
}

/**
 * Status indicator that pairs a colored bar with an icon + label.
 * Never communicates by color alone — the icon and text carry the meaning.
 */
export function StatusDot({ tone, className, label, icon: Icon }: StatusDotProps) {
  const ResolvedIcon = Icon ?? defaultIcons[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-label font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      <ResolvedIcon size={12} aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
