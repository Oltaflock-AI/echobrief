import * as React from "react";
import { cn } from "@/lib/utils";

/** Nav group each page belongs to — drives the PageHeader eyebrow. */
const eyebrowFor: Record<string, string> = {
  Meetings: "Capture",
  Calendar: "Capture",
  "Action items": "Capture",
  Contacts: "Understand",
  Coaching: "Understand",
  Ask: "Understand",
  Workspace: "Manage",
  Settings: "Manage",
};

/** Every page starts with this, so the H1 lands at the same position everywhere. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Overrides the nav-group lookup (meeting detail passes nothing). */
  eyebrow?: string;
  className?: string;
}) {
  const label = eyebrow ?? eyebrowFor[title];
  return (
    /* Stacked on a phone. Side by side, the title column and the actions
       fought over 390px: the subtitle wrapped into a four-line ribbon and the
       last action (Sync now on the calendar) was pushed off the right edge. */
    <div
      className={cn(
        "mb-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        {label && (
          <div className="mb-1.5 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-accent">
            {label}
          </div>
        )}
        <h1 className="m-0 font-outfit text-[26px] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1 font-dmsans text-[13.5px] text-eb-secondary">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-none">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  icon,
  accent,
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  icon?: React.ReactNode;
  /** The one highlighted tile in a stat row. */
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-eb-border bg-eb-card p-4 shadow-eb-card", className)}>
      <div className="flex items-center justify-between font-dmsans text-[12.5px] text-eb-secondary">
        {label}
        {icon && (
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-pill",
              accent ? "bg-eb-accent-soft text-eb-accent" : "bg-eb-bg text-eb-secondary",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1.5 font-outfit text-[26px] font-semibold leading-[1.1] tracking-[-.02em]",
          accent && "text-eb-accent",
        )}
      >
        {value}
      </div>
      {delta && <div className="mt-1 font-dmsans text-xs text-eb-secondary">{delta}</div>}
    </div>
  );
}

/** Uppercase section label used inside cards (DECISIONS, KEY NUMBERS…). */
export const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={cn(
      "font-dmsans text-[11.5px] font-medium uppercase tracking-[.06em] text-eb-secondary",
      className,
    )}
  >
    {children}
  </div>
);

/**
 * Two-column page body. `rail` is the right column.
 * Meetings home, Meeting detail, Coaching and Workspace use the default 320px rail;
 * Contacts flips to a 340px list on the left.
 */
export function TwoColumn({
  children,
  rail,
  flip,
  className,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
  /** Contacts: 340px column first, content second. */
  flip?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-6",
        flip ? "grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]" : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]",
        className,
      )}
    >
      {flip ? (
        <>
          {rail}
          {children}
        </>
      ) : (
        <>
          {children}
          {rail}
        </>
      )}
    </div>
  );
}

/** Settings: 200px chip rail + 760px content. */
export function SettingsLayout({
  rail,
  children,
  className,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-8 md:grid-cols-[200px_minmax(0,1fr)]", className)}>
      {rail}
      <div className="flex max-w-[760px] flex-col gap-5">{children}</div>
    </div>
  );
}
