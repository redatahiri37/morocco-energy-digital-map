/* Chat tests — no network, no account: `node chat.test.mjs` from this
 * directory. The real Worker runs with a fake Workers AI binding and a
 * stubbed PVGIS, so what Wattu reads in a question, the figures it computes
 * (against the engine itself), the prompt the model gets, the fallbacks and
 * the stream the page reads are all checked.
 */
import worker from "./worker.js";
import { extract, replyText, oneeBill, parseConversation, sameKey, SYSTEM, DEFAULT_MODEL } from "./chat.js";
import engine from "../engine.js";

const { CONFIG, PV, Tariff, ROI, Sizing } = engine;
let fail = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra ? "  " + extra : "")); if (!cond) fail++; };

// ── Stubs ──────────────────────────────────────────────────────────────
const KEY = "test-access-key-0123456789";
const ORIGIN = "https://solar.wattu.org";
const MONTHLY = [102, 110, 140, 152, 165, 168, 176, 172, 150, 132, 104, 96];
const pvgisJson = { outputs: { totals: { fixed: { E_y: MONTHLY.reduce((a, b) => a + b, 0), "H(i)_y": 2150 } },
  monthly: { fixed: MONTHLY.map((E_m, i) => ({ month: i + 1, E_m })) } } };

// Workers AI: each run() takes the next scripted answer (a value, or an Error to throw).
let script = [], aiCalls = [];
const AI = {
  async run(model, input) {
    aiCalls.push({ model, input });
    const next = script.length ? script.shift() : { response: "OK" };
    if (next instanceof Error) throw next;
    return next;
  },
};
const ENV = { AI, CHAT_ACCESS_KEY: KEY };

