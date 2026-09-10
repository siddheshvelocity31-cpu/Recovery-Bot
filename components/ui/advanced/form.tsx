/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as Slot from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

const Label = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root
    className={cn(
      "text-label font-medium text-secondary peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  />
);

interface InputProps extends React.ComponentPropsWithoutRef<'input'> {
  error?: boolean;
}

const Input = ({ type, error, ...props }: InputProps) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-body placeholder:text-muted focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white",
        error && "border-red-500 focus:border-red-500 focus:ring-red-500",
        props.className
      ) as string}
      {...props}
    />
  );
};

interface TextareaProps extends React.ComponentPropsWithoutRef<'textarea'> {
  error?: boolean;
}

const Textarea = ({ error, ...props }: TextareaProps) => (
  <textarea
    className={cn(
      "flex min-h-[80px] w-full rounded-sm border border-neutral-300 bg-white px-3 py-2 text-body placeholder:text-muted focus:border-neutral-950 focus:ring-1 focus:ring-neutral-950 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:border-white dark:focus:ring-white",
      error && "border-red-500 focus:border-red-500 focus:ring-red-500",
      props.className
    ) as string}
    {...props}
  />
);

interface SwitchProps {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children?: React.ReactNode;
}

const Switch = ({ className, checked, onCheckedChange, children, ...props }: SwitchProps) => (
  <label
    className={cn(
      "inline-flex items-center gap-2 cursor-pointer select-none",
      className
    )}
    {...props}
  >
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "peer h-5 w-9 shrink-0 rounded-full border border-neutral-300 bg-white appearance-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:peer-focus-visible:ring-white",
        "peer-checked:bg-primary peer-checked:border-primary"
      )}
    />
    <span className="text-body text-secondary peer-disabled:opacity-50">
      {children}
    </span>
  </label>
);

interface CheckboxProps {
  className?: string;
  label?: string;
  children?: React.ReactNode;
}

const Checkbox = ({ className, label, children, ...props }: CheckboxProps) => (
  <label className={cn("inline-flex items-center gap-2 cursor-pointer select-none", className)}>
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border border-neutral-300 bg-white text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:focus-visible:ring-white"
      ) as string}
      {...props}
    />
    {label && <span className="text-body text-secondary">{label}</span>}
    {children}
  </label>
);

interface RadioGroupProps extends React.ComponentPropsWithoutRef<'div'> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroup = ({ className, value, onValueChange, children, ...props }: RadioGroupProps) => (
  <div className={cn("grid gap-2", className)} {...props}>
    {React.Children.map(children, (child) =>
      React.isValidElement(child) &&
        React.cloneElement(child, { value, onValueChange } as RadioGroupItemProps)
    )}
  </div>
);

interface RadioGroupItemProps {
  className?: string;
  value: string;
  children?: React.ReactNode;
}

const RadioGroupItem = ({ className, value, children, ...props }: RadioGroupItemProps) => (
  <label className={cn("inline-flex items-center gap-2 cursor-pointer select-none", className)}>
    <input
      type="radio"
      value={value}
      className={cn(
        "h-4 w-4 shrink-0 rounded-full border border-neutral-300 bg-white text-primary appearance-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-neutral-800 dark:focus-visible:ring-white"
      ) as string}
      {...props}
    />
    {children}
  </label>
);

interface SliderProps {
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  onValueChange?: (value: number[]) => void;
}

const Slider = ({ className, min = 0, max = 100, step = 1, value, onValueChange, ...props }: SliderProps) => {
  return (
    <div
      className={cn(
        "relative flex w-full touch-none select-none",
        className
      )}
      {...props}
    >
      <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className="absolute h-full bg-primary"
          style={{ width: `${((value?.[0] || 0) - min) / (max - min) * 100}%` }}
        />
      </div>
    </div>
  );
};

export {
  Label,
  Input,
  Textarea,
  Switch,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Slider,
};
