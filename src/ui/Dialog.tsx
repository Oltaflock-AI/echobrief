import * as React from "react";
import { X } from "lucide-react";
import {
  Dialog as ShadDialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The Console dialog — DESIGN_SPEC §8.
 *
 * One shell for every V2 dialog: 18px radius, a header pairing a 44px
 * accent-soft icon circle with the title and its one-line purpose, and a
 * footer divided from the body with a muted note on the left and the actions
 * on the right.
 *
 * `mobileSheet` swaps the centred dialog for a bottom sheet with a grab handle
 * below `md`. It is a prop rather than the default because a confirm is a
 * worse sheet than it is a dialog — a sheet invites a swipe, and a swipe is
 * not a considered answer.
 *
 * Both branches render Radix's own Title and Description, so the accessible
 * name is not lost to the visual restyle.
 */
export function Dialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  width = 520,
  mobileSheet,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Desktop max width in px. */
  width?: number;
  mobileSheet?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const isSheet = useIsMobileSheet(mobileSheet);

  const head = (
    <div className="flex items-start gap-3">
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-eb-accent-soft text-eb-accent">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        {isSheet ? (
          <SheetTitle asChild>
            <h2 className={titleClass}>{title}</h2>
          </SheetTitle>
        ) : (
          <DialogTitle asChild>
            <h2 className={titleClass}>{title}</h2>
          </DialogTitle>
        )}
        {description ? (
          isSheet ? (
            <SheetDescription asChild>
              <p className={descClass}>{description}</p>
            </SheetDescription>
          ) : (
            <DialogDescription asChild>
              <p className={descClass}>{description}</p>
            </DialogDescription>
          )
        ) : isSheet ? (
          <SheetDescription className="sr-only">{title}</SheetDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
      </div>
    </div>
  );

  const body = (
    <>
      {head}
      <div className={cn("mt-5", className)}>{children}</div>
      {footer && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-eb-divider pt-4">
          {footer}
        </div>
      )}
    </>
  );

  if (isSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-[18px] border-eb-border bg-eb-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 [&>button:last-child]:right-5 [&>button:last-child]:top-6 [&>button:last-child]:flex [&>button:last-child]:h-8 [&>button:last-child]:w-8 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-pill [&>button:last-child]:bg-eb-chip [&>button:last-child]:text-eb-secondary [&>button:last-child]:opacity-100"
        >
          <span aria-hidden className="mx-auto mb-4 block h-1 w-9 rounded-pill bg-eb-toggle-track" />
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <ShadDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ maxWidth: width }}
        className="rounded-[18px] border-eb-border bg-eb-card p-6 shadow-eb-card [&>button:last-child]:hidden"
      >
        {body}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-pill bg-eb-chip text-eb-secondary transition-colors hover:bg-eb-row-hover"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </DialogContent>
    </ShadDialog>
  );
}

const titleClass = "m-0 font-outfit text-[19px] font-semibold leading-[1.2] tracking-[-.02em] text-eb-text";
const descClass = "mt-1 font-dmsans text-[13px] leading-[1.5] text-eb-secondary";

/** The footer's left-hand note — hours used, "Takes about a minute", and so on. */
export function DialogNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-dmsans text-[12.5px] text-eb-secondary", className)}>{children}</span>;
}

function useIsMobileSheet(enabled?: boolean) {
  const [narrow, setNarrow] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return Boolean(enabled) && narrow;
}
