import * as React from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const AV = [
  "bg-[color:var(--eb-av-0-bg)] text-[color:var(--eb-av-0-fg)]",
  "bg-[color:var(--eb-av-1-bg)] text-[color:var(--eb-av-1-fg)]",
  "bg-[color:var(--eb-av-2-bg)] text-[color:var(--eb-av-2-fg)]",
  "bg-[color:var(--eb-av-3-bg)] text-[color:var(--eb-av-3-fg)]",
  "bg-[color:var(--eb-av-4-bg)] text-[color:var(--eb-av-4-fg)]",
  "bg-[color:var(--eb-av-5-bg)] text-[color:var(--eb-av-5-fg)]",
];

/** Initial avatar. Colour is stable per initial. `round` for people lists, square (9px) for rows. */
export function Avatar({
  name,
  size = 34,
  round,
  className,
}: {
  name: string;
  size?: number;
  round?: boolean;
  className?: string;
}) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  const i = initial.charCodeAt(0) % 6;
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn(
        "inline-flex flex-none items-center justify-center font-outfit font-semibold",
        "shadow-[inset_0_0_0_1px_rgba(28,25,23,.05)]",
        round ? "rounded-full" : "rounded-tile",
        AV[i],
        className,
      )}
    >
      {initial}
    </span>
  );
}

/**
 * Brand mark on a white bordered tile. Marks live in public/brands/.
 * meet + zoom come from simple-icons — not yet wired, see Phase 2.
 * There is no Gmail or WhatsApp mark: email delivery is Resend (use <EmailTile/>).
 */
export type BrandMark = "gcal" | "outlook" | "slack" | "clickup" | "zoho";

export function BrandTile({
  brand,
  size = 36,
  className,
}: {
  brand: BrandMark;
  size?: number;
  className?: string;
}) {
  const img = Math.round(size * 0.54);
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-tile border border-eb-border bg-white shadow-eb-card",
        className,
      )}
    >
      <img
        src={`/brands/${brand}.png`}
        alt={brand}
        width={img}
        height={img}
        className="block object-contain"
      />
    </span>
  );
}

/** Email delivery (Resend) is not a brand — a mail icon on an accent-soft tile. */
export function EmailTile({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-tile bg-eb-accent-soft text-eb-accent",
        className,
      )}
    >
      <Mail size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  );
}
