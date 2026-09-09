import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import {
  Bot,
  Braces,
  CalendarClock,
  Check,
  Copy,
  ChevronDown,
  HelpCircle,
  Languages,
  LifeBuoy,
  ListChecks,
  Mail,
  MessagesSquare,
  PlayCircle,
  Plug,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Terminal,
  Webhook,
} from 'lucide-react';

type Section = { id: string; name: string };
type Group = { title: string; icon: JSX.Element; items: Section[] };

const GROUPS: Group[] = [
  {
    title: 'Getting started',
    icon: <Rocket size={18} />,
    items: [
      { id: 'what-is', name: 'What is EchoBrief?' },
      { id: 'how-it-works', name: 'How it works' },
      { id: 'setup', name: 'Account setup' },
      { id: 'first-meeting', name: 'Your first meeting' },
    ],
  },
  {
    title: 'Recording',
    icon: <PlayCircle size={18} />,
    items: [
      { id: 'recording', name: 'Recording a meeting' },
      { id: 'auto-join', name: 'Calendar auto-join' },
      { id: 'bot-customization', name: 'Customising the bot' },
      { id: 'statuses', name: 'Meeting statuses' },
    ],
  },
  {
    title: 'Your meeting intelligence',
    icon: <Sparkles size={18} />,
    items: [
      { id: 'summaries', name: 'Summaries & insights' },
      { id: 'action-items', name: 'Action items' },
      { id: 'metrics', name: 'Conversation metrics' },
      { id: 'transcripts', name: 'Transcripts & speakers' },
      { id: 'contacts', name: 'Contacts & account briefs' },
      { id: 'coaching', name: 'Coaching scorecard' },
      { id: 'playback', name: 'Watching the recording' },
      { id: 'ask', name: 'Ask: chat with your meetings' },
      { id: 'connect', name: 'Connect Claude & other AI tools' },
      { id: 'languages', name: 'Languages' },
    ],
  },
  {
    title: 'Delivery',
    icon: <Mail size={18} />,
    items: [
      { id: 'delivery', name: 'Email summaries' },
      { id: 'slack', name: 'Slack' },
      { id: 'zoho', name: 'Zoho CRM' },
      { id: 'sharing', name: 'Sharing a meeting' },
      { id: 'digests', name: 'Scheduled digests' },
      { id: 'history', name: 'Search & history' },
    ],
  },
  {
    title: 'Developers',
    icon: <Terminal size={18} />,
    items: [
      { id: 'dev-overview', name: 'Developer overview' },
      { id: 'dev-tokens', name: 'Access tokens' },
      { id: 'dev-mcp', name: 'MCP endpoint' },
      { id: 'dev-tools', name: 'MCP tool reference' },
      { id: 'automation', name: 'Automation webhook' },
      { id: 'dev-limits', name: 'Limits & scoping' },
    ],
  },
  {
    title: 'Support',
    icon: <LifeBuoy size={18} />,
    items: [
      { id: 'troubleshooting', name: 'Troubleshooting' },
      { id: 'privacy', name: 'Privacy & data' },
      { id: 'delete-account', name: 'Delete your account' },
      { id: 'dpdp', name: 'DPDP compliance' },
      { id: 'faq', name: 'FAQ' },
      { id: 'support', name: 'Contact support' },
    ],
  },
];

const ALL_SECTIONS = GROUPS.flatMap((g) => g.items);

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'warn'
      ? 'border-warning/30 bg-warning/5'
      : 'border-border bg-muted/40';
  return (
    <div className={`my-6 rounded-lg border p-4 ${styles}`}>
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <div className="text-sm leading-relaxed text-muted-foreground [&_a]:underline">{children}</div>
    </div>
  );
}

/**
 * A copyable code block. Docs that make you retype a bearer header get the
 * header retyped wrong, so every snippet here is one click to the clipboard.
 */
function Code({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is selectable either way */
    }
  };
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{label ?? 'shell'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="surface-hover inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-relaxed text-foreground">
        <code className="font-mono">{children.trim()}</code>
      </pre>
    </div>
  );
}

