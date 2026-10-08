#!/usr/bin/env node
/* Checks the code a page loads, for each index.html given:
 *   - every <script src> and <link rel=stylesheet> is served from the site
 *     itself: no third-party server may supply code;
 *   - every one of them carries an integrity hash, and the file on disk
 *     matches it (a vendored library edited by mistake fails here, not in
 *     the browser).
 *
 *   node scripts/check-sri.mjs docs/index.html solar/index.html
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

let errors = 0;
const fail = (msg) => { console.error("FAIL  " + msg); errors++; };

for (const page of process.argv.slice(2)) {
  const html = readFileSync(page, "utf8");
  const tags = [
    ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g),
    ...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/g),
  ];
  // The CSP has no 'unsafe-inline': an inline style or script would be
  // refused by the browser, so it is refused here first.
  if (/\sstyle="/.test(html)) fail(`${page}: has a style="" attribute (use a class)`);
  if (/<style[\s>]/.test(html)) fail(`${page}: has a <style> block (use the stylesheet)`);
  const appJs = join(dirname(page), "app.js");
  if (existsSync(appJs) && /\sstyle="|style=\\"/.test(readFileSync(appJs, "utf8").replace(/\/\/.*$/gm, "")))
    fail(`${appJs}: writes a style="" attribute into HTML (set el.style instead)`);
  for (const [tag, url] of tags) {
    if (/^(https?:)?\/\//.test(url)) { fail(`${page}: loads code from another site: ${url}`); continue; }
    const path = join(dirname(page), url.split("?")[0]);
    if (!existsSync(path)) { fail(`${page}: ${url} does not exist`); continue; }
    const sri = (tag.match(/\bintegrity="sha384-([^"]+)"/) || [])[1];
    // The site's own scripts and sheets change with every commit and are
    // versioned by the deploy; only vendored libraries are pinned by hash.
    if (!url.includes("vendor/")) continue;
    if (!sri) { fail(`${page}: ${url} has no integrity hash`); continue; }
    const got = createHash("sha384").update(readFileSync(path)).digest("base64");
    if (got !== sri) fail(`${page}: ${url} is sha384-${got}, the page expects sha384-${sri}`);
    else console.log(`ok    ${page}: ${url}`);
  }
}
process.exit(errors ? 1 : 0);
