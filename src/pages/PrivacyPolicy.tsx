import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

/**
 * The sub-processors that actually touch customer data.
 *
 * Kept as data rather than prose so it is obvious when one is added: any new
 * vendor in the pipeline needs a row here in the same change. The September
 * 2026 audit found this page naming none of them while the marketing site
 * claimed "data stays in India" — audio goes to Recall.ai, transcripts to
 * OpenAI and mail through Resend, all United States.
 */
const SUBPROCESSORS: Array<{
  name: string;
  purpose: string;
  data: string;
  location: string;
}> = [
  {
    name: 'Supabase',
    purpose: 'Database, authentication and file storage',
    data: 'Account details, transcripts, summaries, archived audio',
    location: 'Australia (Sydney)',
  },
  {
    name: 'Recall.ai',
    purpose: 'The meeting bot that joins and records your call',
    data: 'Meeting audio and video, participant names',
    location: 'United States',
  },
  {
    name: 'Sarvam AI',
    purpose: 'Speech-to-text across 22 Indian languages',
    data: 'Meeting audio',
    location: 'India',
  },
  {
    name: 'OpenAI',
    purpose: 'Summaries, action items and coaching; fallback transcription',
    data: 'Transcript text',
    location: 'United States',
  },
  {
    name: 'Resend',
    purpose: 'Summary and account email',
    data: 'Email address, meeting summary content',
    location: 'United States',
  },
  {
    name: 'Vercel',
    purpose: 'Web app hosting and audio processing',
    data: 'Meeting audio in transit, request logs',
    location: 'United States',
  },
  {
    name: 'Dodo Payments',
    purpose: 'Subscription billing',
    data: 'Name, email, billing details',
    location: 'United States',
  },
  {
    name: 'Google',
    purpose: 'Calendar sync and sign-in — only if you connect them',
    data: 'Calendar event titles, times and attendee emails',
    location: 'United States',
  },
  {
    name: 'Google Analytics',
    purpose: 'Website traffic measurement',
    data: 'Page path (identifiers removed), device, approximate location',
    location: 'United States',
  },
  {
    name: 'Sentry',
    purpose: 'Error monitoring',
    data: 'Technical error reports, user ID',
    location: 'United States',
  },
];

