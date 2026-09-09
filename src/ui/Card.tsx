import * as React from "react";
import { cn } from "@/lib/utils";

/** One card level only. Inside a card use <Divider/>, never another Card. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** false for list cards that manage their own row padding */
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-eb-border bg-eb-card shadow-eb-card",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Settings-style section: header strip + body. */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card padded={false} className={cn("overflow-hidden", className)}>
      <div className="border-b border-eb-divider px-5 py-[18px]">
        <div className="font-outfit text-[15px] font-semibold leading-tight">{title}</div>
        {description && (
          <div className="mt-[3px] font-dmsans text-[13px] text-eb-secondary">{description}</div>
        )}
      </div>
      <div className="px-5 py-[18px]">{children}</div>
    </Card>
  );
}

/** List-card header strip: title + count on the left, actions on the right. */
export function CardHeader({
  title,
  count,
  right,
  className,
}: {
  title: string;
  count?: number;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    /* The right slot holds filter chips on the busiest cards, and beside the
       title at 390px they pushed the whole document to 449px wide — the page
       scrolled sideways. It gets its own line on a phone, scrolling within
       itself rather than dragging the page with it. */
    <div
      className={cn(
        "flex flex-col items-stretch gap-2 border-b border-eb-divider py-3 pl-[18px] pr-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        className,
      )}
    >
      <div className="font-outfit text-[15px] font-semibold leading-tight text-eb-text">
        {title}
        {count !== undefined && (
          <span className="ml-1.5 font-dmsans text-[12.5px] font-normal text-eb-secondary">{count}</span>
        )}
      </div>
      {right && <div className="scroll-x -mx-1 flex min-w-0 items-center px-1 sm:mx-0 sm:flex-none sm:px-0">{right}</div>}
    </div>
  );
}

export const Divider = ({ className }: { className?: string }) => (
  <div className={cn("h-px bg-eb-divider", className)} />
);

/** Rows inside a list card. */
export const Row = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-[18px] py-[13px]",
      onClick && "cursor-pointer",
      "hover:bg-eb-row-hover",
      className,
    )}
  >
    {children}
  </div>
);

/** Prep card, coaching tip, bot preview. Eyebrow in accent-sidebar, body in on-dark. */
export function DarkPanel({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card bg-eb-sidebar p-4 text-eb-on-dark", className)}>
      {eyebrow && (
        <div className="mb-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-accent-sidebar">
          {eyebrow}
        </div>
      )}
      {children}
    </div>
  );
}
