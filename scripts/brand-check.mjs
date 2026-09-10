#!/usr/bin/env node
/**
 * brand-check — mechanical enforcement of brand/ across the codebase.
 *
 *   npm run brand:check
 *
 * Checks, in order:
 *   1. Raw hex colours that aren't in the brand palette
 *   2. Retired palette values (the pre-rebrand Tailwind orange set)
 *   3. Fonts outside the two approved stacks
 *   4. Banned marketing words in user-facing copy
 *   5. Logo assets that have drifted from brand/logo/svg/
 *   6. References to assets that no longer exist
 *
 * The palette is read from brand/tokens/colors.json, so adding a token there
 * (and to src/index.css) is all it takes to make a new colour legal.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(ROOT, p);

/* ── palette ─────────────────────────────────────────────────────────────── */
const palette = JSON.parse(readFileSync(join(ROOT, 'brand/tokens/colors.json'), 'utf8'));
const ALLOWED_HEX = new Set();
const collect = (node) => {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/#[0-9A-Fa-f]{6}\b/g)) ALLOWED_HEX.add(m[0].toUpperCase());
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const v of Object.values(node)) collect(v);
};
collect(palette);
['#FFFFFF', '#FFF', '#000000', '#000'].forEach((h) => ALLOWED_HEX.add(h));

/** Third-party brand colours we are not free to restyle. */
const THIRD_PARTY_HEX = new Map([
  ['#4285F4', 'Google brand blue'],
  ['#00832D', 'Google Meet green'],
  ['#00AC47', 'Google Meet light green'],
  ['#0066DA', 'Google Meet blue'],
  ['#2684FC', 'Google Meet light blue'],
  ['#E94235', 'Google Meet red'],
  ['#FFBA00', 'Google Meet yellow'],
  ['#0B57D0', 'Google brand blue (dark)'],
  ['#2D8CFF', 'Zoom brand blue'],
  ['#6264A7', 'Microsoft Teams purple'],
  ['#5059C9', 'Microsoft Teams dark purple'],
  ['#7B83EB', 'Microsoft Teams light purple'],
  ['#5A62C3', 'Microsoft Teams square gradient (start)'],
  ['#4D55BD', 'Microsoft Teams square gradient (mid)'],
  ['#3940AB', 'Microsoft Teams square gradient (end)'],
  ['#0078D4', 'Microsoft Outlook blue'],
  ['#25D366', 'WhatsApp green'],
  ['#4A154B', 'Slack aubergine'],
]);

/** Retired palette — these must never come back.
 *  #78716C, #A8A29E and #22C55E left this list on 8 Sep 2026: the Console palette
 *  uses the first two as text-secondary / text-muted and the third as the
 *  live-recording dot ONLY (success stays #2F7A4D on #E8F3EC). */
const RETIRED = new Map([
  ['#F97316', 'ember (--ember / #D93F0B)'],
  ['#FB923C', 'warn (--warn) or ember-hi (--ember-hi)'],
  ['#F59E0B', 'gold (--gold / #F5C842) or warn (--warn)'],
  ['#7C2D12', 'ember-ink (--ember-ink)'],
  ['#D4900A', 'gold (--gold / #F5C842)'],
  ['#EF4444', 'stop (--stop / #D7352D)'],
  ['#3B82F6', 'info (--info / #2B88C0)'],
  ['#A855F7', 'violet (--violet / #8A5FC9)'],
]);

// Stock Tailwind palette families. Every one of these has a Warm Dispatch
// equivalent, so any use in a component is unbranded drift.
const TAILWIND_PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
];
const TAILWIND_PALETTE_RE = new RegExp(
  `(?<![\\w-])(?:bg|text|border|ring|from|via|to|decoration|outline|shadow|fill|stroke|divide|accent|caret|placeholder)-(?:${TAILWIND_PALETTE_FAMILIES.join('|')})-(?:50|[1-9]00|950)(?![\\w-])`,
  'g',
);

// Outfit and DM Sans were banned under Warm Dispatch. Ratified into the brand on
// 8 Sep 2026 — see echobrief-ui-v2/BRAND_DECISION.md. Instrument Serif is approved
// for the wordmark only and is deliberately NOT a Tailwind fontFamily utility.
const BANNED_FONTS = ['Inter', 'Roboto', 'Poppins', 'Lato', 'Montserrat', 'Open Sans'];
const APPROVED_FONTS = 'Outfit, DM Sans, Instrument Serif (wordmark only), JetBrains Mono, Switzer, DM Serif Display, Manrope, IBM Plex Mono, Noto Sans *';

const BANNED_WORDS = ['AI-powered', 'AI powered', 'cutting-edge', 'cutting edge', 'next-gen',
  'next generation', 'revolutionary', 'revolutionise', 'revolutionize', 'seamless', 'game-changing'];

/* ── file walk ───────────────────────────────────────────────────────────── */
// 'docs' holds internal engineering notes, not a customer-facing surface.
// 'artifacts' holds client proposal packs — decks and PDFs made FOR a customer,
// carrying that customer's palette, not ours. Gitignored for the same reason.
// 'echobrief-ui-v2' is the design handoff package (mockup HTML, reference kit,
// brand marks) — documentation, not shipped code. The mockups carry values the
// product does not ship; the tokens that DO ship live in src/index.css.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'brand', 'scripts', 'docs',
  '.next', 'coverage', 'recordings', 'echobrief-ui-v2', 'artifacts']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }   // broken symlinks
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.has(extname(p))) out.push(p);
  }
  return out;
}

