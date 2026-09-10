import { Link } from 'react-router-dom';
import { ArrowRight, Lock } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/ui';

/**
 * The frame around a shared meeting.
 *
 * This page is the most common way a stranger meets the product, so it carries
 * the brand and one way in — but the meeting is the content, not the pitch. The
 * header stays a single quiet line; the sell is one card at the very bottom,
 * after the reader has got what they came for.
 */

export function ShareHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-eb-border bg-eb-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo size="sm" linkTo="/" variant="console" />
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden font-dmsans text-[13px] font-medium text-eb-secondary no-underline hover:text-eb-text sm:inline"
          >
            What is EchoBrief?
          </Link>
          <Link to="/auth?signup=1" className="no-underline">
            <Button variant="primary" size="sm" iconRight={<ArrowRight size={14} strokeWidth={1.75} />}>
              Try free
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function ShareFooter() {
  return (
    <footer className="mt-12 rounded-card border border-eb-border bg-eb-card p-6 text-center shadow-eb-card sm:p-8">
      <p className="font-outfit text-[17px] font-semibold tracking-[-.01em] text-eb-text">
        This summary was written by EchoBrief
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] font-dmsans text-[13.5px] leading-[1.6] text-eb-prose">
        Meeting notes for teams who work in Hindi, English and everything in between — with a quote
        and a timestamp behind every claim.
      </p>
      <Link to="/auth?signup=1" className="mt-5 inline-block no-underline">
        <Button variant="primary" iconRight={<ArrowRight size={15} strokeWidth={1.75} />}>
          Record your next meeting
        </Button>
      </Link>
    </footer>
  );
}

/** The line that tells a reader what they are allowed to see, and why. */
export function PrivacyNote({ hasTranscript }: { hasTranscript: boolean }) {
  return (
    <p className="mt-6 flex items-start gap-2 font-dmsans text-[12.5px] leading-[1.5] text-eb-secondary">
      <Lock size={12} strokeWidth={1.75} className="mt-[3px] flex-none" />
      <span>
        Shared by the meeting owner.{' '}
        {hasTranscript
          ? 'Anything said before the meeting started or after it ended is left out.'
          : 'This link carries the summary only.'}
      </span>
    </p>
  );
}

/** Loading skeleton — the page's own shape, not a spinner on an empty screen. */
export function ShareSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-32 rounded-pill bg-eb-chip" />
      <div className="mt-4 h-9 w-3/4 rounded-input bg-eb-chip" />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-28 rounded-pill bg-eb-chip" />
        <div className="h-6 w-20 rounded-pill bg-eb-chip" />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-64 rounded-card border border-eb-border bg-eb-card" />
        <div className="h-44 rounded-card border border-eb-border bg-eb-card" />
      </div>
    </div>
  );
}

export function ShareError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-[440px] rounded-card border border-eb-border bg-eb-card p-8 text-center shadow-eb-card">
      <h1 className="font-outfit text-[20px] font-semibold tracking-[-.01em] text-eb-text">
        This link is not available
      </h1>
      <p className="mt-2 font-dmsans text-[13.5px] leading-[1.6] text-eb-prose">{message}</p>
      <Link to="/" className="mt-6 inline-block no-underline">
        <Button variant="primary">See what EchoBrief does</Button>
      </Link>
    </div>
  );
}
