#!/usr/bin/env node
/* Tells IndexNow search engines (Bing, Yandex, Seznam, Naver…) that the
 * pages of solar.wattu.org changed, right after a deploy, instead of
 * waiting for their next crawl. Bing feeds ChatGPT Search and Copilot.
 *
 *   node scripts/indexnow-ping.mjs _site
 *
 * The key is public by design (solar/indexnow-key.txt): build-solar-cities
 * serves it at /<key>.txt, which proves we own the host. Waits for that file
 * to be live, then submits every URL of <out>/sitemap.xml. Never fails the
 * deploy: IndexNow being down only delays discovery.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "solar.wattu.org";
const out = process.argv[2];
const key = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../solar/indexnow-key.txt"), "utf8").trim();
const keyLocation = `https://${HOST}/${key}.txt`;
const urlList = [...readFileSync(join(out, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

async function main() {
  // The new deploy can take a few seconds to reach the edge.
  for (let i = 0; ; i++) {
    const res = await fetch(keyLocation, { cache: "no-store" }).catch(() => null);
    if (res?.ok && (await res.text()).trim() === key) break;
    if (i === 12) { console.log(`IndexNow: ${keyLocation} not live, skipped`); return; }
    await new Promise(r => setTimeout(r, 5000));
  }
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
  });
  // 200 and 202 both mean accepted; anything else is logged, not fatal.
  console.log(`IndexNow: ${urlList.length} URLs submitted, HTTP ${res.status} ${await res.text()}`);
}
main().catch(e => console.log(`IndexNow: ${e.message}`));
