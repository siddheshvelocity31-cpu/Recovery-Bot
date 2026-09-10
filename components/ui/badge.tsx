import { cn } from "@/lib/cn";

type Variant = "default" | "success" | "warning" | "error" | "info" | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  error: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  info: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400",
  outline: "border border-neutral-200 bg-transparent text-neutral-700 dark:border-white/15 dark:text-neutral-300",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}