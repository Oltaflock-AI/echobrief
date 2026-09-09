# EchoBrief experience and engineering audit

Date: 9 September 2026. Scope: local repository, local browser, synthetic account and meeting data.

EchoBrief has a coherent Console interface and substantial recording, transcription, sharing and account infrastructure. The largest experience problems found in this pass were incorrect states and navigation: search could open the wrong item, failed reads looked like missing data, and small-screen metadata displaced the content users came to read. This change addresses those verified issues while preserving the established design system.

This is a code and local UI audit, **not a certification of production security, accessibility, availability, or AI quality**. Production accounts, databases, billing, email, bots and recordings were not exercised. All browser backend requests were intercepted with fixtures; external requests and WebSockets were blocked.

## Changes implemented

| Priority | Finding and evidence | Result |
| --- | --- | --- |
| High | `GlobalSearch` appended results in request-completion order but rendered them in category order. Keyboard selection read the unsorted array. | Stable category ordering now drives both display and Enter. Tested with deliberately delayed meeting requests and transcript timestamp navigation. |
| High | Search ignored Supabase error objects and had no recoverable error state. | Failed categories produce an alert and Retry while successful categories remain available. |
| High | Task reads ignored Supabase errors; failures appeared as “No action items yet.” | Errors now have a distinct alert and working retry. |
| High | Meeting detail ignored the initial meeting read error, returning “Meeting not found.” | Network failures now show a retry; a successful empty response retains the not-found state. |
| Medium | Search kept old results during debounce and could keep a loading state after clearing. | Results, cursor, loading and errors reset when the query is cleared or the dialog closes. |
| Medium | Contact search interpolated user input into raw PostgREST `or` syntax. | Separate name/email filters avoid filter-grammar conflicts; results are deduplicated. SQL wildcard characters are escaped for literal search. This was a query-correctness issue, not a demonstrated authorization bypass. |
| Medium | Contact results navigated to the generic contacts page. | Results now select the matching contact using its existing `?c=` route. |
| Medium | Action search scanned an unordered 20-row subset. | It scans the newest 100 accessible summaries and explicitly describes that boundary. Full-history action search remains a follow-up. |
| Medium | Mobile search had a fixed desktop top offset, no visible close control, and little room for filters. | Responsive dialog position, visible Close, wrapping scope controls and a constrained scrolling results area. Small-screen metadata yields space to result titles. |
| Medium | Filter controls put `role=tab` on nested spans without a functioning tab pattern. | Shared chips are ordinary toggle buttons with `aria-pressed`, grouped with accessible labels. Touch hit areas follow the existing 44px utility. |
| Medium | Dashboard summary totals counted shared meetings while the meeting/duration totals counted only owned meetings. | Summary totals use the same owned-meeting population. Zero meetings no longer reports “all caught up.” |
| Medium | Realtime updates only replaced existing rows; recovered failed meetings were absent from that list. | Insert/update now upserts by ID, sorts by time and applies hidden statuses. Related insight and due-item queries are invalidated. Code-reviewed; no live Realtime event was emitted. |
| Medium | Dashboard load errors displayed raw error text, alongside zero-valued statistics and an empty-meeting message. | Friendly recovery card, Retry, loading placeholders and a separate connection-failure state. |
| Medium | Dashboard “Today” ended at the viewer’s local midnight even though times display in IST. | The query cutoff now uses the IST date and offset. |
| Medium | “This week” meant a rolling seven days; the due rail included overdue tasks under a week-only label. | Labels now say “Last 7 days” and “Due soon & overdue.” Overdue dates are identified explicitly. |
| Medium | Shared-meeting badges squeezed mobile titles into a few characters. | Shared context moves into secondary mobile text; titles and dates retain useful space. |
| Medium | Dashboard and task empty states only told users what to do. | Improved first-meeting guidance and calendar link; filtered states offer Show all/Clear filters. |
| Medium | Settings read its tab from the URL once, then kept changes only in component state. | Tabs update the URL and follow browser Back/Forward and refresh, preserving other parameters such as the chosen plan. |
| Medium | General protected routes discarded the intended destination at sign-in. | The full local path, query and hash are remembered before redirecting; existing Auth continuation consumes it. Tested with a transcript timestamp link. |
| Low | `/recordings` stopped users on a retired-page explanation. | Existing bookmarks redirect directly to Meetings. |
| Low | Both halves of the Record split button opened the same dialog. | One clear Record button replaces the misleading options affordance. |
| Low | The auth page’s only H1 was in its desktop-only illustration panel. | Each active form has a visible H1; the illustration heading is subordinate. |
| Low | Search/composer inputs lacked explicit accessible names; the skip target was not explicitly focusable; route loading was unnamed. | Added accessible names, focusable main target and an announced loading state. |
| Medium | Documentation said the production build type-checked, but the build script only bundled. | `npm run build` now includes `npm run typecheck`. |
| Low | User documentation described a separate Recordings list. | Search/history documentation now matches the dashboard, search controls and bounded action search. |

