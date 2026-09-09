import * as React from "react";
import { cn } from "@/lib/utils";

type ChipProps = {
  /** Tab / segmented-control selection — dark fill. */
  active?: boolean;
  /** Filter selection — accent-soft fill. */
  selected?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  size?: "md" | "sm";
  icon?: React.ReactNode;
  className?: string;
};

export function Chip({ active, selected, children, onClick, size = "md", icon, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!(active || selected)}
      className={cn(
        "tap-44 inline-flex items-center gap-1.5 rounded-pill border font-dmsans font-medium whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-[13px] text-[13px]",
        active
          ? "border-eb-sidebar bg-eb-sidebar text-white"
          : selected
            ? "border-eb-accent bg-eb-accent-soft text-eb-accent-text"
            : "border-eb-border bg-white text-eb-secondary shadow-eb-card hover:bg-eb-row-hover",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Tabs and segmented controls. This replaces every underline tab in the product —
 * Meeting detail tabs, the Settings rail, filter rows. Active chip is dark-filled.
 * Pass objects when the label differs from the value (e.g. a count suffix).
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: {
  options: readonly (T | { value: T; label: React.ReactNode; icon?: React.ReactNode })[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "sm";
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o as React.ReactNode, icon: undefined } : o;
        const isActive = opt.value === value;
        return (
          <Chip
            key={opt.value}
            active={isActive}
            size={size}
            icon={opt.icon}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Chip>
        );
      })}
    </div>
  );
}