function ArgTable({
  rows,
  headers,
}: {
  headers: [string, string, string];
  rows: [React.ReactNode, React.ReactNode, React.ReactNode][];
}) {
  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0 align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[13px] text-foreground">
      {children}
    </code>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="my-5 space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--ember)' }}
          >
            {i + 1}
          </span>
          <span className="text-[15px] leading-relaxed text-muted-foreground">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Docs() {
  const [query, setQuery] = useState('');
  // The nav column only stacks above the article below `lg`; keep it open on
  // wider screens where it sits beside the content.
  const isNarrow = useIsMobile(1024);
  const [navCollapsed, setNavCollapsed] = useState(isNarrow);
  useEffect(() => { setNavCollapsed(isNarrow); }, [isNarrow]);
  const [active, setActive] = useState<string>(ALL_SECTIONS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.name.toLowerCase().includes(q) || g.title.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    ALL_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pb-20 pt-20 sm:pt-24">
        <div className="container mx-auto px-4 sm:px-6">
          <Link
            to="/"
            className="surface-hover -ml-2 mb-6 inline-flex min-h-[40px] items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to home
          </Link>

          <header className="mb-12 max-w-3xl">
            <p className="mb-2 text-sm font-medium" style={{ color: 'var(--ember)' }}>
              Documentation
            </p>
            <h1
              className="mb-4 text-4xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Everything you can do with EchoBrief
            </h1>
            <p className="text-lg leading-relaxed text-muted-foreground">
              EchoBrief sends a recording bot to your meetings, transcribes them into English,
              and turns each one into a summary, a decision log, and a set of action items you
              can actually chase. This guide covers setup, day-to-day use, and what to do when
              something looks wrong.
            </p>
          </header>

          <div className="grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)]">
            {/* Sidebar */}
            <aside className="lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto">
              {/* Below lg the nav is a single stacked column, so leaving it
                  expanded put ~30 links between the reader and the first word
                  of documentation. Collapsed by default on small screens. */}
              <details
                open={!navCollapsed}
                onToggle={(e) => setNavCollapsed(!(e.currentTarget as HTMLDetailsElement).open)}
                className="rounded-xl border border-border lg:rounded-none lg:border-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-foreground lg:hidden">
                  Browse topics
                  <ChevronDown size={16} className="transition-transform" />
                </summary>
                <div className="px-4 pb-4 lg:px-0 lg:pb-0">
              <div className="relative mb-5">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter topics"
                  aria-label="Filter documentation topics"
                  className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-3 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 md:py-2 md:text-sm"
                />
              </div>

              <nav className="space-y-6">
                {filtered.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 flex items-center gap-2">
                      <span style={{ color: 'var(--ember)' }}>{group.icon}</span>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        {group.title}
                      </h2>
                    </div>
                    <ul className="space-y-0.5 border-l border-border">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            aria-current={active === item.id ? 'true' : undefined}
                            className={`-ml-px block border-l py-2.5 pl-3 text-sm transition-colors md:py-1.5 ${
                              active === item.id
                                ? 'border-l-2 font-medium text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                            style={active === item.id ? { borderColor: 'var(--ember)' } : undefined}
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground">No topics match “{query}”.</p>
                )}
              </nav>
                </div>
              </details>
            </aside>

            {/* Content */}
            <article className="min-w-0 max-w-3xl space-y-14 text-[15px] leading-relaxed text-muted-foreground">
              {/* ---------------- Getting started ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="what-is">What is EchoBrief?</SectionHeading>
                <p>
                  EchoBrief is an AI meeting intelligence platform. A recording bot joins your
                  Google Meet, Zoom, or Microsoft Teams call, records the conversation, and
                  afterwards produces a written record you can search, share, and act on.
                </p>
                <p>You get, for every meeting:</p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>An executive summary and a longer detailed summary</li>
                  <li>Action items with an owner, a priority, and what success looks like</li>
                  <li>Explicit decisions and commitments</li>
                  <li>Risks, blockers, and open questions</li>
                  <li>A timestamped timeline of the conversation</li>
                  <li>Conversation metrics — talk time, who held the floor, questions, turn-taking</li>
                  <li>A full transcript with real participant names</li>
                </ul>
                <Callout title="Recording is bot-based">
                  EchoBrief does not record from your browser and never asks for microphone
                  access. A visible bot joins the call as a participant, which means everyone in
                  the meeting can see that it is being recorded.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="how-it-works">How it works</SectionHeading>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { n: '01', t: 'The bot joins', d: 'You paste a meeting link, or your calendar triggers it automatically. The bot asks to be admitted and starts recording.' },
                    { n: '02', t: 'Audio is transcribed', d: 'After the call ends, the recording is transcribed into English — whatever language was spoken.' },
                    { n: '03', t: 'Speakers are named', d: 'Segments are matched against who was actually talking, so the transcript reads with real names.' },
                    { n: '04', t: 'Insights are generated', d: 'A summary, decisions, risks and action items are extracted and saved to your dashboard.' },
                    { n: '05', t: 'It lands in your inbox', d: 'If email summaries are on, the report is delivered automatically.' },
                    { n: '06', t: 'You can ask questions', d: 'Ask searches across every meeting you have recorded and answers with citations.' },
                  ].map((s) => (
                    <div key={s.n} className="rounded-lg border border-border bg-card p-4">
                      <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--ember)' }}>
                        {s.n}
                      </p>
                      <p className="mb-1 text-[15px] font-semibold text-foreground">{s.t}</p>
                      <p className="text-sm">{s.d}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm">
                  Most meetings finish processing within a few minutes of the call ending. Longer
                  meetings take proportionally longer, because the audio is split into chunks and
                  transcribed in parallel.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="setup">Account setup</SectionHeading>
                <Steps
                  items={[
                    <>Sign in at <strong className="text-foreground">echobrief.in</strong> with your email and password — or with Google, when the <strong className="text-foreground">Continue with Google</strong> option is shown. Do not have an account yet? Create one from the homepage — Starter and Pro are self-serve, and you pick a plan in Settings → Billing.</>,
                    <>Complete onboarding: choose your preferred languages and, optionally, connect Google Calendar.</>,
                    <>Open <strong className="text-foreground">Settings</strong> to name your bot, pick its colour, and confirm email summaries are on.</>,
                    <>Record your first meeting.</>,
                  ]}
                />
                <p>
                  Passwords must be at least 10 characters with letters and numbers, and are checked
                  against known data-breach lists when you set one. The check is private: only a
                  5-character fragment of a hash is sent, so your password never leaves your browser.
                </p>
                <Callout title="Connecting Google Calendar is optional">
                  Without it you can still record any meeting by pasting its link. With it,
                  EchoBrief can see your upcoming meetings and — if you enable auto-join — send the
                  bot for you.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="first-meeting">Your first meeting</SectionHeading>
                <Steps
                  items={[
                    <>On the dashboard, click <strong className="text-foreground">Start New Recording</strong>.</>,
                    <>Enter a meeting title and paste the meeting URL (Google Meet, Zoom, or Teams).</>,
                    <>Start the recording. The bot will request to join the call.</>,
                    <><strong className="text-foreground">Admit the bot</strong> when it appears in the waiting room. If nobody admits it, the meeting is marked cancelled and nothing is recorded.</>,
                    <>Hold your meeting as normal. The dashboard shows live status.</>,
                    <>End the call. Processing begins automatically and the meeting moves to <strong className="text-foreground">Completed</strong>.</>,
                  ]}
                />
              </section>

              {/* ---------------- Recording ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="recording">Recording a meeting</SectionHeading>
                <p>There are two ways to get a bot into a meeting:</p>
                <div className="scroll-x my-4">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 font-semibold text-foreground">Method</th>
                        <th className="py-2 font-semibold text-foreground">When to use it</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="py-2.5 pr-4 align-top font-medium text-foreground">Paste a link</td>
                        <td className="py-2.5">Ad-hoc calls, meetings not on your calendar, or someone else's invite.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 align-top font-medium text-foreground">Calendar auto-join</td>
                        <td className="py-2.5">Recurring and scheduled meetings you always want recorded.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  Supported platforms: <strong className="text-foreground">Google Meet</strong>,{' '}
                  <strong className="text-foreground">Zoom</strong>, and{' '}
                  <strong className="text-foreground">Microsoft Teams</strong>.
                </p>
                <Callout tone="warn" title="Someone has to let the bot in">
                  The bot joins as a participant and usually lands in the waiting room. If it is
                  not admitted before the meeting starts, it gives up and the meeting is marked
                  cancelled — no audio is captured. Tell your host to expect it, or give the bot a
                  recognisable name in Settings.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="auto-join">Calendar auto-join</SectionHeading>
                <p>
                  With Google Calendar connected and auto-join enabled, EchoBrief checks your
                  calendar every few minutes and dispatches a bot to meetings that are about to
                  start — roughly five to seven minutes ahead of time.
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Only events with a recognisable meeting link are eligible.</li>
                  <li>Each calendar event gets at most one bot, even across multiple checks.</li>
                  <li>Turn it off any time in <strong className="text-foreground">Settings</strong>; existing recordings are unaffected.</li>
                </ul>
                <Callout tone="warn" title="Auto-join records everything it can">
                  If it is on your calendar and it has a link, the bot will try to join it —
                  including one-to-ones and interviews. Review what is on your calendar before
                  enabling it.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="bot-customization">Customising the bot</SectionHeading>
                <p>
                  Go to <strong className="text-foreground">Settings → Bot customisation</strong>:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    <strong className="text-foreground">Bot name</strong> — what participants see in
                    the participant list. A clear name like “Priya's Notetaker” gets admitted faster
                    than something generic.
                  </li>
                  <li>
                    <strong className="text-foreground">Icon colour</strong> — Orange, Blue, Green,
                    Purple, Pink, or Cyan.
                  </li>
                  <li>
                    <strong className="text-foreground">Auto-join</strong> — the calendar toggle
                    described above.
                  </li>
                </ul>
              </section>

              <section className="space-y-4">
                <SectionHeading id="statuses">Meeting statuses</SectionHeading>
                <p>Every meeting on your dashboard carries a status. What each one means:</p>
                <div className="scroll-x my-4">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 font-semibold text-foreground">Status</th>
                        <th className="py-2 font-semibold text-foreground">Meaning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['Scheduled', 'Picked up from your calendar. The bot has not been sent yet.'],
                        ['Joining', 'The bot is asking to be admitted to the call.'],
                        ['Recording', 'The bot is in the meeting and capturing audio.'],
                        ['Processing', 'The call ended. Audio is being transcribed and analysed.'],
                        ['Completed', 'Transcript, summary, and insights are ready.'],
                        ['Cancelled', 'The bot never got into the meeting — usually not admitted, or removed from the waiting room. Nothing was recorded and nothing went wrong on our side. Dropped from the dashboard automatically.'],
                        ['Failed', 'Something needs your attention — most often an invalid or expired meeting link. Dropped from the dashboard automatically; search for the title to open the meeting and see the reason.'],
                      ].map(([s, d]) => (
                        <tr key={s}>
                          <td className="whitespace-nowrap py-2.5 pr-4 align-top font-medium text-foreground">
                            {s}
                          </td>
                          <td className="py-2.5">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ---------------- Intelligence ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="summaries">Summaries & insights</SectionHeading>
                <p>
                  Open any completed meeting to see the full report. It is deliberately more than
                  a summary:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Executive summary</strong> — why the meeting happened, what changed, what happens next.</li>
                  <li><strong className="text-foreground">Notes by topic</strong> — the longer write-up, grouped the way Fireflies-style notes are, with speaker names.</li>
                  <li><strong className="text-foreground">Action items</strong> — verb-first commitments, with an owner and a due date only when those were spoken.</li>
                  <li><strong className="text-foreground">Decisions</strong> — only explicit agreement, not “we should” or “maybe”.</li>
                  <li><strong className="text-foreground">Open questions and risks</strong> — unresolved concerns, so silence is not mistaken for alignment.</li>
                  <li><strong className="text-foreground">Outline</strong> — chapter headings whose timestamps come from the transcript clock, not a guess.</li>
                  <li><strong className="text-foreground">Numbers &amp; asks</strong> — every hard number spoken (revenue, volumes, rates), what the other party explicitly asked for, and each objection with whether it was addressed — each with the verbatim quote and a timestamp that jumps into the recording.</li>
                  <li><strong className="text-foreground">Coaching</strong> — on external calls, a Coaching tab benchmarks your talk ratio, longest monologue, questions and hedge words against discovery-call guidelines, flags moments (an objection you talked past, a next step left vague) and charts the other side's engagement over the call.</li>
                </ul>
                <p>
                  Every timestamp on the page — in the outline, the transcript, action items and
                  coaching evidence — is a link into the recording at that moment.
                </p>
                <p>
                  Two buttons in the header act on the report: <strong className="text-foreground">Draft
                  follow-up</strong> writes the follow-up email from the extracted facts (their own words
                  for what they need, the commitments both ways, the agreed time — nothing invented) for
                  you to edit and send; <strong className="text-foreground">Regenerate</strong> rebuilds
                  the whole report from the stored transcript with the current pipeline, which is how
                  older meetings gain the Numbers &amp; asks and Coaching sections.
                </p>
                <Callout title="Grounded in the transcript, twice over">
                  The report is written in two passes: first the facts are extracted with the exact
                  words that support them, then the summary is written from those facts alone. A
                  third check flags any claim it cannot trace back — you will see a small note on
                  the summary when that happens.
                </Callout>
                <Callout title="Accuracy over completeness">
                  The analysis is instructed not to invent detail, not to assign an owner unless it
                  was stated or strongly implied, and to prefer an open question over a guess. A
                  shorter, correct report is the intended outcome.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="action-items">Action items</SectionHeading>
                <p>
                  Each action item carries a task description, an owner (where one was named), a
                  priority, a confidence level, and what success looks like. When a due date was
                  spoken as a day (“Tuesday”, “next week”), it is resolved against the meeting's own
                  date — so you see <em>Tue, Sep 1</em>, not a word that means nothing a week later.
                  Items with a resolved date get an <strong className="text-foreground">Add to
                  calendar</strong> button that creates the follow-up in your Google Calendar at the
                  original meeting's time; attendees are invited only if you tick the box. If you
                  connected Google Calendar before September 2026 the connection is read-only —
                  reconnect it once under Settings → Integrations to allow event creation.
                </p>
                <p>
                  The <strong className="text-foreground">Action Items</strong> page collects them
                  across every meeting, so you can work through commitments in one place and tick
                  them off as they are done. Completion state is yours alone.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="metrics">Conversation metrics</SectionHeading>
                <p>
                  Each meeting includes measured conversation statistics. These are calculated
                  arithmetically from the timing of every speech segment — they are measurements,
                  not estimates from a language model.
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Talk time per speaker</strong> — seconds and share of total speech, plus turns, questions asked, words, and speaking pace.</li>
                  <li><strong className="text-foreground">Airtime</strong> — who held the floor, as a share of speech. Shown when two or more people spoke.</li>
                  <li><strong className="text-foreground">Questions and back-and-forth</strong> — how many questions were asked, and how often the floor changed per minute.</li>
                  <li><strong className="text-foreground">Silence</strong> — how much of the meeting had nobody speaking, including dead air before the first word and after the last.</li>
                  <li><strong className="text-foreground">Longest monologue</strong> — the longest genuinely uninterrupted stretch. A pause of more than fifteen seconds ends it, so this is not simply “total time this person spoke”.</li>
                  <li><strong className="text-foreground">Participation balance</strong> — how evenly speaking time was shared, where 1.00 is perfectly even.</li>
                </ul>
                <Callout title="Solo meetings hide the balance card">
                  Balance describes a relationship between speakers. With only one speaker there is
                  nothing to compare, so the card is hidden rather than showing a meaningless
                  perfect score.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="transcripts">Transcripts &amp; speakers</SectionHeading>
                <p>
                  Every completed meeting stores a full transcript with timestamps and speaker
                  labels. Where EchoBrief can match a speech segment to a participant, the
                  transcript uses their real name.
                </p>
                <p>
                  Occasionally you will see generic labels like{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                    SPEAKER_00
                  </code>
                  . That means participant information was not available for that recording — the
                  transcript is still accurate, only the names are missing.
                </p>
                <Callout title="Your pre-call and post-call chatter stays private">
                  The bot joins before your guests and keeps recording after they leave. EchoBrief
                  works out when the first external participant arrived and when the last one left,
                  and treats speech outside that window as internal. Internal segments are excluded
                  from the summary, the email and anything an AI tool reads through the connector;
                  you can reveal them on the transcript with <em>Show internal audio</em>, where
                  they are marked <em>Internal — not shared</em>. Meetings with only your own team
                  have no trimming.
                </Callout>
                <p>
                  Company, product and client names the transcription keeps misspelling can be
                  fixed for good under <strong className="text-foreground">Settings → Custom
                  vocabulary</strong>: add the correct spelling once and it is enforced in every
                  future transcript and summary. If a speaker was mislabelled, click their name in
                  the transcript to rename them — the change applies to the metrics, action items,
                  facts and coaching too, and survives a regeneration.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="contacts">Contacts &amp; account briefs</SectionHeading>
                <p>
                  Everyone from outside your company who attends a recorded meeting becomes a contact
                  automatically — name, email, company from their domain — with every meeting, number
                  and commitment attached to their timeline. Before the next call, open the contact and
                  press <strong className="text-foreground">Generate brief</strong>: a two-minute read of
                  where things stand, open commitments on both sides, objections never resolved, and
                  what to bring.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="coaching">Coaching scorecard</SectionHeading>
                <p>
                  The Coaching page rolls every external call up by week: talk ratio, hedge-word
                  density, how often a next step was secured and how often objections were handled,
                  with the individual calls underneath. Reports exist for calls processed after
                  31 August 2026; press Regenerate on an older meeting to add it.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="playback">Watching the recording</SectionHeading>
                <p>
                  Open a meeting and choose the{' '}
                  <strong className="text-foreground">Recording</strong> tab to play back what the
                  notetaker captured — video where it is available, otherwise the meeting audio.
                </p>
                <p>
                  Recordings are available for{' '}
                  <strong className="text-foreground">7 days</strong> after the meeting, then they
                  expire. The transcript, summary and action items are the permanent record; the
                  recording is not. Meetings recorded before video playback was introduced have
                  audio only, and that audio is cleared sooner.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="ask">Ask: chat with your meetings</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <MessagesSquare size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Dashboard → Ask</span>
                </div>
                <p>
                  Ask answers questions across your entire meeting history in plain language.
                  Useful for the things a search box cannot answer:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>“What did we decide about pricing?”</li>
                  <li>“Who owns the migration work?”</li>
                  <li>“Has the client raised the deadline concern before?”</li>
                </ul>
                <p>
                  Every answer comes with <strong className="text-foreground">citations</strong> —
                  the specific meetings it drew from — so you can jump straight to the source. If
                  the answer is not in your transcripts, it will say so rather than guess.
                </p>
                <Callout title="Ask only sees your own meetings">
                  Retrieval is scoped to your account at the database level. Meetings that captured
                  no usable speech are excluded, because quoting an empty recording back at you is
                  worse than saying nothing.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="connect">Connect Claude &amp; other AI tools</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Plug size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Settings → Developer</span>
                </div>
                <p>
                  Your meetings do not have to stay inside EchoBrief. Claude on the web and in the
                  mobile app connects through <strong className="text-foreground">Add custom connector</strong>{' '}
                  with the address below and a one-click approval. Claude Code, Claude Desktop, Cursor
                  and any other tool that speaks MCP can do the same, or use a token from Settings →
                  Developer — so you can ask about a past decision without leaving the document you
                  are writing.
                </p>
                <Steps
                  items={[
                    <>
                      Go to <strong className="text-foreground">Settings → Developer</strong> and
                      create an access token. It is shown once — copy it then.
                    </>,
                    <>
                      Add EchoBrief to your tool. In Claude Code that is a single command, shown on
                      the same page.
                    </>,
                    <>
                      Ask away. “What did we decide about pricing last quarter?” now works wherever
                      you are.
                    </>,
                  ]}
                />
                <p>Once connected, the assistant can:</p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Search across every transcript and summary you have</li>
                  <li>Read a specific meeting's transcript, decisions and risks</li>
                  <li>Pull your open action items — and tick them off</li>
                </ul>
                <Callout title="It only ever sees your own meetings">
                  A token stands in for you and nobody else. Scoping is enforced by the database,
                  not by the tool asking nicely, and you can revoke a token at any time from the
                  same page. Apart from ticking an action item, reading is all it can do — it
                  cannot start recordings, spend anything, or delete a meeting.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="languages">Languages</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Languages size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">
                    Speak any of these — read English
                  </span>
                </div>
                <p>
                  Transcription runs in translate mode: whatever language is spoken, the transcript
                  and the summary come back in English. Mixed-language meetings — Hinglish, or
                  switching mid-sentence — are handled the same way.
                </p>
                <p className="rounded-lg border border-border bg-card p-4 text-sm">
                  English · Hindi · Hinglish · Tamil · Telugu · Bengali · Kannada · Marathi ·
                  Malayalam · Gujarati · Punjabi · Assamese · Odia · Konkani · Santali · Maithili ·
                  Dogri · Manipuri · Urdu · Sanskrit · Sindhi · Kashmiri
                </p>
                <p className="text-sm">
                  The spoken language is detected automatically, per segment — a meeting header
                  shows the honest mix (“English 78% · Hindi 22%”) rather than a single label.
                  Lines the transcription left untranslated are translated afterwards, so the
                  transcript reads in English end to end. You can set preferred languages during
                  onboarding to improve results.
                </p>
              </section>

              {/* ---------------- Delivery ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="delivery">Email summaries</SectionHeading>
                <p>
                  When a meeting finishes processing, EchoBrief emails you a formatted report —
                  summary, key points, decisions, and action items. This is on by default and can
                  be turned off in <strong className="text-foreground">Settings → Email summaries</strong>.
                </p>
                <p>Reports are always available in the dashboard, whether or not email is enabled.</p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="slack">Slack</SectionHeading>
                <p>
                  Connect a Slack workspace under{' '}
                  <strong className="text-foreground">Settings → Integrations → Slack</strong> and
                  EchoBrief posts each finished meeting to a channel: the summary, one
                  highlight, the decisions, the action items and the next steps, with a link
                  back to the full report. Sections a meeting does not have are left out rather than printed
                  empty — most meetings decide nothing, and a daily "Decisions: none" teaches a
                  channel to stop reading.
                </p>
                <p>
                  Connecting the workspace and choosing the channel are two separate steps.
                  Nothing is posted until you pick a channel from the list — EchoBrief will not
                  guess a destination. The list shows every public channel plus any private
                  channel you have invited EchoBrief to; if a private channel is missing, invite
                  the app to it in Slack and reopen the picker.
                </p>
                <Callout title="The transcript never goes to Slack">
                  A channel is a room full of people, so only the summary, decisions and action
                  items are posted, and only from the meeting itself — anything said before the
                  first external participant joined or after the last one left is excluded, the
                  same boundary the summary email uses. Coaching notes, the underlying quotes and
                  attendee email addresses are never sent.
                </Callout>
                <p>
                  Each meeting posts once. Regenerating a meeting's insights does not re-post it.
                  Disconnecting removes EchoBrief's access to the workspace immediately.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="zoho">Zoho CRM</SectionHeading>
                <p>
                  Connect Zoho under{' '}
                  <strong className="text-foreground">Settings → Integrations → Zoho CRM</strong>{' '}
                  and each finished meeting adds a note to the contact or lead it belongs to:
                  the summary, the decisions, the action items and the next steps, with a link
                  back to the full report.
                </p>
                <p>
                  The match is by email. EchoBrief takes the external attendees from the calendar
                  invite — people whose email domain differs from yours — and looks each one up in
                  your CRM, contacts first, then leads. An attendee who is not in your CRM is
                  skipped; a meeting you started manually from the dashboard has no invitee list,
                  so nothing is matched for it.
                </p>
                <Callout title="EchoBrief only ever adds a note">
                  It does not create contacts, does not edit any field, and does not create tasks
                  or deals. Your CRM is your system of record. The transcript, the recording and
                  the coaching notes are never written to it, and a meeting writes to a given
                  record only once — regenerating a meeting's insights will not add the note
                  again.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="sharing">Sharing a meeting</SectionHeading>
                <p>
                  Open a meeting and press <strong className="text-foreground">Share</strong> to
                  create a link anyone can open — no EchoBrief account, no sign-in. The link shows
                  the summary, the decisions and the action items, and you choose how long it
                  lives: 24 hours, 7 days, 30 days, or never expiring. The link is shown once when
                  you create it and is copied to your clipboard; you can revoke it at any time,
                  after which it shows an expired page.
                </p>
                <p>
                  Two switches decide how much of the meeting travels with the link:
                </p>
                <ul className="ml-5 list-disc space-y-2">
                  <li>
                    <strong className="text-foreground">Include the transcript</strong> — the
                    reader gets the full transcript of the meeting itself. Your pre-call and
                    post-call chatter is left out exactly as it is in the summary.
                  </li>
                  <li>
                    <strong className="text-foreground">Include the recording</strong> — the
                    reader can play the recording back in their browser for as long as it exists
                    (recordings expire after 7 days).
                  </li>
                </ul>
                <Callout tone="warn" title="The recording is the whole call">
                  Unlike the transcript, a recording cannot be trimmed. It contains everything the
                  notetaker captured, including anything said before your guests joined or after
                  they left. Turn it on when you mean to share the room, not just the notes.
                </Callout>
                <p>
                  Both switches are off unless you turn them on, and you can change them later on
                  a link you have already sent. Everything else stays inside your account: attendee
                  email addresses, the coaching scorecard, the quoted facts, and every other
                  meeting you own.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="digests">Scheduled digests</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarClock size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Weekly and monthly recaps</span>
                </div>
                <p>
                  A digest aggregates everything across a period — meetings held, decisions made,
                  and outstanding action items — into a single email. Configure the frequency, the
                  day and time, and who receives it. You can also send one on demand with{' '}
                  <strong className="text-foreground">Send Digest Now</strong>.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="history">Search &amp; history</SectionHeading>
                <p>
                  The <strong className="text-foreground">Meetings</strong> dashboard lists your
                  recordings and meetings shared with you. Filter by the last seven days,
                  external attendees, or action items. Recent failed and cancelled meetings
                  appear separately under Needs attention. Old Recordings links open the dashboard.
                </p>
                <p>
                  Use the search button or Cmd/Ctrl+K to find meeting titles, transcript passages,
                  action items, and contacts. Arrow keys select a result; Enter opens it.
                  Transcript matches open at the matching timestamp, and contact matches open
                  that contact. Action item matches cover your 100 most recent accessible summaries.
                  If a search cannot finish, use Retry; available matches remain visible.
                </p>
                <Callout title="Audio is not kept forever">
                  Recorded audio is deleted after about 30 days. Transcripts, summaries, and
                  insights are kept — they are the part you come back to.
                </Callout>
              </section>

              {/* ---------------- Developers ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="dev-overview">Developer overview</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Terminal size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Build on your own meetings</span>
                </div>
                <p>
                  EchoBrief exposes your meetings two ways, and both are scoped to your own account
                  at the database level:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    <strong className="text-foreground">Pull</strong> — an{' '}
                    <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="underline">MCP</a>{' '}
                    endpoint at <Mono>https://www.echobrief.in/api/mcp</Mono>, which any MCP client
                    (Claude, Cursor, your own agent) can read with an access token.
                  </li>
                  <li>
                    <strong className="text-foreground">Push</strong> — a signed webhook fired at
                    your endpoint when a meeting's insights are ready, for n8n, Make, Zapier or a
                    CRM bridge.
                  </li>
                </ul>
                <Callout title="There is no separate REST API yet">
                  Everything a program can read today, it reads through the MCP endpoint — it is a
                  plain HTTP JSON-RPC service, so a non-agent script can call it too (there is a
                  curl example below). If you need a conventional REST surface, tell us at{' '}
                  <a href="mailto:hello@echobrief.in" className="underline">hello@echobrief.in</a>{' '}
                  and it will be built against real use, not guessed at.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dev-tokens">Access tokens</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Shield size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Settings → Developer</span>
                </div>
                <p>
                  A personal access token stands in for you and nobody else. Create one under{' '}
                  <strong className="text-foreground">Settings → Developer</strong>; it looks like{' '}
                  <Mono>eb_live_…</Mono> and is <strong className="text-foreground">shown once</strong>.
                  Only a SHA-256 digest is stored, so a lost token cannot be recovered — revoke it and
                  mint another.
                </p>
                <p>Send it as a bearer token:</p>
                <Code label="http">{`Authorization: Bearer eb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Up to <strong className="text-foreground">10 active tokens</strong> per account.</li>
                  <li>Revocation takes effect on the next request — there is no cache to wait out.</li>
                  <li>
                    Each token's last use is shown on the same page, refreshed at most hourly, so an
                    unused token is easy to spot and retire.
                  </li>
                  <li>
                    A token carries your permissions, not more: it reads your meetings and can tick an
                    action item. It cannot start a recording, spend money, or delete anything.
                  </li>
                </ul>
                <Callout tone="warn" title="Treat it like a password">
                  Anyone holding the token can read every meeting in your account. Keep it in an
                  environment variable or a secret store, never in a committed file, and revoke it the
                  moment a laptop or a CI job goes missing.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dev-mcp">MCP endpoint</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Plug size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">
                    https://www.echobrief.in/api/mcp
                  </span>
                </div>
                <p>
                  One stateless Streamable-HTTP MCP server. Point any MCP client at it with a token,
                  or — for Claude on the web and mobile — connect over OAuth with no token at all.
                </p>

                <h3 className="pt-2 text-base font-semibold text-foreground">Claude Code</h3>
                <Code>{`claude mcp add --transport http echobrief https://www.echobrief.in/api/mcp \\
  --header "Authorization: Bearer eb_live_..."`}</Code>

                <h3 className="pt-2 text-base font-semibold text-foreground">Claude Desktop / Cursor</h3>
                <p className="text-sm">In the MCP config file:</p>
                <Code label="json">{`{
  "mcpServers": {
    "echobrief": {
      "type": "http",
      "url": "https://www.echobrief.in/api/mcp",
      "headers": { "Authorization": "Bearer eb_live_..." }
    }
  }
}`}</Code>

                <h3 className="pt-2 text-base font-semibold text-foreground">
                  claude.ai web &amp; mobile — no token needed
                </h3>
                <p>
                  Add a custom connector with the URL above and leave the client ID and secret empty.
                  Claude discovers the authorization server, registers itself, and sends you to an
                  EchoBrief consent screen to approve. What it receives is an ordinary access token,
                  listed in Settings → Developer as{' '}
                  <Mono>Claude (OAuth)</Mono>, revocable from the same place.
                </p>
                <p className="text-sm">
                  For your own OAuth client: the issuer is <Mono>https://www.echobrief.in</Mono>,
                  metadata lives at <Mono>/.well-known/oauth-authorization-server</Mono> and{' '}
                  <Mono>/.well-known/oauth-protected-resource</Mono>, dynamic registration is open
                  (RFC 7591, public clients), PKCE S256 is mandatory, and{' '}
                  <Mono>resource</Mono> must be the MCP URL. Authorization codes are single-use with
                  a 5-minute life, access tokens last 30 days, and refresh tokens rotate on every use —
                  replaying one revokes the grant.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dev-tools">MCP tool reference</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Braces size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Eight tools, one write</span>
                </div>
                <ArgTable
                  headers={['Tool', 'Arguments', 'Returns']}
                  rows={[
                    [
                      <Mono>list_meetings</Mono>,
                      <>
                        <Mono>status?</Mono>, <Mono>from?</Mono>, <Mono>to?</Mono>,{' '}
                        <Mono>query?</Mono> (title substring), <Mono>limit</Mono> ≤ 100
                      </>,
                      'Metadata rows, newest first. No transcript or summary text. Cancelled meetings are left out unless you ask for that status.',
                    ],
                    [
                      <Mono>get_meeting</Mono>,
                      <Mono>meeting_id</Mono>,
                      'Metadata, the short summary, and counts of decisions, action items and segments.',
                    ],
                    [
                      <Mono>get_meeting_insights</Mono>,
                      <Mono>meeting_id</Mono>,
                      'The full analysis: summary, key points, decisions, risks, timeline, conversation metrics.',
                    ],
                    [
                      <Mono>search_meetings</Mono>,
                      <>
                        <Mono>query</Mono>, <Mono>limit</Mono> ≤ 25
                      </>,
                      'Ranked snippets, each with a meeting_id to fetch. Full-text over transcripts and summaries.',
                    ],
                    [
                      <Mono>get_transcript</Mono>,
                      <>
                        <Mono>meeting_id</Mono>, <Mono>format</Mono> (<Mono>text</Mono> |{' '}
                        <Mono>segments</Mono>), <Mono>include_internal?</Mono>,{' '}
                        <Mono>speaker?</Mono>, <Mono>offset?</Mono>, <Mono>limit?</Mono>
                      </>,
                      <>
                        <Mono>text</Mono> is <Mono>[m:ss] Speaker:</Mono> paragraphs;{' '}
                        <Mono>segments</Mono> is structured. Both drop the internal pre- and
                        post-meeting zones unless <Mono>include_internal</Mono> is true, and say how
                        many were excluded.
                      </>,
                    ],
                    [
                      <Mono>get_action_items</Mono>,
                      <>
                        <Mono>meeting_id?</Mono>, <Mono>status</Mono> (<Mono>open</Mono> |{' '}
                        <Mono>done</Mono> | <Mono>all</Mono>), <Mono>from?</Mono>, <Mono>to?</Mono>,{' '}
                        <Mono>limit</Mono> ≤ 50
                      </>,
                      <>
                        Items addressed by the <Mono>(meeting_id, index)</Mono> pair, with owner, due
                        date and completion state.
                      </>,
                    ],
                    [
                      <Mono>complete_action_item</Mono>,
                      <>
                        <Mono>meeting_id</Mono>, <Mono>index</Mono>, <Mono>completed</Mono>
                      </>,
                      'The new completion state. The only write in the whole surface, and reversible.',
                    ],
                    [
                      <Mono>get_meeting_facts</Mono>,
                      <Mono>meeting_id</Mono>,
                      'The verbatim-grounded facts — every number spoken, commitments with dates, objections, explicit asks — each with a quote and a timestamp, plus the coaching report. This is what the summary was written from.',
                    ],
                  ]}
                />

                <h3 className="pt-2 text-base font-semibold text-foreground">Calling it directly</h3>
                <p className="text-sm">
                  It is ordinary JSON-RPC over HTTP, so you do not need an MCP client to script
                  against it:
                </p>
                <Code>{`curl -s -X POST https://www.echobrief.in/api/mcp \\
  -H "Authorization: Bearer $ECHOBRIEF_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_meetings",
      "arguments": { "status": "completed", "limit": 5 }
    }
  }'`}</Code>
                <p className="text-sm">
                  Use <Mono>{`"method": "tools/list"`}</Mono> to read the live schemas — they are the
                  authority if this table ever falls behind.
                </p>

                <h3 className="pt-2 text-base font-semibold text-foreground">Errors and paging</h3>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    Failures come back as tool content with <Mono>isError: true</Mono> and a readable
                    message, not as protocol errors — an agent can read it and recover instead of
                    losing its turn.
                  </li>
                  <li>
                    A meeting that is not yours is indistinguishable from one that does not exist.
                    Both answer <em>“it does not exist, or it is not yours”</em>.
                  </li>
                  <li>
                    No response is unbounded. <Mono>get_transcript</Mono> caps a reply at 40,000
                    characters and returns <Mono>truncated: true</Mono> with a{' '}
                    <Mono>next_offset</Mono> — it never cuts off silently.
                  </li>
                </ul>
                <Callout tone="warn" title="Transcripts are untrusted input">
                  A transcript is whatever someone said into a meeting, and it lands straight in a
                  model's context. Transcript and snippet payloads arrive wrapped in a delimited block
                  labelled untrusted, but if you build on this, keep treating that text as data —
                  never as instructions.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="automation">Automation webhook</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Webhook size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Settings → Developer</span>
                </div>
                <p>
                  Give EchoBrief an HTTPS URL and it POSTs a JSON payload there within a minute of a
                  meeting's insights being ready. A signing secret is minted the first time you save a
                  URL; every delivery attempt is logged on the same card with its status code.
                </p>
                <ArgTable
                  headers={['Event', 'When', 'Notes']}
                  rows={[
                    [
                      <Mono>meeting.insights_ready</Mono>,
                      'The first time a meeting finishes processing',
                      'The normal case.',
                    ],
                    [
                      <Mono>meeting.insights_regenerated</Mono>,
                      'Insights were rebuilt for a meeting you already received',
                      'Fires on a speaker rename or a manual regenerate. Same shape — upsert on meeting.id rather than inserting again.',
                    ],
                  ]}
                />

                <h3 className="pt-2 text-base font-semibold text-foreground">Payload</h3>
                <Code label="json">{`{
  "event": "meeting.insights_ready",
  "occurred_at": "2026-09-08T11:31:07.914Z",
  "meeting": {
    "id": "f09a4803-....",
    "title": "Acme — pricing review",
    "start_time": "2026-09-08T10:30:00Z",
    "end_time": "2026-09-08T11:12:00Z",
    "duration_seconds": 2520,
    "attendees": ["priya@acme.com"],
    "languages": { "en": 0.78, "hi": 0.22 },
    "url": "https://www.echobrief.in/meeting/f09a4803-...."
  },
  "summary_short": "Acme agreed to the annual plan ...",
  "action_items": [
    { "task": "Send the revised quote", "owner": "You", "due_date": "2026-09-10" }
  ],
  "decisions": ["Move to annual billing from October"],
  "facts": {
    "meeting_type": "sales_call",
    "numbers": [{ "value": "18%", "context": "discount asked for", "quote": "...", "ts": 742 }],
    "commitments": [],
    "explicit_asks": [],
    "objections": []
  },
  "coaching_summary": "Strong discovery; the next step was not dated."
}`}</Code>
                <p className="text-sm">
                  <strong className="text-foreground">The transcript is never sent.</strong> The
                  payload is deliberately compact: enough to file a CRM note or open a ticket, not a
                  copy of the meeting. Fetch the rest over MCP if you need it.
                </p>

                <h3 className="pt-2 text-base font-semibold text-foreground">Verifying the signature</h3>
                <p className="text-sm">
                  Deliveries are signed with{' '}
                  <a href="https://www.standardwebhooks.com" target="_blank" rel="noreferrer" className="underline">
                    Standard Webhooks
                  </a>{' '}
                  headers, so most libraries verify them out of the box:
                </p>
                <ArgTable
                  headers={['Header', 'Example', 'Meaning']}
                  rows={[
                    [<Mono>webhook-id</Mono>, <Mono>msg_3f9a…</Mono>, 'Unique per delivery. Use it to de-duplicate.'],
                    [<Mono>webhook-timestamp</Mono>, <Mono>1757330267</Mono>, 'Unix seconds. Reject anything far from now.'],
                    [
                      <Mono>webhook-signature</Mono>,
                      <Mono>v1,base64…</Mono>,
                      <>
                        HMAC-SHA256 of <Mono>{'{id}.{timestamp}.{body}'}</Mono> using your secret.
                      </>,
                    ],
                  ]}
                />
                <Code label="javascript">{`import crypto from 'node:crypto';

function verify(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const expected =
    'v1,' +
    crypto.createHmac('sha256', secret)
      .update(\`\${id}.\${ts}.\${rawBody}\`)
      .digest('base64');

  // Reject replays before comparing.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(headers['webhook-signature']);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`}</Code>
                <p className="text-sm">
                  Sign over the <strong className="text-foreground">raw request body</strong>, before
                  any JSON parsing — re-serialising changes the bytes and the signature will never
                  match.
                </p>

                <Callout tone="warn" title="One attempt, no retries">
                  EchoBrief POSTs once, with a 10-second timeout, and records the outcome. It does not
                  retry — a slow or sleeping endpoint misses that meeting. Answer{' '}
                  <Mono>2xx</Mono> immediately and do your work afterwards, and treat the webhook as a
                  nudge: the meeting is always readable over MCP if a delivery was missed.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dev-limits">Limits &amp; scoping</SectionHeading>
                <ArgTable
                  headers={['Limit', 'Value', 'What happens at the edge']}
                  rows={[
                    ['MCP requests', '60 per minute per token', 'Approximate rather than a hard global cap — you are identified and revocable, so it exists to catch runaway loops, not to ration you.'],
                    ['Active tokens', '10 per account', 'Revoke one to mint another.'],
                    [<><Mono>list_meetings</Mono> / <Mono>search_meetings</Mono> / <Mono>get_action_items</Mono></>, '100 / 25 / 50 rows', 'Page with from and to rather than raising the limit.'],
                    [<Mono>get_transcript</Mono>, '40,000 characters per reply', <>Returns <Mono>truncated: true</Mono> and a <Mono>next_offset</Mono>.</>],
                    ['Webhook delivery', '10-second timeout, no retry', 'Logged with its status code in Settings → Developer.'],
                  ]}
                />
                <p>
                  <strong className="text-foreground">Scoping is enforced by the database.</strong>{' '}
                  A token is exchanged for a short-lived identity that is you, and every query runs
                  under the same row-level rules the web app does — so a bug in a tool returns nothing
                  rather than somebody else's meeting. Internal pre- and post-meeting zones stay out of
                  anything shared or automated unless you explicitly ask for them.
                </p>
                <p className="text-sm">
                  Retention follows your plan: once a meeting's content passes the retention window it
                  is removed from the API too, and the meeting row stays with a note that its content
                  expired. See <a href="#privacy" className="underline">Privacy &amp; data</a>.
                </p>
              </section>

              {/* ---------------- Support ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="troubleshooting">Troubleshooting</SectionHeading>
                <div className="space-y-5">
                  {[
                    {
                      q: 'The bot never joined the meeting',
                      a: 'It was probably not admitted from the waiting room in time, and the meeting is marked Cancelled. Give the bot a recognisable name in Settings and let your host know to expect it.',
                    },
                    {
                      q: 'The meeting says Failed',
                      a: 'Open the meeting — the reason is shown on the record. The usual cause is an invalid or expired meeting link. Check the link and start a new recording.',
                    },
                    {
                      q: 'The transcript is empty or says no clear speech was detected',
                      a: 'The recording captured silence. Common causes: everyone was on mute, the bot joined a call that never started, or the meeting used a device the platform did not route audio from.',
                    },
                    {
                      q: 'Speakers show as SPEAKER_00 instead of names',
                      a: 'Participant information was not available for that recording. The transcript and the analysis are still accurate — only the labels are generic.',
                    },
                    {
                      q: 'A long meeting is still processing',
                      a: 'Long recordings are split into chunks and transcribed in parallel, which takes longer than a short call. If a meeting has not completed after about twenty minutes, contact support with the meeting title.',
                    },
                    {
                      q: 'I did not get the summary email',
                      a: 'Check Settings → Email summaries is enabled, and look in spam for a message from hello@echobrief.in. The report is always in the dashboard regardless.',
                    },
                  ].map((item) => (
                    <div key={item.q} className="rounded-lg border border-border bg-card p-4">
                      <p className="mb-1.5 flex items-start gap-2 text-[15px] font-semibold text-foreground">
                        <HelpCircle size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--ember)' }} />
                        {item.q}
                      </p>
                      <p className="pl-6 text-sm">{item.a}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeading id="privacy">Privacy &amp; data</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Shield size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">What we store, and who sees it</span>
                </div>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    <strong className="text-foreground">Recording is visible.</strong> The bot joins
                    as a named participant, so everyone in the call can see a recorder is present.
                  </li>
                  <li>
                    <strong className="text-foreground">Your data is yours.</strong> Meetings,
                    transcripts, and insights are scoped to your account and enforced at the
                    database level — not merely filtered in the interface.
                  </li>
                  <li>
                    <strong className="text-foreground">Audio is deleted</strong> after roughly 30
                    days. Transcripts and insights are retained until you delete them.
                  </li>
                  <li>
                    <strong className="text-foreground">Processing partners.</strong> Delivering
                    these features means meeting content passes through the recording, speech-to-text,
                    AI analysis, and email providers named in our Privacy Policy. It is not sold or
                    used for advertising.
                  </li>
                  <li>
                    <strong className="text-foreground">Deleting works.</strong> Delete a meeting to
                    remove its record, or delete your account from Settings to remove everything.
                  </li>
                </ul>
                <p className="text-sm">
                  Full detail in the{' '}
                  <Link to="/privacy" className="font-medium text-foreground underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link to="/terms" className="font-medium text-foreground underline">
                    Terms
                  </Link>
                  .
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="delete-account">Delete your account</SectionHeading>
                <p>
                  Go to <strong className="text-foreground">Settings → Security → Delete Account</strong>,
                  type <strong className="text-foreground">DELETE</strong> to confirm, and your account is
                  removed along with every meeting, transcript, insight and recording it owned. You are
                  signed out immediately.
                </p>
                <Callout tone="warn" title="This cannot be undone">
                  Deletion is permanent — there is no grace period and no recovery. Export anything you
                  want to keep first.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dpdp">DPDP compliance</SectionHeading>
                <p>
                  EchoBrief is built to operate under India's{' '}
                  <strong className="text-foreground">
                    Digital Personal Data Protection Act, 2023
                  </strong>
                  . In practice that means:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Recording is never covert — the bot is a visible participant.</li>
                  <li>Data is encrypted in transit and at rest by our infrastructure providers.</li>
                  <li>Access to your meetings is restricted to your account.</li>
                  <li>You can access, export, and delete your data, including your whole account.</li>
                  <li>Processing partners are disclosed in the Privacy Policy.</li>
                </ul>
                <Callout tone="warn" title="Consent is a shared responsibility">
                  Recording laws vary by jurisdiction and by the kind of conversation. EchoBrief
                  makes the bot visible, but you are responsible for having whatever consent your
                  meetings and your local law require.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="faq">FAQ</SectionHeading>
                <div className="space-y-4">
                  {[
                    ['Do participants know they are being recorded?', 'Yes. The bot appears in the participant list with the name you set.'],
                    ['Does EchoBrief need microphone access?', 'No. Nothing is captured from your browser or device — the bot records from inside the meeting.'],
                    ['Can I record a meeting I did not organise?', 'Yes, if you have the link and someone admits the bot.'],
                    ['What happens if I leave early?', 'The bot stays until the meeting ends and records the whole call.'],
                    ['Can I edit a summary?', 'Not yet. The transcript is the source of record; you can copy from it.'],
                    ['Is there a limit on meeting length?', 'Long meetings are supported — they are split into chunks for transcription and take longer to process.'],
                  ].map(([q, a]) => (
                    <div key={q} className="border-b border-border pb-4 last:border-0">
                      <p className="mb-1 text-[15px] font-medium text-foreground">{q}</p>
                      <p className="text-sm">{a}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeading id="support">Contact support</SectionHeading>
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Mail size={18} style={{ color: 'var(--ember)' }} />
                    <a
                      href="mailto:support@echobrief.in"
                      className="text-[15px] font-medium text-foreground underline"
                    >
                      support@echobrief.in
                    </a>
                  </div>
                  <p className="text-sm">
                    When reporting a problem with a specific meeting, include the meeting title and
                    roughly when it took place — that is enough for us to find it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 pt-1 text-sm">
                  <Link
                    to="/privacy"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <Shield size={15} /> Privacy Policy
                  </Link>
                  <Link
                    to="/terms"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <ListChecks size={15} /> Terms
                  </Link>
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <Bot size={15} /> Open dashboard
                  </Link>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <SettingsIcon size={15} /> Settings
                  </Link>
                </div>
              </section>

              <div className="border-t border-border pt-8">
                <p className="text-sm text-muted-foreground">
                  Last updated: 21 August 2026 · © 2026 Oltaflock AI. All rights reserved.
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
