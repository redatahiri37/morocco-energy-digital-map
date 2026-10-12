#!/usr/bin/env node
/* Renders the share cards written by build-solar-cities.mjs (--og-src) to
 * 1200×630 PNG files, the og:image of every page:
 *
 *   node scripts/render-og.mjs <cards dir> <out dir>
 *   (<cards dir>/<lang>/<name>.html  →  <out dir>/<lang>/<name>.png)
 *
 * Drives the Chrome or Chromium already on the machine (GitHub's Ubuntu
 * runners ship Google Chrome) through the DevTools protocol on a pipe, so
 * the build needs no npm package. The viewport is set to exactly 1200×630
 * (a plain `--screenshot` in new headless mode leaves the bottom of the
 * window blank). CHROME names the binary when it is not on the PATH.
 * Fails if a card does not come out as a 1200×630 PNG.
 */
import { spawn, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const W = 1200, H = 630;
const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: render-og.mjs <cards dir> <out dir>");
  process.exit(2);
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [name]).toString().trim(); } catch { /* next */ }
  }
  throw new Error("no Chrome or Chromium found: set CHROME to its path");
}

// Chrome reads DevTools commands on fd 3 and answers on fd 4, one JSON
// message per NUL-terminated chunk.
const chrome = findChrome();
const proc = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-pipe", "about:blank",
], { stdio: ["ignore", "ignore", "inherit", "pipe", "pipe"] });
const toChrome = proc.stdio[3], fromChrome = proc.stdio[4];
let seq = 0, buffer = "";
const pending = new Map(), waiters = [];
fromChrome.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let i;
  while ((i = buffer.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      const { ok, ko } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? ko(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      for (const w of [...waiters]) if (w.method === msg.method && w.sessionId === msg.sessionId) {
        waiters.splice(waiters.indexOf(w), 1);
        w.ok(msg.params);
      }
    }
  }
});
const send = (method, params = {}, sessionId) => new Promise((ok, ko) => {
  const id = ++seq;
  pending.set(id, { ok, ko });
  toChrome.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
});
const waitFor = (method, sessionId) => new Promise((ok) => waiters.push({ method, sessionId, ok }));

function pngSize(b) {
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const jobs = [];
for (const lang of readdirSync(src)) {
  for (const f of readdirSync(join(src, lang)).filter(f => f.endsWith(".html"))) {
    mkdirSync(join(out, lang), { recursive: true });
    jobs.push({ html: resolve(src, lang, f), png: resolve(out, lang, f.replace(/\.html$/, ".png")) });
  }
}

let failed = 0;
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, s);
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, s);
  for (const { html, png } of jobs) {
    try {
      const loaded = waitFor("Page.loadEventFired", s);
      await send("Page.navigate", { url: pathToFileURL(html).href }, s);
      await loaded;
      // The self-hosted fonts must be in before the picture is taken.
      await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true }, s);
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }, s);
      const bytes = Buffer.from(data, "base64");
      const size = pngSize(bytes);
      if (!size || size.w !== W || size.h !== H) throw new Error(`expected ${W}×${H}, got ${size ? `${size.w}×${size.h}` : "no PNG"}`);
      writeFileSync(png, bytes);
    } catch (e) {
      failed++;
      console.error(`${png}: ${e.message}`);
    }
  }
} catch (e) {
  failed = jobs.length;
  console.error(`Chrome (${chrome}): ${e.message}`);
} finally {
  proc.kill();
}
console.log(`rendered ${jobs.length - failed}/${jobs.length} share images with ${chrome}`);
process.exit(failed ? 1 : 0);
