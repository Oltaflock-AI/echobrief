/** Local-only browser regression checks. All backend traffic uses synthetic fixtures.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/ui-audit/check.mjs
 * Start `npm run dev -- --host 127.0.0.1` first. No real account is needed.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.UI_AUDIT_URL || 'http://127.0.0.1:8080';
const artifacts = process.env.UI_AUDIT_OUTPUT || '/tmp/echobrief-ui-audit';
await mkdir(artifacts, { recursive: true });
let supabaseUrl;
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const contents = await readFile(file, 'utf8').catch(() => '');
  const match = contents.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m);
  if (match) supabaseUrl = match[1];
}
assert(supabaseUrl, 'Local VITE_SUPABASE_URL must be configured');
const uid = '00000000-0000-4000-8000-000000000001';
const user = { id: uid, email: 'audit@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated', role: 'authenticated', factors: [] };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1', amr: [] })).toString('base64url')}.fixture`;
const session = { user, access_token: token, refresh_token: 'fixture', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer' };
const meeting = { id: 'meeting-own', user_id: uid, title: 'Roadmap planning', status: 'completed', start_time: new Date().toISOString(), duration_seconds: 1800, source: 'google_meet', attendees: [], meeting_insights: [{ id: 'insight-own', action_items: [{ task: 'Roadmap review', owner: 'Alex', due_date_resolved: '2026-09-10' }] }] };
const shared = { ...meeting, id: 'meeting-shared', user_id: 'other-user', title: 'Shared roadmap', meeting_insights: [] };
const insights = [meeting, shared].map((m) => ({ id: `insight-${m.id}`, meeting_id: m.id, created_at: meeting.start_time, action_items: [{ task: 'Roadmap review' }], meetings: { title: m.title } }));
let failTasks = false;
let failDetail = false;
let failSearch = false;
let empty = false;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  // Block every nonlocal request unless fulfilled below, including analytics,
  // WebSockets, auth writes and recording requests.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== new URL(supabaseUrl).origin) return route.abort();
    let data = [];
    let status = 200;
    if (url.pathname.includes('/auth/v1/user')) data = user;
    else if (url.pathname.includes('/rest/v1/profiles')) data = { onboarding_completed: true, full_name: 'Audit User', subscription_tier: 'free' };
    else if (url.pathname.includes('/rest/v1/meetings')) {
      if (url.searchParams.has('id')) {
        status = failDetail ? 503 : 200;
        data = failDetail ? { message: 'Fixture unavailable' } : url.searchParams.get('id') === 'eq.missing' ? null : meeting;
      } else if (failTasks && url.searchParams.get('select')?.includes('meeting_insights')) { status = 503; data = { message: 'Fixture unavailable' }; }
      else if (url.searchParams.get('status')?.startsWith('in.')) data = [];
      else data = empty ? [] : [meeting, shared];
      if (url.searchParams.has('title')) await new Promise((r) => setTimeout(r, 180));
    } else if (url.pathname.includes('/rest/v1/meeting_insights')) data = empty ? [] : insights;
    else if (url.pathname.includes('/rest/v1/transcripts')) {
      if (failSearch) { status = 503; data = { message: 'Fixture unavailable' }; }
      else data = [{ id: 'transcript-own', meeting_id: meeting.id, content: 'Roadmap discussion', speakers: [{ text: 'Roadmap discussion', speaker: 'Alex', start: 42 }], meetings: { title: meeting.title } }];
    } else if (url.pathname.includes('/rest/v1/contacts')) data = [{ id: 'contact', name: 'Roadmap Partner', email: 'roadmap@example.test' }];
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.routeWebSocket('**/*', (ws) => ws.close());
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`, session });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('heading', { name: 'Meetings', exact: true }).waitFor();
  await page.getByText('all caught up').waitFor();
  await page.screenshot({ path: `${artifacts}/dashboard-desktop.png`, fullPage: true });
  assert.equal(await page.getByText('Roadmap planning', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Search meetings', exact: true }).click();
  const input = page.getByRole('combobox');
  await input.fill('Roadmap');
  await page.getByRole('option').first().waitFor();
  await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-busy') === 'false');
  const active = await input.getAttribute('aria-activedescendant');
  assert.equal(active, 'search-meeting-meeting-own');
  await input.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-activedescendant'), 'search-meeting-meeting-shared');
  await input.press('ArrowDown');
  assert.equal(await input.getAttribute('aria-activedescendant'), 'search-transcript-transcript-own');
  await input.press('Enter');
  await page.waitForURL('**/meeting/meeting-own?t=42');
  console.log('PASS: delayed requests preserve visible keyboard order and transcript timestamps');
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('button', { name: 'Search meetings', exact: true }).click();
  failSearch = true;
  await page.getByRole('combobox').fill('Roadmap');
  await page.getByText('Some results couldn’t load. Try searching again.').waitFor();
  failSearch = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText('Some results couldn’t load. Try searching again.').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-busy') === 'false');
  await page.getByRole('combobox').fill('');
  assert.equal(await page.getByRole('option').count(), 0);
  console.log('PASS: partial search errors, retry, and clearing results');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('combobox').fill('Roadmap');
    await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-busy') === 'false');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Search overflow at ${width}px`);
    const box = await page.getByRole('dialog').boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 844, `Search dialog outside ${width}px viewport`);
    await page.screenshot({ path: `${artifacts}/search-${width}.png` });
  }
  await page.getByRole('button', { name: 'Close search', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Dashboard overflow at ${width}px`);
    await page.screenshot({ path: `${artifacts}/dashboard-${width}.png`, fullPage: true });
  }
  console.log('PASS: dashboard and search viewport checks');
  failDetail = true;
  await page.goto(`${origin}/meeting/meeting-own`);
  await page.getByRole('heading', { name: 'Couldn’t load this meeting' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Meeting not found' }).count(), 0);
  failDetail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'Roadmap planning', exact: true }).waitFor();
  await page.goto(`${origin}/meeting/missing`);
  await page.getByRole('heading', { name: 'Meeting not found' }).waitFor();
  console.log('PASS: meeting read failure differs from missing meeting, with working retry');
  failTasks = true;
  await page.goto(`${origin}/action-items`);
  await page.getByText('Couldn’t load your action items').waitFor();
  assert.equal(await page.getByText('No action items yet', { exact: true }).count(), 0);
  failTasks = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('Roadmap review', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  console.log('PASS: task failure/retry, clear filters, accessible selection');
  await page.goto(`${origin}/settings?tab=account&plan=pro`);
  await page.getByRole('button', { name: 'Bot', exact: true }).click();
  await page.waitForURL('**/settings?tab=bot&plan=pro');
  await page.reload();
  await page.getByRole('button', { name: 'Bot', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Bot', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.goBack();
  await page.waitForURL('**/settings?tab=account&plan=pro');
  assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).getAttribute('aria-pressed'), 'true');
  console.log('PASS: settings tabs survive reload and browser Back, preserving plan parameters');
  await page.getByRole('button', { name: 'Developer', exact: true }).click();
  await page.getByRole('button', { name: 'Connect Codex', exact: true }).click();
  const codexDialog = page.getByRole('dialog', { name: 'Connect Codex', exact: true });
  await codexDialog.waitFor();
  await page.evaluate(() => {
    window.auditClipboard = '';
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, writable: true, value: async (text) => { window.auditClipboard = text; } });
  });
  await codexDialog.getByRole('button', { name: 'Copy server URL', exact: true }).click();
  assert.equal(await page.evaluate(() => window.auditClipboard), 'https://www.echobrief.in/api/mcp');
  await codexDialog.getByRole('button', { name: 'Terminal', exact: true }).click();
  await codexDialog.getByRole('button', { name: 'Copy add command', exact: true }).click();
  assert.equal(await page.evaluate(() => window.auditClipboard), 'codex mcp add echobrief --url https://www.echobrief.in/api/mcp');
  await codexDialog.getByRole('button', { name: 'Copy login command', exact: true }).click();
  assert.equal(await page.evaluate(() => window.auditClipboard), 'codex mcp login echobrief');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
  await codexDialog.getByRole('button', { name: 'Copy login command', exact: true }).click();
  await page.getByText('Select the text and copy it manually.', { exact: true }).waitFor();
  await page.screenshot({ path: `${artifacts}/connect-codex-desktop.png` });
  await codexDialog.getByRole('button', { name: 'Close setup', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Connect Codex', exact: true }).click();
  await codexDialog.waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Codex setup mobile overflow');
  await page.screenshot({ path: `${artifacts}/connect-codex-mobile.png` });
  await codexDialog.getByRole('button', { name: 'Close setup', exact: true }).click();
  await page.getByRole('group', { name: 'MCP client', exact: true }).getByRole('button', { name: 'Codex', exact: true }).click();
  await page.getByText('codex mcp add echobrief --url https://www.echobrief.in/api/mcp --bearer-token-env-var ECHOBRIEF_API_TOKEN', { exact: true }).waitFor();
  console.log('PASS: Connect Codex app/CLI setup, exact copied values, clipboard failure, mobile dialog and token alternative');

  empty = true;
  await page.goto(`${origin}/dashboard`);
  await page.getByText('Your next meeting, already briefed').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${artifacts}/dashboard-empty.png`, fullPage: true });
  await page.goto(`${origin}/recordings`);
  await page.waitForURL('**/dashboard');
  console.log('PASS: useful empty state and legacy recordings redirect');
  // Public entry points and sign-in continuation in a separate signed-out browser.
  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await publicContext.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await publicContext.routeWebSocket('**/*', (ws) => ws.close());
  const visitor = await publicContext.newPage();
  visitor.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/', '/auth', '/docs', '/privacy', '/terms', '/not-a-page']) {
    await visitor.goto(`${origin}${path}`);
    await visitor.locator('h1').first().waitFor();
    if (path === '/') await visitor.waitForFunction(() => Number(getComputedStyle(document.querySelector('h1')).opacity) >= 0.99 && Number(getComputedStyle(document.querySelector('main a[href*=auth]').parentElement).opacity) >= 0.99);
    assert(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Public page overflow: ${path}`);
    await visitor.screenshot({ path: `${artifacts}/public-${path.replaceAll('/', '') || 'landing'}.png` });
  }
  await visitor.goto(`${origin}/meeting/fixture?t=42`);
  await visitor.waitForURL('**/auth');
  assert.equal(await visitor.evaluate(() => sessionStorage.getItem('eb_post_login_redirect')), '/meeting/fixture?t=42');
  console.log('PASS: six public entry points at 390px and sign-in destination preservation');
  await publicContext.close();
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