## Remaining priorities

These are deliberately separated from the implemented changes. “Code finding” identifies an observable implementation pattern; it does not imply that a production incident was reproduced.

### 1. Chat consistency and recovery — high

**Code findings:** `src/pages/Chat.tsx` starts a conversation, navigates to it, and independently hydrates messages. That hydration can race with the first question write. An answer appends to the current `turns` state even if the reader switches conversations while the request is pending. `persist()` ignores insert/update error objects; history reads also ignore errors.

**Next implementation:** associate each request and hydration with a conversation ID; prevent stale responses from updating another conversation; distinguish loading, failed history, and an actually empty conversation; report failed persistence and retain the unsent/retryable question. Preserve the original conversation’s stored response even if the reader navigates away.

**Acceptance:** delayed first-message insert, delayed answer after switching conversations, failed persistence and reload of a new conversation all preserve the correct message history. These need dedicated regression fixtures before changing the request lifecycle.

### 2. Reliable secondary data and settings — high

**Code findings:** dashboard insight flags/calendar/due queries still ignore some error objects. Meeting detail’s transcript, insight and email reads can fail silently even after the meeting itself loads. Settings maps a profile-read failure to `null`, then renders editable panels with defaults. Contacts and Coaching report their main errors but lack inline retries; the contacts meeting-history query does not surface its error separately. Workspace relies on a toast after a failed initial read.

**Next implementation:** reusable loading/error/empty boundaries per data region, explicit Retry, and protection against saving default form values before the profile has loaded. Keep valid cached content during refresh failures and label it as potentially stale.

**Acceptance:** inject failure separately into every region and verify that “nothing scheduled,” “no transcript,” default preferences and empty histories never stand in for unknown data.

### 3. Data volume and discoverability — medium/high

**Code findings:** Dashboard and ActionItems load large collections without pagination. Dashboard passes every meeting ID to an insight `in` query. Search reads transcript bodies and speaker arrays; action matching remains client-side. The due rail only considers the newest 40 meetings. These are scaling and completeness limits, not measured production latency results.

**Next implementation:** cursor pagination for meetings, a server-side aggregate for totals, bounded detail hydration, and RLS-preserving indexed search. Query due tasks independently of a recent-meeting slice. Give filtered pages URL-backed state where users benefit from bookmarking.

**Acceptance:** a synthetic large history returns stable pages and correct totals; old open tasks remain discoverable; search latency and payload size have explicit budgets. Any new database/search endpoint must pass the tenant-isolation suite.

### 4. Task write races and cross-page freshness — medium

**Code findings:** rapid completion toggles can create overlapping writes; edit saves read/modify/write a whole JSON action array; task mutations do not invalidate the dashboard’s due-task query. Concurrent edits require more than a cosmetic UI change.

**Next implementation:** serialize per-task writes, keep rollback scoped to the latest request, invalidate the affected dashboard queries, and consider server-side/versioned updates for concurrent editors.

**Acceptance:** double toggles, failed writes and two edits to different actions leave the correct saved state; the dashboard updates after a completion.

### 5. Account transitions and authentication assurance — requires focused validation

**Code findings:** most query keys include the user ID, but some (for example contact-meetings) do not. `CalendarContext` persists client state independently of account changes. The query client is not cleared at sign-out. MFA status intentionally falls back to “not required” on network errors and is resolved asynchronously.