/** Files that legitimately define the palette itself, or are generated. */
const isTokenSource = (p) => /src\/index\.css$|tailwind\.config|src\/components\/ui\/|src\/integrations\/supabase\/types\.ts$/.test(p);

/* ── findings ────────────────────────────────────────────────────────────── */
const findings = [];
const add = (rule, file, line, msg, fix) => findings.push({ rule, file, line, msg, fix });

const files = walk(ROOT);

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const r = rel(file);

  lines.forEach((line, i) => {
    const n = i + 1;
    if (/brand-check-ignore/.test(line)) return;

    // 1 + 2 — hex colours
    for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
      const hex = m[0].toUpperCase();
      if (RETIRED.has(hex)) {
        add('retired-colour', r, n, `${m[0]} is from the retired palette`, `use ${RETIRED.get(hex)}`);
      } else if (!isTokenSource(r) && !ALLOWED_HEX.has(hex) && !THIRD_PARTY_HEX.has(hex)) {
        add('off-palette-hex', r, n, `${m[0]} is not in the brand palette`,
          'use a var(--token), or add the colour to brand/tokens/colors.json + src/index.css');
      }
    }

    // 2b — off-palette Tailwind colour utilities.
    // The hex scan above never saw these: `bg-orange-500` carries no hex, so
    // 72 of them had accumulated across 9 files by the 2026-09-03 UI audit.
    // Warm Dispatch has tokens for all of it — ember/gold/success/warning/
    // destructive — so a stock palette name is always drift.
    if (/\.(tsx|jsx|html)$/.test(r) && !isTokenSource(r)) {
      for (const m of line.matchAll(TAILWIND_PALETTE_RE)) {
        add('off-palette-utility', r, n, `"${m[0]}" is a stock Tailwind colour, not a brand token`,
          'use ember / gold / success / warning / destructive — see tailwind.config.ts');
      }
    }

    // 3 — fonts
    for (const f of BANNED_FONTS) {
      if (new RegExp(`['"\`\\s]${f}['"\`,]`, 'i').test(line)) {
        add('banned-font', r, n, `"${f}" is not an approved face`, `use one of: ${APPROVED_FONTS}`);
      }
    }

    // 4 — copy, user-facing surfaces only
    if (/\.(tsx|html)$/.test(r) || /functions\/_shared\/|functions\/send-/.test(r)) {
      const hit = BANNED_WORDS.find((w) =>
        new RegExp(`\\b${w.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(line));
      if (hit) add('banned-copy', r, n, `"${hit}" is banned in EchoBrief copy`,
        'say what it actually does — see brand/IDENTITY.md §7');
    }
  });
}

/* 5 — logo assets must match the brand kit byte-for-byte */
const MIRRORED = [
  ['public/echobrief-logo-light.svg', 'brand/logo/svg/echobrief-lockup-light.svg'],
  ['public/echobrief-logo-dark.svg', 'brand/logo/svg/echobrief-lockup-dark.svg'],
  ['public/favicon.svg', 'brand/logo/svg/echobrief-icon.svg'],
  ['src/assets/echobrief-logo-light.svg', 'brand/logo/svg/echobrief-lockup-light.svg'],
  ['src/assets/echobrief-icon.svg', 'brand/logo/svg/echobrief-icon.svg'],
];
for (const [copy, source] of MIRRORED) {
  const a = join(ROOT, copy), b = join(ROOT, source);
  if (!existsSync(a)) { add('logo-missing', copy, 0, 'mirrored logo asset is missing', `cp ${source} ${copy}`); continue; }
  if (readFileSync(a, 'utf8') !== readFileSync(b, 'utf8')) {
    add('logo-drift', copy, 0, `has drifted from ${source}`, `cp ${source} ${copy}`);
  }
}

/* 6 — dangling references to local assets */
const RETIRED_ASSETS = ['echobrief-logo.png', 'echobriefIcon.png', 'icon16.png', 'icon48.png', 'icon128.png'];
for (const file of files) {
  const r = rel(file);
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const a of RETIRED_ASSETS) {
      if (line.includes(a)) add('retired-asset', r, i + 1, `references ${a}, which was removed`, 'use brand/logo/ assets instead');
    }
  });
}

/* ── report ──────────────────────────────────────────────────────────────── */
const C = process.stdout.isTTY
  ? { r: '\x1b[31m', y: '\x1b[33m', g: '\x1b[32m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { r: '', y: '', g: '', d: '', b: '', x: '' };

if (!findings.length) {
  console.log(`${C.g}✓ brand-check${C.x} — ${files.length} files, no violations`);
  process.exit(0);
}

const byRule = findings.reduce((acc, f) => ((acc[f.rule] ??= []).push(f), acc), {});
console.log(`\n${C.r}${C.b}✗ brand-check — ${findings.length} violation${findings.length > 1 ? 's' : ''}${C.x}\n`);
for (const [rule, items] of Object.entries(byRule)) {
  console.log(`${C.y}${C.b}${rule}${C.x} ${C.d}(${items.length})${C.x}`);
  for (const f of items) {
    console.log(`  ${f.file}${f.line ? `:${f.line}` : ''} — ${f.msg}`);
    console.log(`    ${C.d}→ ${f.fix}${C.x}`);
  }
  console.log('');
}
console.log(`${C.d}Reference: brand/IDENTITY.md · brand/COLORS.md${C.x}`);
console.log(`${C.d}Deliberate exception? Append a // brand-check-ignore comment on that line.${C.x}\n`);
process.exit(1);
