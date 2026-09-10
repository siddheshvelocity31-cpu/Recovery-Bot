"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, Loader2, X } from "lucide-react"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/cn";

const Command = DialogPrimitive.Root;
const CommandOverlay = DialogPrimitive.Overlay;
const CommandContent = DialogPrimitive.Content;
const CommandClose = DialogPrimitive.Close;

const CommandEmpty = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("py-6 text-center text-body-sm text-muted", className)} {...props} />
);
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("space-y-2", className)} {...props} />
);
CommandGroup.displayName = "CommandGroup";

const CommandSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
  <hr className={cn("-mx-4 my-2 h-px bg-neutral-200 dark:bg-white/10", className)} {...props} />
);
CommandSeparator.displayName = "CommandSeparator";

const CommandItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    shortcut?: string;
  }
>(({ className, shortcut, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "flex w-full items-center justify-between rounded-sm px-3 py-2 text-body text-secondary transition-colors hover:bg-neutral-100 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:opacity-50 dark:hover:bg-neutral-800",
      className
    )}
    {...props}
  >
    {children}
    {shortcut && <span className="ml-auto text-body-sm text-muted">{shortcut}</span>}
  </button>
));
CommandItem.displayName = "CommandItem";

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("ml-auto text-body-sm tracking-widest text-muted", className)} {...props} />
);
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandOverlay,
  CommandContent,
  CommandClose,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
  CommandItem,
  CommandShortcut,
};