let jrcCalls = [], jrcDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  if (url.startsWith("https://re.jrc.ec.europa.eu/")) {
    jrcCalls.push(url);
    if (jrcDown) throw new Error("timeout");
    return new Response(JSON.stringify(pvgisJson), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error("unexpected fetch " + url);
};

const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
let ipSeq = 0;
function chat(body, { origin = ORIGIN, method = "POST", env = ENV, ip } = {}) {
  return worker.fetch(new Request("https://w.dev/chat", {
    method,
    headers: { Origin: origin, "content-type": "text/plain", "CF-Connecting-IP": ip || `10.0.0.${++ipSeq}` },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  }), env, ctx);
}
const ask = (text, extra = {}) => ({ key: KEY, lang: "fr", messages: [{ role: "user", content: text }], ...extra });
async function events(res) {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const figuresOf = (call) => {
  const m = call.input.messages[0].content.match(/WATTU FIGURES \(computed by Wattu's engine for this question\):\n(\{.*\})/);
  return m ? JSON.parse(m[1]) : null;
};

// ── 1. Who may call ────────────────────────────────────────────────────
let r = await chat(ask("Bonjour"), { env: {} });
ok("no AI binding, no key → 503", r.status === 503, "got " + r.status);
r = await chat(ask("Bonjour"), { env: { AI } });
ok("no access key configured → 503", r.status === 503, "got " + r.status);
r = await chat(ask("Bonjour"), { env: { CHAT_ACCESS_KEY: KEY } });
ok("no AI binding → 503", r.status === 503, "got " + r.status);
r = await chat(ask("Bonjour"), { origin: "https://evil.example" });
ok("foreign origin → 403", r.status === 403, "got " + r.status);
r = await chat(null, { method: "GET" });
ok("GET → 405", r.status === 405, "got " + r.status);
r = await chat({ ...ask("Bonjour"), key: "wrong" });
ok("wrong key → 401", r.status === 401, "got " + r.status);
r = await chat({ ...ask("Bonjour"), key: undefined });
ok("missing key → 401", r.status === 401, "got " + r.status);
r = await chat("not json");
ok("garbage body → 413", r.status === 413, "got " + r.status);
r = await chat("x".repeat(30000));
ok("oversized body → 413", r.status === 413, "got " + r.status);
r = await chat({ key: KEY, lang: "fr", messages: [{ role: "assistant", content: "Salut" }] });
ok("assistant first → 400", r.status === 400, "got " + r.status);
r = await chat({ key: KEY, lang: "fr", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] });
ok("ends on assistant → 400", r.status === 400, "got " + r.status);
r = await chat(ask("x".repeat(1600)));
ok("user message too long → 413", r.status === 413, "got " + r.status);
r = await chat({ key: KEY, lang: "fr", messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" })) });
ok("more than 20 messages → 413", r.status === 413, "got " + r.status);
ok("nothing reached the model so far", aiCalls.length === 0, "calls " + aiCalls.length);
ok("CORS header on refusals", r.headers.get("access-control-allow-origin") === ORIGIN);

// Rate limit: the per-isolate fallback (no CHAT_LIMITER binding in tests).
let codes = [];
for (let i = 0; i < 11; i++) codes.push((await chat({ ...ask("x"), key: "wrong" }, { ip: "10.9.9.9" })).status);
ok("11th message in a minute → 429", codes[10] === 429 && codes.slice(0, 10).every((c) => c === 401), codes.join(","));
r = await chat({ ...ask("x"), key: "wrong" }, { ip: "10.9.9.9", env: { ...ENV, CHAT_LIMITER: { limit: async () => ({ success: true }) } } });
ok("CHAT_LIMITER binding used when present", r.status === 401, "got " + r.status);

// ── 2. An estimate, end to end ─────────────────────────────────────────
script = [{ response: "Pour 500 MAD par mois à Fès, Wattu recommande 2,5 kWc." }];
aiCalls = []; jrcCalls = [];
r = await chat(ask("Je suis à Fès, ma facture est de 500 DH. Ça vaut le coup ?"));
ok("answer → 200 NDJSON, not cached", r.status === 200 && r.headers.get("content-type").startsWith("application/x-ndjson") && r.headers.get("cache-control") === "no-store");
let ev = await events(r);
ok("events: tool, estimate, text, done", ev.map((e) => e.t).join(",") === "tool,estimate,text,done", ev.map((e) => e.t).join(","));
ok("done carries the model's reply", ev[3].text === "Pour 500 MAD par mois à Fès, Wattu recommande 2,5 kWc.", JSON.stringify(ev[3].text));
ok("one model call, default model", aiCalls.length === 1 && aiCalls[0].model === DEFAULT_MODEL, aiCalls.map((c) => c.model).join());
const input = aiCalls[0].input;
ok("system prompt, then the conversation as written", input.messages[0].role === "system" && input.messages[0].content.startsWith(SYSTEM) && input.messages[1].content === "Je suis à Fès, ma facture est de 500 DH. Ça vaut le coup ?");
ok("short reply, low temperature", input.max_tokens === 700 && input.temperature === 0.3);
ok("French page told to the model", /French page/.test(input.messages[0].content));

// The figures are the engine's (what the simulator shows).
const f = figuresOf(aiCalls[0]);
const perKw = { yieldPerKw: pvgisJson.outputs.totals.fixed.E_y, monthlyPerKw: MONTHLY, radiationAnnual: 2150 };
const cons = Tariff.kwhFromBill(500);
const kwc = Sizing.autoKw(cons, perKw.yieldPerKw);
const pv = PV.scale(perKw, kwc);
const capex = kwc * 1000 * CONFIG.DEFAULT_COST_MAD_PER_WC;
const roi = ROI.compute({ pv, monthlyConsumption: cons, capexMAD: capex, exportAllowed: false });
ok("figures block in the prompt", !!f, input.messages[0].content.slice(-300));
ok("place in the page language", f.place === "Fès", f.place);
ok("size = the simulator's", f.system_kwc === kwc && f.panels === Sizing.panels(kwc), `${f.system_kwc} kWc, ${f.panels} panels`);
ok("investment = the simulator's", f.investment_mad === Math.round(capex), String(f.investment_mad));
ok("savings = the simulator's", f.savings_mad_year1 === Math.round(roi.annualSavingsMAD), String(f.savings_mad_year1));
ok("payback = the simulator's", f.payback_years === Math.round(roi.paybackYr * 10) / 10, String(f.payback_years));
ok("25-year gain = the simulator's", f.net_gain_25_years_mad === Math.round(roi.lifetimeSavingsMAD - capex), String(f.net_gain_25_years_mad));
ok("PVGIS named as the source", /^PVGIS/.test(f.production_source), f.production_source);
const card = ev[1];
ok("card = the same figures", card.kwc === kwc && card.investment === f.investment_mad && card.savings === f.savings_mad_year1 && card.payback === f.payback_years && card.approximate === false, JSON.stringify(card));
ok("card links the simulator with the figures", card.url.startsWith("https://solar.wattu.org/#lat=34.03310&lon=-5.00030&f=500&a=30&o=0&c=11&n=F%C3%A8s"), card.url);
ok("PVGIS asked once, at 1 kWc, south 30°, Fès", jrcCalls.length === 1 && /angle=30&aspect=0&lat=34\.0331&lon=-5\.0003&loss=14&mountingplace=building&outputformat=json&peakpower=1$/.test(jrcCalls[0]), jrcCalls[0]);

// ── 3. Darija on the Arabic page, PVGIS down, OpenAI-shaped answer ─────
script = [{ choices: [{ message: { role: "assistant", content: "<think>hmm</think>بفاتورة ديال 600 درهم فكازا…" } }] }];
aiCalls = []; jrcDown = true;
ev = await events(await chat(ask("الفاتورة ديالي ٦٠٠ درهم فكازا، شحال خاصني من بلاكة؟", { lang: "ar" })));
jrcDown = false;
const fa = figuresOf(aiCalls[0]);
ok("Arabic page told to the model", /Moroccan Arabic page/.test(aiCalls[0].input.messages[0].content));
ok("Darija read: Casablanca, 600 MAD (Arabic digits)", fa && fa.place === "الدار البيضاء" && fa.monthly_bill_mad === 600, JSON.stringify(fa && [fa.place, fa.monthly_bill_mad]));
ok("PVGIS down → approximate, said so", /^approximate/.test(fa.production_source) && ev[1].approximate === true, fa.production_source);
ok("Arabic simulator link", ev[1].url.startsWith("https://solar.wattu.org/ar/#"), ev[1].url);
ok("OpenAI-shaped reply read, reasoning dropped", ev[ev.length - 1].text === "بفاتورة ديال 600 درهم فكازا…", JSON.stringify(ev[ev.length - 1]));

// ── 4. Something missing: the model asks, nothing is computed ───────────
script = [{ response: "Dans quelle ville habitez-vous ?" }];
aiCalls = []; jrcCalls = [];
ev = await events(await chat(ask("Ma facture est de 450 DH, ça vaut le coup ?")));
const sys4 = aiCalls[0].input.messages[0].content;
ok("no city → no estimate, no PVGIS call", ev.map((e) => e.t).join(",") === "text,done" && jrcCalls.length === 0, ev.map((e) => e.t).join(","));
ok("model told what is missing and the bill's kWh", /no estimate yet/.test(sys4) && /Missing for an estimate: the city\./.test(sys4) && /"monthly_kwh":\d+/.test(sys4), sys4.slice(-260));

script = [{ response: "Quelle est votre facture ?" }];
aiCalls = [];
ev = await events(await chat(ask("Le solaire est-il rentable à Oujda ?")));
ok("no bill → model told to ask for it", /Known: city: Oujda\. Missing for an estimate: the monthly electricity bill/.test(aiCalls[0].input.messages[0].content));

// Multi-turn: the city first, the bill two messages later.
script = [{ response: "Voilà." }];
aiCalls = [];
ev = await events(await chat({ key: KEY, lang: "fr", messages: [
  { role: "user", content: "Bonjour, j'habite à Oujda" },
  { role: "assistant", content: "Quelle est votre facture ?" },
  { role: "user", content: "environ 350 dh" },
] }));
ok("city and bill from different messages → estimate", ev[1]?.t === "estimate" && ev[1].place === "Oujda" && figuresOf(aiCalls[0])?.monthly_bill_mad === 350, JSON.stringify(ev[1]));
ok("the whole conversation goes to the model", aiCalls[0].input.messages.length === 4);

// ── 5. The free allowance runs out ─────────────────────────────────────
script = [new Error("AiError: 4006: you have used up your daily free allocation of 10,000 neurons")];
ev = await events(await chat(ask("Facture 800 dh à Agadir")));
const fixedFr = ev.find((e) => e.t === "done")?.text || "";
ok("model out → estimate still answered (fixed French sentence)", ev[1]?.t === "estimate" && fixedFr.startsWith("Voici l'estimation de Wattu pour Agadir") && fixedFr.includes(`${ev[1].kwc} kWc`), fixedFr);
script = [new Error("quota")];
ev = await events(await chat(ask("كنخلص 500 درهم فمراكش")));
const fixedAr = ev.find((e) => e.t === "done")?.text || "";
ok("…in Darija when asked in Arabic script", fixedAr.startsWith("هادا التقدير ديال Wattu لـمراكش") && /سنين|عام/.test(fixedAr), fixedAr);
script = [new Error("quota")];
ev = await events(await chat(ask("My bill is 600 MAD in Rabat", { lang: "en" })));
ok("…in English on the English page", (ev.find((e) => e.t === "done")?.text || "").startsWith("Here is Wattu's estimate for Rabat"));
script = [new Error("quota")];
ev = await events(await chat(ask("Comment choisir un installateur ?")));
ok("model out, nothing to compute → error busy", ev.length === 1 && ev[0].t === "error" && ev[0].code === "busy", JSON.stringify(ev));
script = [{ response: "" }];
ev = await events(await chat(ask("Bonjour")));
ok("empty reply → error busy", ev.length === 1 && ev[0].code === "busy", JSON.stringify(ev));

// Another model by configuration.
script = [{ response: "OK" }];
aiCalls = [];
await events(await chat(ask("Bonjour"), { env: { ...ENV, CHAT_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8" } }));
ok("CHAT_MODEL picks the model", aiCalls[0].model === "@cf/qwen/qwen3-30b-a3b-fp8");

await Promise.all(waits);

// ── 6. Reading questions ───────────────────────────────────────────────
const read = (s) => { const x = extract([{ role: "user", content: s }]); return [x.city?.slug ?? "-", x.bill ?? "-", x.kwh ?? "-"].join("|"); };
for (const [q, want] of [
  ["Ma facture est de 600 DH à Casablanca, ça vaut le coup ?", "casablanca|600|-"],
  ["je paie 1 200 dirhams par mois à Fès", "fes|1200|-"],
  ["My bill is 450 MAD in Marrakesh", "marrakech|450|-"],
  ["I use 300 kWh a month in Tangier", "tanger|-|300"],
  ["الفاتورة ديالي 600 درهم فكازا", "casablanca|600|-"],
  ["كنخلص ٤٥٠ درهم فالرباط", "rabat|450|-"],
  ["واش كتسوا فمراكش إلا كنخلص 400 درهم فالشهر؟", "marrakech|400|-"],
  ["ana f el jadida w kankhless 800dh", "el-jadida|800|-"],
  ["Dakhla 1.500 dh", "dakhla|1500|-"],
  ["la loi 82-21 en 2026 à Agadir", "agadir|-|-"],
  ["c'est sale, facture 500", "-|500|-"],
  ["Salé, facture de 700dh", "sale|700|-"],
  ["Comment choisir un installateur ?", "-|-|-"],
  ["facture de 5 dh", "-|-|-"],
]) ok(`reads « ${q} »`, read(q) === want, read(q));

// ── 7. Pieces ──────────────────────────────────────────────────────────
ok("replyText: { response }", replyText({ response: " a " }) === "a");
ok("replyText: string, empty, unknown", replyText("b") === "b" && replyText(null) === "" && replyText({ x: 1 }) === "");
const o = oneeBill({ bill: 500 });
ok("ONEE: 500 MAD ↔ kWh like the simulator", o.monthly_kwh === Math.round(Tariff.kwhFromBill(500)) && o.price_of_last_kwh_mad === 1.3817, JSON.stringify(o));
ok("billFromKwh inverts kwhFromBill", [100, 250, 500, 900, 2400].every((b) => Math.abs(Tariff.billFromKwh(Tariff.kwhFromBill(b)) - b) < 1e-6));
ok("sameKey", sameKey(KEY, KEY) && !sameKey(KEY + "x", KEY) && !sameKey("", "") && !sameKey(undefined, KEY));
ok("parseConversation keeps the page language, defaults to fr", parseConversation({ lang: "en", messages: [{ role: "user", content: " hi " }] }).lang === "en" && parseConversation({ lang: "xx", messages: [{ role: "user", content: "hi" }] }).lang === "fr");
ok("system prompt has the tariff and the law from CONFIG", SYSTEM.includes(String(CONFIG.ONEE_TRANCHES[0][1])) && SYSTEM.includes(`${Math.round(CONFIG.EXPORT_CAP_PCT * 100)}%`));
ok("system prompt forbids figures of its own", /the only numbers you may write are those in the WATTU FIGURES block/.test(SYSTEM));

globalThis.fetch = realFetch;
console.log(fail ? `\n${fail} FAILED` : "\nall green");
process.exit(fail ? 1 : 0);
