#!/usr/bin/env node
// Daily updater: fetch postings -> filter -> merge with saved state -> regenerate README.
//
//   node scripts/update.mjs            # update data/listings.json and README.md
//   node scripts/update.mjs --dry-run  # fetch and report, write nothing

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchCompany } from './sources.mjs';
import { classifyLevel, classifyCategory, fitsLocation, displayLocations } from './classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const DATA_PATH = path.join(ROOT, 'data', 'listings.json');
const README_PATH = path.join(ROOT, 'README.md');
const START = '<!-- LISTINGS:START -->';
const END = '<!-- LISTINGS:END -->';
const CONCURRENCY = 8;
const DAY_MS = 86_400_000;

const LEVELS = [
  { key: 'intern', title: 'Internships', emoji: '🎓' },
  { key: 'newgrad', title: 'New Grad & Entry Level', emoji: '🚀' },
];
const CATEGORIES = [
  { key: 'swe', title: 'Software Engineering' },
  { key: 'data', title: 'Data Science, ML & AI' },
  { key: 'product', title: 'Product & Design' },
];

const dryRun = process.argv.includes('--dry-run');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function keyOf(company, id) {
  return `${company.ats}:${company.slug}:${id}`;
}

async function main() {
  const config = await readJson(CONFIG_PATH);
  const settings = config.settings ?? {};
  const excludes = (settings.excludeTitlePatterns ?? []).map((p) => new RegExp(p, 'i'));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const saved = await readJson(DATA_PATH, { listings: [] });
  const previous = new Map(saved.listings.map((l) => [l.key, l]));

  // 1. Fetch every company's board.
  const results = await mapLimit(config.companies, CONCURRENCY, async (company) => {
    try {
      return { company, postings: await fetchCompany(company) };
    } catch (err) {
      return { company, error: err.message };
    }
  });

  const failed = results.filter((r) => r.error);
  for (const f of failed) console.warn(`! ${f.company.name} (${f.company.ats}/${f.company.slug}): ${f.error}`);
  if (failed.length > config.companies.length / 2) {
    throw new Error(`${failed.length}/${config.companies.length} boards failed; refusing to overwrite the list.`);
  }

  // 2. Filter to matching roles and merge with what we had before.
  const next = new Map();
  for (const { company, postings, error } of results) {
    if (error) {
      // Board unreachable today: keep its existing listings rather than dropping them as "closed".
      for (const l of previous.values()) {
        if (l.ats === company.ats && l.slug === company.slug) next.set(l.key, l);
      }
      continue;
    }
    for (const p of postings) {
      const title = p.title.replace(/\s+/g, ' ').trim();
      if (!title || !p.url) continue;
      if (excludes.some((re) => re.test(title))) continue;
      const level = classifyLevel(title);
      if (!level) continue;
      const category = classifyCategory(title);
      if (!category) continue;
      if (!fitsLocation(p, settings.locations)) continue;

      const key = keyOf(company, p.id);
      const prev = previous.get(key);
      next.set(key, {
        key,
        ats: company.ats,
        slug: company.slug,
        company: company.name,
        title,
        level,
        category,
        locations: displayLocations(p.locations),
        url: p.url,
        firstSeen: prev?.firstSeen ?? today,
        posted: (p.postedAt ?? prev?.posted ?? today).slice(0, 10),
      });
    }
  }

  // 3. Drop postings that are too old. Anything no longer on a reachable board is already gone (closed).
  const maxAge = settings.maxAgeDays ?? 120;
  for (const [key, l] of next) {
    if ((now - new Date(l.posted)) / DAY_MS > maxAge) next.delete(key);
  }
  const removed = [...previous.keys()].filter((k) => !next.has(k)).length;
  const added = [...next.keys()].filter((k) => !previous.has(k)).length;

  const listings = [...next.values()].sort(
    (a, b) => b.posted.localeCompare(a.posted) || a.company.localeCompare(b.company) || a.key.localeCompare(b.key),
  );

  console.log(
    `Boards: ${results.length - failed.length}/${results.length} ok · listings: ${listings.length} (+${added} new, -${removed} closed/expired)`,
  );
  for (const lv of LEVELS) {
    const counts = CATEGORIES.map((c) => `${c.key}=${listings.filter((l) => l.level === lv.key && l.category === c.key).length}`);
    console.log(`  ${lv.key}: ${counts.join(' ')}`);
  }
  if (dryRun) return;

  await writeFile(DATA_PATH, JSON.stringify({ listings }, null, 2) + '\n');

  const readme = await readFile(README_PATH, 'utf8');
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error(`README.md must contain ${START} and ${END}`);
  const block = render(listings, { now, newBadgeDays: settings.newBadgeDays ?? 3, companyCount: config.companies.length });
  await writeFile(README_PATH, readme.slice(0, s + START.length) + '\n' + block + '\n' + readme.slice(e));
}

// ---------- Rendering ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');

// Same role posted once per city -> one row with all locations.
function mergeRows(items) {
  const groups = new Map();
  for (const l of items) {
    const k = `${l.company}|${l.title.toLowerCase()}`;
    const g = groups.get(k);
    if (!g) {
      groups.set(k, { ...l, locations: [...l.locations] });
    } else {
      for (const loc of l.locations) if (!g.locations.includes(loc)) g.locations.push(loc);
      if (l.posted > g.posted) Object.assign(g, { posted: l.posted, url: l.url });
    }
  }
  return [...groups.values()].sort((a, b) => b.posted.localeCompare(a.posted) || a.company.localeCompare(b.company));
}

function formatLocations(locs) {
  if (locs.length === 0) return '—';
  const shown = locs.slice(0, 3).map(cell);
  if (locs.length > 3) shown.push(`+${locs.length - 3} more`);
  return shown.join('<br>');
}

function render(listings, { now, newBadgeDays, companyCount }) {
  const out = [];
  const sections = [];
  for (const lv of LEVELS) {
    for (const cat of CATEGORIES) {
      const rows = mergeRows(listings.filter((l) => l.level === lv.key && l.category === cat.key));
      sections.push({ lv, cat, rows, heading: `${lv.title}: ${cat.title}` });
    }
  }
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const companies = new Set(listings.map((l) => l.company)).size;
  const updated = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  out.push(`**${total}** open roles at **${companies}** companies (tracking ${companyCount}) · last updated **${updated}**`, '');
  out.push('| | Software Engineering | Data, ML & AI | Product & Design |', '|---|---|---|---|');
  for (const lv of LEVELS) {
    const links = CATEGORIES.map((cat) => {
      const s = sections.find((x) => x.lv === lv && x.cat === cat);
      return `[${s.rows.length} roles](#${anchor(s.heading)})`;
    });
    out.push(`| ${lv.emoji} **${lv.title}** | ${links.join(' | ')} |`);
  }
  out.push('');

  for (const s of sections) {
    out.push(`## ${s.heading}`, '');
    if (s.rows.length === 0) {
      out.push('_No open roles right now. Check back tomorrow._', '');
      continue;
    }
    out.push('| Company | Role | Location | Apply | Posted |', '|---|---|---|:---:|---|');
    for (const r of s.rows) {
      const isNew = (now - new Date(r.posted)) / DAY_MS <= newBadgeDays;
      out.push(
        `| **${cell(r.company)}** | ${cell(r.title)}${isNew ? ' 🆕' : ''} | ${formatLocations(r.locations)} | [Apply](${r.url}) | ${fmtDate(r.posted)} |`,
      );
    }
    out.push('', '[⬆ Back to top](#tech-internships--new-grad-roles-2027)', '');
  }
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