/** Mirrors PLANS in supabase/functions/_shared/entitlements.ts. */
const RETENTION: Array<{ what: string; how_long: string }> = [
  { what: 'Meeting video (for playback)', how_long: '7 days, then deleted by Recall.ai' },
  { what: 'Archived audio recording', how_long: 'Up to 30 days, often sooner' },
  { what: 'Transcripts, summaries, insights and coaching', how_long: 'Starter 30 days · Pro 90 days · Teams 365 days' },
  { what: 'Transcripts on an account with no active plan', how_long: '14 days' },
  { what: 'Meeting record (title, date, status)', how_long: 'While your account is open' },
  { what: 'Billing and usage records', how_long: '8 years, as Indian tax law requires' },
  { what: 'Everything, after you delete your account', how_long: 'Removed immediately; backups roll off within 30 days' },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            ← Back to Home
          </Link>
          <article className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-3xl font-bold mb-2">EchoBrief Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Last updated: 1 September 2026</p>

            <p className="lead">
              EchoBrief records meetings you send it to, transcribes them, and writes summaries.
              That means we handle recordings of conversations, which is about as sensitive as
              business data gets. This page says plainly what we collect, who else sees it, how
              long we keep it, and how to get it back or get rid of it.
            </p>
            <p>
              EchoBrief is operated by <strong>Oltaflock AI</strong>, India. In Indian data
              protection law we are the <em>Data Fiduciary</em> for your account data, and the
              processor acting on your instructions for your meeting content.
            </p>

            <h2>1. What EchoBrief does, and what it does not</h2>
            <p>
              A recording bot joins a meeting <strong>only</strong> when you send it to one, or
              when you have switched on auto-join for a calendar you connected. It appears in the
              participant list under a name you choose. It cannot join a meeting nobody admits it
              to, and it never listens to anything outside a meeting.
            </p>
            <p>
              We do <strong>not</strong> sell or rent data, we do <strong>not</strong> use it for
              advertising or profiling, and we do <strong>not</strong> train AI models on your
              meetings. Our AI vendors process your content to return a result and for nothing
              else.
            </p>

            <h2>2. Getting consent is your responsibility</h2>
            <p>
              Recording laws differ by country and by state, and several require every participant
              to agree. You are responsible for having that agreement before you send the bot into
              a call. The bot is visible in the participant list precisely so nobody is recorded
              without seeing it happen.
            </p>

            <h2>3. What we collect</h2>
            <ul>
              <li><strong>Meeting audio and video</strong> — captured while the bot is in the call.</li>
              <li><strong>Transcripts and derived content</strong> — the transcript, summary, action items, decisions, metrics and coaching notes.</li>
              <li><strong>Participant information</strong> — names and email addresses of people in the meeting or on the invite.</li>
              <li><strong>Account information</strong> — your name, email, and settings.</li>
              <li><strong>Calendar data</strong> — event titles, times and attendees, only if you connect a calendar.</li>
              <li><strong>Usage and billing records</strong> — how many meetings and hours you used, and your subscription status.</li>
              <li><strong>Technical logs</strong> — error reports and request metadata, used to keep the service working.</li>
            </ul>

            <h3>Small talk before and after the meeting</h3>
            <p>
              EchoBrief estimates when external attendees were actually present and excludes what
              was said outside that window from summaries, insights, coaching and the summary
              email. The full transcript remains available to you, the account owner.
            </p>

            <h2>4. Who else processes your data</h2>
            <p>
              We use the vendors below. Each one processes your data only to deliver a part of
              EchoBrief, under contract, and none of them may use it for their own purposes.
              We will update this list before adding anyone new.
            </p>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>What it does</th>
                    <th>What it sees</th>
                    <th>Where</th>
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSORS.map((s) => (
                    <tr key={s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.purpose}</td>
                      <td>{s.data}</td>
                      <td>{s.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <strong>Your data leaves India.</strong> Speech-to-text runs in India on Sarvam AI,
              but recording, summarisation, email and hosting run in the United States, and the
              database is in Australia. If that is a problem for your organisation, tell us before
              you sign up rather than after.
            </p>

            <h2>5. How long we keep things</h2>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Kept for</th>
                  </tr>
                </thead>
                <tbody>
                  {RETENTION.map((r) => (
                    <tr key={r.what}>
                      <td>{r.what}</td>
                      <td>{r.how_long}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Deletion is automatic — a scheduled job removes expired content, it is not something
              you have to ask for. Meetings recorded before 1 September 2026, when this schedule
              took effect, are kept until you delete them yourself.
            </p>

            <h2>6. Your rights</h2>
            <p>
              Under India&apos;s Digital Personal Data Protection Act, 2023 — and equivalently
              under GDPR if you are in the EU or UK — you may:
            </p>
            <ul>
              <li><strong>See what we hold</strong> about you, and how it has been shared.</li>
              <li><strong>Correct</strong> anything inaccurate or incomplete.</li>
              <li><strong>Delete</strong> your data. Settings → Delete account removes your account, meetings, transcripts, insights, recordings and Google tokens.</li>
              <li><strong>Export</strong> your meetings and transcripts in a machine-readable form.</li>
              <li><strong>Withdraw consent</strong> and disconnect your calendar at any time.</li>
              <li><strong>Nominate</strong> someone to exercise these rights if you die or become incapacitated.</li>
              <li><strong>Complain</strong> to us first, and to the Data Protection Board of India if we do not resolve it.</li>
            </ul>
            <p>We answer rights requests within 30 days.</p>

            <h2>7. Security</h2>
            <ul>
              <li>Everything travels over HTTPS, and is encrypted at rest by our infrastructure providers.</li>
              <li>Row-level security in the database means a query can only ever return your own rows — access control is enforced by the database, not only by application code.</li>
              <li>Every backend endpoint requires an authenticated caller; webhooks are signature-verified.</li>
              <li>Backups are encrypted and held separately from the production database.</li>
              <li>Access to production is limited to staff who need it.</li>
            </ul>
            <p>
              We do <strong>not</strong> currently hold a SOC 2 or ISO 27001 certification. We
              would rather say so than imply otherwise.
            </p>
            <p>
              If a breach affects your data we will notify you and the Data Protection Board
              without undue delay, with what happened and what to do about it.
            </p>

            <h2>8. Children</h2>
            <p>
              EchoBrief is for business use and not intended for anyone under 18. We do not
              knowingly collect data about children.
            </p>

            <h2>9. Data Processing Agreement</h2>
            <p>
              If your organisation needs a signed DPA, or a security review before purchase, email
              us and we will send one.
            </p>

            <h2>10. Changes</h2>
            <p>
              We will update this page when the service changes, and revise the date at the top.
              For anything that materially affects your rights we will email you rather than rely
              on you re-reading this page.
            </p>

            <h2>11. Contact and grievance officer</h2>
            <p>
              For privacy questions, rights requests, or a complaint under the DPDP Act, our
              Grievance Officer is reachable at:
            </p>
            <p>
              <a
                href="mailto:admin@oltaflock.ai"
                className="text-accent hover:underline font-medium"
              >
                admin@oltaflock.ai
              </a>
              <br />
              Oltaflock AI, India
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
