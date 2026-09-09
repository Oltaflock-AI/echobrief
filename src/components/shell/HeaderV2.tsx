import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Menu, Mic, Search, Upload } from "lucide-react";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { RecordDialogV2 } from "@/components/dashboard/RecordDialogV2";
import { UploadButton } from "@/components/dashboard/UploadButton";
import { Button, SplitButton } from "@/ui";

/**
 * Routes whose primary action is Record. Settings has no primary action, and
 * Action items gets "Add item" when that page moves to V2 — a button that opens
 * nothing is worse than no button, so it is not drawn yet.
 *
 * DESIGN_SPEC §1 also puts a notifications bell here. There is no notifications
 * surface in the product, so that is deliberately absent too.
 */
const RECORD_ROUTES = ["/dashboard", "/meeting", "/calendar", "/contacts", "/coaching", "/chat", "/workspace"];

type PrefillMeeting = {
  title: string;
  calendarEventId?: string;
  meetingLink?: string;
  attendees?: Array<{ email: string; displayName?: string | null; responseStatus?: string | null; organizer?: boolean }>;
};

export function HeaderV2({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  // "Record this meeting" from a pre-meeting notification navigates to
  // /dashboard carrying the calendar event in router state. V1 read that in the
  // page, because the page owned the Record button; the shell owns it now, so
  // the prefill has to be read here or the flow silently starts a blank
  // recording.
  const prefill = (location.state as { prefillMeeting?: PrefillMeeting } | null)?.prefillMeeting;

  // V1's RecordingButton opened itself when a prefill arrived. The dialog is
  // separate now, so without this the notification's "Record this meeting"
  // would land on the dashboard with nothing open.
  useEffect(() => {
    if (prefill?.meetingLink || prefill?.title) setRecordOpen(true);
  }, [prefill?.meetingLink, prefill?.title]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const showRecord = RECORD_ROUTES.some((r) => location.pathname.startsWith(r));

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-eb-border bg-[color-mix(in_srgb,var(--eb-bg)_90%,transparent)] px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="-ml-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-pill text-eb-secondary hover:bg-eb-row-hover lg:hidden"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 w-full max-w-[360px] items-center gap-2.5 rounded-pill border border-eb-border bg-eb-card px-3.5 text-left shadow-eb-btn hover:bg-eb-row-hover"
          >
            <Search size={15} strokeWidth={1.75} className="flex-none text-eb-muted" />
            <span className="flex-1 truncate font-dmsans text-[13px] text-eb-muted">Search meetings…</span>
            <span className="hidden flex-none rounded-md bg-eb-chip px-1.5 py-0.5 font-mono text-[11px] text-eb-secondary sm:inline">
              ⌘K
            </span>
          </button>
        </div>

        {showRecord && (
          <div className="flex flex-none items-center gap-2">
            <UploadButton
              onUploaded={() => queryClient.invalidateQueries({ queryKey: ["meetings", user?.id] })}
              renderTrigger={(open, busy) => (
                <Button
                  onClick={open}
                  disabled={busy}
                  aria-label="Upload a recording"
                  title="Upload a recording"
                  icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} strokeWidth={1.75} />}
                />
              )}
            />
            <SplitButton
              icon={<Mic size={15} strokeWidth={2} />}
              onMain={() => setRecordOpen(true)}
              onMenu={() => setRecordOpen(true)}
            >
              Record
            </SplitButton>
          </div>
        )}
      </header>

      <RecordDialogV2
        open={recordOpen}
        onOpenChange={setRecordOpen}
        prefillTitle={prefill?.title}
        prefillLink={prefill?.meetingLink}
        prefillCalendarEventId={prefill?.calendarEventId}
      />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
