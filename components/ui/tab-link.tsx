import Link from "next/link";
import { cn } from "@/lib/cn";

interface TabLinkProps {
  href: string;
  active: boolean;
  children: React.ReactNode;
}

export function TabLink({ href, active, children }: TabLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "px-4 py-2 text-label font-semibold border-b-2 -mb-px transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white",
        active
          ? "border-primary text-primary"
          : "border-transparent text-secondary hover:text-primary dark:hover:text-primary",
      )}
    >
      {children}
    </Link>
  );
}
