import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "h-[38px] w-full rounded-input border border-eb-border bg-white px-3 " +
  "font-dmsans text-sm text-eb-text shadow-eb-input outline-none " +
  "placeholder:text-eb-secondary focus:border-eb-accent";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-dmsans text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="font-dmsans text-[12.5px] text-eb-secondary">{hint}</span>}
    </label>
  );
}

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn(control, className)} />
);

export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cn(control, "h-auto resize-y px-3 py-2.5 leading-relaxed", className)} />
);

/** Pill select. */
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...p}
    className={cn(
      "h-[34px] appearance-none rounded-pill border border-eb-border bg-white pl-[14px] pr-[34px]",
      "font-dmsans text-[13px] text-eb-text shadow-eb-btn outline-none",
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23A8A29E' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:14px] bg-[right_10px_center] bg-no-repeat",
      className,
    )}
  />
);

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-[38px] flex-none rounded-pill border-0 p-0",
        "shadow-[inset_0_1px_2px_rgba(28,25,23,.12)]",
        on ? "bg-eb-accent" : "bg-eb-toggle-track",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-[left]",
          "shadow-[0_1px_2px_rgba(28,25,23,.25)]",
          on ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md p-0 text-white",
        checked
          ? "border-0 bg-eb-accent shadow-[inset_0_1px_0_rgba(255,255,255,.2)]"
          : "border-[1.5px] border-eb-control-edge bg-white shadow-eb-input",
      )}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}
