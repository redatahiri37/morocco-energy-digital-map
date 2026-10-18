#!/usr/bin/env node
/* Builds the French map page from the English one:
 *   <site>/fr/index.html   French, at energy.wattu.org/fr/
 *
 * docs/index.html stays the only page to edit. Each English string listed in
 * scripts/map-i18n-fr.mjs is swapped for its French; the texts app.js writes
 * come from its own T table, picked by <html lang>. Paths to the site's own
 * files gain a "../". The build stops when a listed English string is no
 * longer in the page (the table must follow the page) or when English is
 * left in the French page (a new string was added without its translation).
 *
 *   node scripts/build-map-i18n.mjs docs        # the deploy, and CI
 *   node scripts/build-map-i18n.mjs /tmp/site   # anywhere else
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS } from "./map-i18n-fr.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://energy.wattu.org/";
const out = process.argv[2];
if (!out) { console.error("usage: build-map-i18n.mjs <siteDir>"); process.exit(2); }

const src = readFileSync(join(ROOT, "docs/index.html"), "utf8");
const errors = [];

const missing = PAIRS.filter(([en]) => !src.includes(en));
for (const [en] of missing) errors.push(`not in docs/index.html (update scripts/map-i18n-fr.mjs): ${en.slice(0, 100)}`);

let html = src;
for (const [en, fr] of PAIRS) html = html.split(en).join(fr);

// The page's own language and address; the alternate links name both.
const swaps = [
  ['<html lang="en">', '<html lang="fr">'],
  [`<meta property="og:url" content="${SITE}">`, `<meta property="og:url" content="${SITE}fr/">`],
  [`<link rel="canonical" href="${SITE}">`, `<link rel="canonical" href="${SITE}fr/">`],
  [/<!-- The French page, fr\/index\.html, is built from this one at deploy\s+\(scripts\/build-map-i18n\.mjs\): edit this file only\. -->/,
   "<!-- Built from ../index.html by scripts/build-map-i18n.mjs: edit that file, not this one. -->"],
];
for (const [from, to] of swaps) {
  const before = html;
  html = html.replace(from, to);
  if (html === before) errors.push(`expected to find ${String(from).slice(0, 80)}`);
}
// The site's own files sit one folder up. "./" alone is this page's home.
html = html.replace(/\b(href|src)="\.\/([^"]+)"/g, '$1="../$2"');

// English left in the French page: a visible text or a labelling attribute
// that is still exactly as in the English page, once proper names, code and
// the hreflang links are set aside.
const KEEP = new Set(["wattu", "Energy × Digital", "GitHub", "Reda Tahiri", "OpenInfraMap", "OpenFreeMap",
  "OpenStreetMap", "DATA_SOURCES.md", "ASSUMPTIONS.md", "tiles.openfreemap.org", "openinframap.org",
  "source", "source_url", "precision", "/docs/data/morocco/", "enersite.app", "website",
  "width=device-width,initial-scale=1.0",
  ") via MapLibre."]);   // the same words in French
function texts(page) {
  const body = page
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<link rel="alternate"[^>]*>/g, "");
  return [
    ...[...body.matchAll(/>([^<]+)</g)].map((m) => m[1].trim()),
    ...[...body.matchAll(/\b(?:aria-label|title|placeholder|content|alt)="([^"]*)"/g)].map((m) => m[1].trim()),
  ].filter((t) => /[A-Za-z]{3,}/.test(t) && !KEEP.has(t) && !/^https?:\/\//.test(t));
}
const english = new Set(texts(src));
for (const t of new Set(texts(html))) if (english.has(t)) errors.push(`left in English: ${t.slice(0, 100)}`);

if (errors.length) {
  for (const e of errors) console.error("FAIL  " + e);
  process.exit(1);
}
mkdirSync(join(out, "fr"), { recursive: true });
writeFileSync(join(out, "fr/index.html"), html);
console.log(`ok    ${join(out, "fr/index.html")}: ${PAIRS.length} strings in French`);
