#!/usr/bin/env node
/* Builds the Arabic and English simulator pages from the French one:
 *   <out>/ar/index.html   Moroccan Arabic, right to left
 *   <out>/en/index.html   English
 *
 * solar/index.html stays the only page to edit. Each French string listed
 * in solar/i18n/simulator.mjs is swapped for its translation; the texts
 * that app.js writes come from its own I18N table, picked by <html lang>.
 * The build stops when a listed French string is no longer in the page
 * (the table must follow the page) or when French is left in a translated
 * page (a new string was added without its translation).
 *
 *   node scripts/build-solar-i18n.mjs _site [--version abc123]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS } from "../solar/i18n/simulator.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://solar.wattu.org";
const args = process.argv.slice(2);
const out = args.find(a => !a.startsWith("--"));
const vIdx = args.indexOf("--version");
const version = vIdx >= 0 ? args[vIdx + 1] : "";
if (!out) {
  console.error("usage: build-solar-i18n.mjs <outDir> [--version V]");
  process.exit(2);
}

const src = readFileSync(join(ROOT, "solar/index.html"), "utf8");
const missing = PAIRS.filter(([fr]) => !src.includes(fr)).map(([fr]) => fr);
if (missing.length) {
  console.error("French strings not found in solar/index.html (update solar/i18n/simulator.mjs):");
  for (const m of missing) console.error("  - " + m.slice(0, 100));
  process.exit(1);
}

// French left over in a translated page: accented letters or common words,
// in visible text and attributes, once scripts and the hreflang/language
// links (which name "Français" on purpose) are set aside.
const FRENCH = /[éèêàâçôûùîï]|\b(?:votre|vous|des|les|une|pour|avec|sur|dans|par|est)\b/i;
function leftoverFrench(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<link rel="alternate"[^>]*>/g, "")
    .replace(/<a class="nav-lang"[^>]*>[^<]*<\/a>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const texts = [...body.matchAll(/>([^<]+)</g)].map(m => m[1])
    .concat([...body.matchAll(/\b(?:aria-label|placeholder|content|alt|title)="([^"]*)"/g)].map(m => m[1]));
  // Proper names that keep their accents in every language.
  const allowed = /Rue Ibnou Sina|Ouarzazate|Earthstar/;
  return texts.filter(t => FRENCH.test(t.replace(allowed, ""))).map(t => t.trim().slice(0, 90));
}

let failed = false;
for (const [lang, col] of [["ar", 1], ["en", 2]]) {
  let html = src.replace('<html lang="fr">', lang === "ar" ? '<html lang="ar" dir="rtl">' : '<html lang="en">');
  // This page's own address (canonical, og:url, JSON-LD); hreflang lines
  // already name all three versions.
  html = html.split("\n").map(l => l.includes("hreflang=")
    ? l : l.replaceAll(`"${SITE}/"`, `"${SITE}/${lang}/"`)).join("\n");
  for (const pair of PAIRS) html = html.split(pair[0]).join(pair[col]);
  // Files the page loads sit one level up; links to villes/, cities/ and
  // guide/ stay relative, since /ar/ and /en/ have their own.
  html = html.replace(/\b(href|src)="(?!https?:|#|\/|\.\/|villes\/|cities\/|guide\/)([^"]+)"/g, '$1="../$2"');
  if (version) {
    html = html.replace(/((?:href|src)="\.\.\/(?:style\.css|brand\.css|app\.js|analytics\.js))"/g, `$1?v=${encodeURIComponent(version)}"`);
  }
  const left = leftoverFrench(html);
  if (left.length) {
    failed = true;
    console.error(`French left in /${lang}/ (add it to solar/i18n/simulator.mjs):`);
    for (const t of left) console.error("  - " + t);
  }
  mkdirSync(join(out, lang), { recursive: true });
  writeFileSync(join(out, lang, "index.html"), html);
  console.log(`wrote ${lang}/index.html`);
}
process.exit(failed ? 1 : 0);