**Next implementation:** audit cached data and provider state across sign-out/account switches; test enrolled-MFA cold loads, offline state and failures against server-side enforcement. Do not treat a frontend gate as proof of database protection, or the current fallback alone as proof of a data leak.

**Acceptance:** one account’s cached meeting/calendar content never appears for another; enrolled MFA is enforced at the actual server boundary. Run the isolated two-user RLS suite when that boundary is changed.

### 6. Accessibility, motion and theme consistency — medium

The local checks cover keyboard search, accessible filter state, visible form headings and horizontal overflow. They are not a WCAG audit. Remaining work includes a screen-reader pass, zoom/large text, touch hit-area overlap, mobile software keyboards, contrast across every status and chart, and focus after route changes. CSS reduced-motion rules exist, but JavaScript-driven Framer Motion animations require their own verification. The Console deliberately uses a light palette while public pages retain theme controls; make that product behavior explicit before offering a full dark Console.

### 7. Documentation and design-system drift — medium

`BRAND.md` describes Warm Dispatch while the current Console tokens are ratified separately in `echobrief-ui-v2/BRAND_DECISION.md`. Multiple UI component families remain (`src/ui` and generated shadcn primitives); establish which family owns new product screens without editing generated primitives indiscriminately. Security docs describe registration as disabled, while signup links describe it as open. The public docs contain a general “about 30 days” audio-retention statement while Recall configuration sets 240 hours; audio archive and video retention must be documented separately after verifying the deployed configuration.

### 8. Live workflow validation — not performed

Onboarding, calendar OAuth/reconnection, real bot admission/cancellation, upload limits/progress/retry, translated transcript quality, speaker edits, regeneration, recording expiry, shared links, invitations, billing transitions and email delivery need an end-to-end pass in an appropriate test account/environment. Code inspection and mocked UI checks cannot certify those outcomes. Existing production-facing pipeline/eval/RLS harnesses were not run during this local UI change.

## Coverage and evidence

| Area | Method and result |
| --- | --- |
| Dashboard | Code review and synthetic browser checks at 320, 390, 768, 1024 and 1440px; owned/shared/empty states. |
| Global search | Delayed requests, keyboard order, timestamp link, partial failure/retry, clear query, responsive dialog checks. |
| Action items | Code review; failed read vs empty, successful retry, clearing filters, exposed selection state. |
| Meeting detail | Primary read failure, retry and genuinely missing-meeting state tested; remaining detail reads reviewed in code. |
| Settings | URL state, reload, Back and parameter preservation tested; profile/error and mutation paths reviewed in code. |
| Public pages | Landing, Auth, Docs, Privacy, Terms and 404 rendered at 390px; sign-in continuation verified. No live sign-in submitted. |
| Other product areas | Targeted code inspection of calendar, chat, contacts, coaching, onboarding, recording/upload, sharing, workspace and account controls. Not all flows exercised. |
| Production build | Brand check, frontend type-check and Vite production bundle pass. Largest entry chunk approximately 252KB / 76KB gzip; no user-network performance claim. |
| Lint | 0 errors; 50 existing warnings, unchanged in count. |
| Backend unit suite | 445 pass, 0 fail. |
| MCP/OAuth suite | API TypeScript check and 63 tests pass. Local socket access was required for the test servers. |
| Browser errors | No uncaught exceptions in the exercised scenarios. |

The reproducible browser harness is [`scripts/ui-audit/check.mjs`](../../../scripts/ui-audit/check.mjs). Start the local dev server, then run it with an installed Playwright module:

```bash
npm run dev -- --host 127.0.0.1
# In a second terminal, with Playwright available:
node scripts/ui-audit/check.mjs
# Or point to an existing Playwright installation:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/ui-audit/check.mjs
```

Playwright is not added to the app dependencies. The harness reads the local Supabase URL to intercept requests and seed a synthetic session; it does not use a real account. Screenshots default to `/tmp/echobrief-ui-audit`; set `UI_AUDIT_OUTPUT` to change that location. Browser fixtures do not verify PostgREST/RLS semantics, provider integration, or real media seeking.

Selected screenshots: [desktop dashboard](dashboard-desktop.png), [mobile dashboard](dashboard-mobile.png), [mobile search](search-mobile.png), [first-meeting state](dashboard-empty.png).

No production deployment, database migration, commit or external message was performed.
