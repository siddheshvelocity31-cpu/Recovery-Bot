import { cn } from "@/lib/cn";

export function Th({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-label uppercase tracking-widest text-secondary bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-default",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-primary border-t border-default/50 dark:border-white/10",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}
