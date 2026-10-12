/* Chat tests — no network, no API key: `node chat.test.mjs` from this
 * directory, after `npm ci`. The real Worker and the real Anthropic SDK run
 * against a stubbed fetch that plays the Claude API's event stream and
 * PVGIS's JSON, so the request Wattu sends, the tool round trip, the
 * figures and the stream the page reads are all checked.
 */
import worker from "./worker.js";
import { echoable, parseConversation, sameKey, runTool, SYSTEM, TOOLS } from "./chat.js";
import engine from "../engine.js";

const { CONFIG, PV, Tariff, ROI, Sizing } = engine;
let fail = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra ? "  " + extra : "")); if (!cond) fail++; };

// ── Stubs ──────────────────────────────────────────────────────────────
const KEY = "test-access-key-0123456789";
const ENV = { ANTHROPIC_API_KEY: "test-api-key", CHAT_ACCESS_KEY: KEY };
const ORIGIN = "https://solar.wattu.org";
const FES = { lat: 34.0331, lon: -5.0003 };     // solar/data/cities.json
const MONTHLY = [102, 110, 140, 152, 165, 168, 176, 172, 150, 132, 104, 96];
const pvgisJson = { outputs: { totals: { fixed: { E_y: MONTHLY.reduce((a, b) => a + b, 0), "H(i)_y": 2150 } },
  monthly: { fixed: MONTHLY.map((E_m, i) => ({ month: i + 1, E_m })) } } };

// One Claude response as the API streams it: blocks are
// { type: "thinking", signature } | { type: "text", text } | { type: "tool_use", id, name, input }.
function sse(blocks, stop = "end_turn", model = "claude-opus-5-5") {
  const ev = [];
  const push = (type, data) => ev.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  push("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model, content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  blocks.forEach((b, index) => {
    if (b.type === "thinking") {
      push("content_block_start", { index, content_block: { type: "thinking", thinking: "", signature: "" } });
      push("content_block_delta", { index, delta: { type: "signature_delta", signature: b.signature } });
    } else if (b.type === "text") {
      push("content_block_start", { index, content_block: { type: "text", text: "" } });
      for (const piece of b.text.match(/.{1,12}/gs)) push("content_block_delta", { index, delta: { type: "text_delta", text: piece } });
    } else if (b.type === "tool_use") {
      push("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      const json = b.raw ?? JSON.stringify(b.input);
      for (const piece of json.match(/.{1,10}/gs)) push("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: piece } });
    } else if (b.type === "fallback") {
      push("content_block_start", { index, content_block: { type: "fallback", from: { model }, to: { model: "claude-opus-5" } } });
    }
    push("content_block_stop", { index });
  });
  push("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 42 } });
  push("message_stop", {});
  return ev.join("");
}

let script = [];          // Claude responses still to play, in order
let apiCalls = [];        // { headers, body } of each Claude request
let jrcCalls = [];
let jrcDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  if (url.startsWith("https://api.anthropic.com/")) {
    apiCalls.push({ headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const next = script.shift();
    if (!next) return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "no script" } }), { status: 500, headers: { "content-type": "application/json" } });
    if (next.status) return new Response(JSON.stringify({ type: "error", error: { type: next.type, message: "x" } }), { status: next.status, headers: { "content-type": "application/json" } });
    return new Response(next, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
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

// ── 1. Who may call ────────────────────────────────────────────────────
let r = await chat(ask("Bonjour"), { env: {} });
ok("no secrets → 503", r.status === 503, "got " + r.status);
r = await chat(ask("Bonjour"), { env: { ANTHROPIC_API_KEY: "x" } });
ok("no access key configured → 503", r.status === 503, "got " + r.status);
r = await chat(ask("Bonjour"), { origin: "https://evil.example" });
ok("foreign origin → 403", r.status === 403, "got " + r.status);
r = await chat(null, { method: "GET" });
ok("GET → 405", r.status === 405, "got " + r.status);
r = await chat({ ...ask("Bonjour"), key: "wrong" });
ok("wrong key → 401", r.status === 401, "got " + r.status);
r = await chat({ ...ask("Bonjour"), key: undefined });
ok("missing key → 401", r.status === 401, "got " + r.status);
r = await chat("not json");
ok("garbage body → 413/400", r.status === 413 || r.status === 400, "got " + r.status);
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
ok("nothing reached the API so far", apiCalls.length === 0, "calls " + apiCalls.length);
ok("CORS header on refusals", r.headers.get("access-control-allow-origin") === ORIGIN);

// Rate limit: the per-isolate fallback (no CHAT_LIMITER binding in tests).
let codes = [];
for (let i = 0; i < 11; i++) codes.push((await chat({ ...ask("x"), key: "wrong" }, { ip: "10.9.9.9" })).status);
ok("11th message in a minute → 429", codes[10] === 429 && codes.slice(0, 10).every((c) => c === 401), codes.join(","));
r = await chat({ ...ask("x"), key: "wrong" }, { ip: "10.9.9.9", env: { ...ENV, CHAT_LIMITER: { limit: async () => ({ success: true }) } } });
ok("CHAT_LIMITER binding used when present", r.status === 401, "got " + r.status);

// ── 2. An estimate, end to end ─────────────────────────────────────────
script = [
  sse([{ type: "thinking", signature: "sig-1" },
       { type: "tool_use", id: "toolu_1", name: "estimate_solar", input: { city: "fès", monthly_bill_mad: 500 } }], "tool_use"),
  sse([{ type: "text", text: "Pour une facture de 500 MAD à Fès, Wattu recommande 2,5 kWc." }], "end_turn"),
];
apiCalls = []; jrcCalls = [];
r = await chat(ask("Je suis à Fès, ma facture est de 500 DH. Ça vaut le coup ?"));
ok("answer → 200 NDJSON", r.status === 200 && r.headers.get("content-type").startsWith("application/x-ndjson"), r.status + " " + r.headers.get("content-type"));
ok("answer is not cached", r.headers.get("cache-control") === "no-store");
let ev = await events(r);
const types = ev.map((e) => e.t);
ok("events: tool, estimate, text…, done", types[0] === "tool" && types[1] === "estimate" && types.includes("text") && types[types.length - 1] === "done", types.join(","));
const done = ev.find((e) => e.t === "done");
ok("done carries the whole reply", done.text === "Pour une facture de 500 MAD à Fès, Wattu recommande 2,5 kWc.", JSON.stringify(done.text));
ok("text pieces add up to the reply", ev.filter((e) => e.t === "text").map((e) => e.v).join("") === done.text);

// The request Wattu sends.
const first = apiCalls[0];
ok("two model calls", apiCalls.length === 2, "got " + apiCalls.length);
ok("model claude-opus-5-5", first.body.model === "claude-opus-5-5", first.body.model);
ok("adaptive thinking, medium effort", first.body.thinking?.type === "adaptive" && first.body.output_config?.effort === "medium", JSON.stringify([first.body.thinking, first.body.output_config]));
ok("refusal fallback on (default, its beta header)", first.body.fallbacks === "default" && (first.headers.get("anthropic-beta") || "").includes("server-side-fallback-2026-07-01"), first.headers.get("anthropic-beta"));
ok("streamed", first.body.stream === true);
ok("no forced tool choice", first.body.tool_choice === undefined);
ok("tools: estimate_solar, onee_bill, eager input streaming", JSON.stringify(first.body.tools.map((t) => [t.name, t.eager_input_streaming])) === '[["estimate_solar",true],["onee_bill",true]]');
ok("system prompt cached, then the page language", first.body.system[0].cache_control?.type === "ephemeral" && first.body.system[0].text === SYSTEM && /French page/.test(first.body.system[1].text));
ok("automatic cache for the conversation", first.body.cache_control?.type === "ephemeral");
ok("api key from the secret", first.headers.get("x-api-key") === "test-api-key");
ok("history sent as the visitor wrote it", JSON.stringify(first.body.messages) === JSON.stringify([{ role: "user", content: "Je suis à Fès, ma facture est de 500 DH. Ça vaut le coup ?" }]));

// The tool round trip: assistant turn echoed with its thinking block, then the result.
const second = apiCalls[1].body.messages;
ok("assistant turn sent back with its thinking block and signature", second[1].role === "assistant" && second[1].content[0].type === "thinking" && second[1].content[0].signature === "sig-1" && second[1].content[1].type === "tool_use");
ok("system prompt and tools unchanged between calls", JSON.stringify(apiCalls[1].body.system) === JSON.stringify(first.body.system) && JSON.stringify(apiCalls[1].body.tools) === JSON.stringify(first.body.tools));
const tr = second[2].content[0];
ok("tool_result for toolu_1", second[2].role === "user" && tr.type === "tool_result" && tr.tool_use_id === "toolu_1" && !tr.is_error, JSON.stringify(tr).slice(0, 120));
const est = JSON.parse(tr.content);

// Same figures as the engine itself (what the simulator shows).
const perKw = { yieldPerKw: pvgisJson.outputs.totals.fixed.E_y, monthlyPerKw: MONTHLY, radiationAnnual: 2150 };
const cons = Tariff.kwhFromBill(500);
const kwc = Sizing.autoKw(cons, perKw.yieldPerKw);
const pv = PV.scale(perKw, kwc);
const capex = kwc * 1000 * CONFIG.DEFAULT_COST_MAD_PER_WC;
const roi = ROI.compute({ pv, monthlyConsumption: cons, capexMAD: capex, exportAllowed: false });
ok("place in the page language", est.place === "Fès", est.place);
ok("size = the simulator's", est.system_kwc === kwc && est.panels === Sizing.panels(kwc), `${est.system_kwc} kWc, ${est.panels} panels`);
ok("investment = the simulator's", est.investment_mad === Math.round(capex), String(est.investment_mad));
ok("savings = the simulator's", est.savings_mad_year1 === Math.round(roi.annualSavingsMAD), String(est.savings_mad_year1));
ok("payback = the simulator's", est.payback_years === Math.round(roi.paybackYr * 10) / 10, String(est.payback_years));
ok("25-year gain = the simulator's", est.net_gain_25_years_mad === Math.round(roi.lifetimeSavingsMAD - capex), String(est.net_gain_25_years_mad));
ok("PVGIS source named", /^PVGIS/.test(est.production_source), est.production_source);
ok("simulator link with the figures", est.simulator_url.startsWith("https://solar.wattu.org/#lat=34.03310&lon=-5.00030&f=500&a=30&o=0&c=11"), est.simulator_url);
ok("city page link", est.city_page_url === "https://solar.wattu.org/ville/fes/", est.city_page_url);
const card = ev.find((e) => e.t === "estimate");
ok("estimate card for the page", card.kwc === kwc && card.investment === est.investment_mad && card.payback === est.payback_years && card.url === est.simulator_url && card.approximate === false, JSON.stringify(card));
ok("PVGIS asked once, at 1 kWc, south 30°, Fès", jrcCalls.length === 1 && /angle=30&aspect=0&lat=34\.0331&lon=-5\.0003&loss=14&mountingplace=building&outputformat=json&peakpower=1$/.test(jrcCalls[0]), jrcCalls[0]);

// ── 3. Arabic page, a town by coordinates, PVGIS down ─────────────────
script = [
  sse([{ type: "tool_use", id: "toolu_2", name: "estimate_solar", input: { lat: 31.5085, lon: -9.7595, place_label: "الصويرة <b>", monthly_kwh: 300, sell_surplus: true } }], "tool_use"),
  sse([{ type: "text", text: "تقدير تقريبي." }]),
];
apiCalls = []; jrcDown = true;
ev = await events(await chat(ask("شحال غادي نربح فالصويرة؟", { lang: "ar" })));
jrcDown = false;
const est2 = JSON.parse(apiCalls[1].body.messages[2].content[0].content);
ok("Arabic page told to the model", /Moroccan Arabic page/.test(apiCalls[0].body.system[1].text));
ok("PVGIS down → nearest-city approximation, said so", /^approximate/.test(est2.production_source) && ev.find((e) => e.t === "estimate").approximate === true, est2.production_source);
ok("label cleaned of markup", est2.place === "الصويرة b", est2.place);
ok("kWh in → bill derived", est2.bill_mad_month === Math.round(Tariff.billFromKwh(300)), String(est2.bill_mad_month));
ok("surplus sale counted when asked", est2.assumptions.surplus_sold === true && est2.surplus_income_mad_year >= 0);
ok("Arabic simulator link", est2.simulator_url.startsWith("https://solar.wattu.org/ar/#") && est2.simulator_url.includes("x=1"), est2.simulator_url);

// ── 4. Bad tool input goes back to the model as an error ───────────────
script = [
  sse([{ type: "tool_use", id: "t_a", name: "estimate_solar", input: { city: "Paris", monthly_bill_mad: 400 } },
       { type: "tool_use", id: "t_b", name: "estimate_solar", input: { lat: 48.85, lon: 2.35, monthly_bill_mad: 400 } },
       { type: "tool_use", id: "t_c", name: "estimate_solar", input: { city: "Rabat" } },
       { type: "tool_use", id: "t_d", name: "rm_rf", input: {} }], "tool_use"),
  sse([{ type: "text", text: "Wattu ne couvre que le Maroc." }]),
];
apiCalls = [];
ev = await events(await chat(ask("Et à Paris ?")));
const res4 = apiCalls[1].body.messages[2].content;
ok("unknown city → error result", res4[0].is_error && /not one of Wattu's cities/.test(res4[0].content), res4[0].content);
ok("point outside Morocco → error result", res4[1].is_error && /outside Morocco/.test(res4[1].content), res4[1].content);
ok("no consumption → error result", res4[2].is_error && /monthly_bill_mad or monthly_kwh/.test(res4[2].content), res4[2].content);
ok("unknown tool → error result", res4[3].is_error && /unknown tool/.test(res4[3].content), res4[3].content);
ok("no estimate card for failed tools", !ev.some((e) => e.t === "estimate"));
ok("answer still delivered", ev[ev.length - 1].t === "done");

// ── 5. Refusal, API errors, endless tool loops ─────────────────────────
script = [sse([{ type: "text", text: "Je commence à répondre" }], "refusal")];
ev = await events(await chat(ask("…")));
ok("refusal → partial text rewound, error refused", ev.some((e) => e.t === "rewind" && e.to === 0) && ev[ev.length - 1].t === "error" && ev[ev.length - 1].code === "refused", JSON.stringify(ev.slice(-2)));

script = [{ status: 400, type: "invalid_request_error" }];
ev = await events(await chat(ask("…")));
ok("API error → error failed", ev.length === 1 && ev[0].t === "error" && ev[0].code === "failed", JSON.stringify(ev));

script = Array.from({ length: 6 }, (_, i) => sse([{ type: "tool_use", id: "loop" + i, name: "onee_bill", input: { monthly_bill_mad: 300 } }], "tool_use"));
apiCalls = [];
ev = await events(await chat(ask("…")));
ok("at most 5 model calls per answer", apiCalls.length === 5 && ev[ev.length - 1].code === "failed", `${apiCalls.length} calls, last ${JSON.stringify(ev[ev.length - 1])}`);
script = [];

script = [sse([{ type: "tool_use", id: "trunc", name: "onee_bill", input: { monthly_bill_mad: 300 } }], "max_tokens")];
apiCalls = [];
ev = await events(await chat(ask("…")));
ok("tool call cut by max_tokens is never run", apiCalls.length === 1 && ev.every((e) => e.t !== "tool") && ev[ev.length - 1].code === "failed");

// A tool input that is not JSON at all: the call is redone, its text rewound.
script = [
  sse([{ type: "text", text: "Je calcule" }, { type: "tool_use", id: "bad", name: "onee_bill", raw: '{"monthly_bill_mad": 3' + '}}}"' }], "tool_use"),
  sse([{ type: "text", text: "Voilà." }]),
];
apiCalls = [];
ev = await events(await chat(ask("…")));
const rewound = ev.findIndex((e) => e.t === "rewind");
ok("unparseable tool input → call redone, text rewound", ev[ev.length - 1].t === "done" && ev[ev.length - 1].text === "Voilà." && (rewound >= 0 || apiCalls.length === 1),
  `${apiCalls.length} calls, ${JSON.stringify(ev.map((e) => e.t))}`);

// Text before a tool round, then the reply: two paragraphs, not glued.
script = [
  sse([{ type: "text", text: "Je calcule." }, { type: "tool_use", id: "p1", name: "onee_bill", input: { monthly_kwh: 250 } }], "tool_use"),
  sse([{ type: "text", text: "Votre facture est d'environ 270 MAD." }]),
];
ev = await events(await chat(ask("…")));
ok("text before a tool round is its own paragraph", ev[ev.length - 1].text === "Je calcule.\n\nVotre facture est d'environ 270 MAD.", JSON.stringify(ev[ev.length - 1].text));

await Promise.all(waits);

// ── 6. Pieces ──────────────────────────────────────────────────────────
const o = await runTool("onee_bill", { monthly_bill_mad: 500 }, {});
ok("onee_bill: 500 MAD ↔ kWh like the simulator", Math.abs(o.result.monthly_kwh - Math.round(Tariff.kwhFromBill(500) * 10) / 10) < 1e-9 && o.result.last_kwh_price_mad === 1.3817, JSON.stringify(o.result).slice(0, 140));
ok("onee_bill: tranches add up to the bill", Math.abs(o.result.tranches.reduce((a, t) => a + t.mad, 0) - 500) < 0.05);
ok("billFromKwh inverts kwhFromBill", [100, 250, 500, 900, 2400].every((b) => Math.abs(Tariff.billFromKwh(Tariff.kwhFromBill(b)) - b) < 1e-6));
ok("onee_bill rejects extra fields", (await runTool("onee_bill", { monthly_bill_mad: 500, x: 1 }, {})).error?.includes("unknown field"));
ok("estimate rejects out-of-range cost", /cost_mad_per_wc/.test((await runTool("estimate_solar", { city: "Rabat", monthly_bill_mad: 400, cost_mad_per_wc: 2 }, {})).error));
ok("city names in three languages",
  (await Promise.all(["Fès", "fez", "فاس", "casa", "الدار البيضاء", "Laâyoune"].map((city) =>
    runTool("estimate_solar", { city, monthly_bill_mad: 400 }, { lang: "fr", fetchJrc: async () => new Response(JSON.stringify(pvgisJson)) })))).every((x) => x.result));
ok("sameKey", sameKey(KEY, KEY) && !sameKey(KEY + "x", KEY) && !sameKey("", "") && !sameKey(undefined, KEY));
ok("parseConversation keeps the page language, defaults to fr", parseConversation({ lang: "en", messages: [{ role: "user", content: " hi " }] }).lang === "en" && parseConversation({ lang: "xx", messages: [{ role: "user", content: "hi" }] }).lang === "fr");
const blocks = [{ type: "thinking" }, { type: "text", text: "a" }, { type: "tool_use" }, { type: "fallback" }, { type: "thinking" }, { type: "text", text: "b" }];
ok("after a fallback, only the text before it is sent back", JSON.stringify(echoable(blocks).map((b) => b.type)) === '["text","thinking","text"]', JSON.stringify(echoable(blocks)));
ok("no fallback → content unchanged", echoable(blocks.slice(0, 3)).length === 3);
ok("system prompt has the tariff and the law from CONFIG", SYSTEM.includes(String(CONFIG.ONEE_TRANCHES[0][1])) && SYSTEM.includes(`${Math.round(CONFIG.EXPORT_CAP_PCT * 100)}%`));
ok("system prompt stable (no date, no randomness)", !/\b20\d\d-\d\d-\d\d\b/.test(SYSTEM) && TOOLS.length === 2);

globalThis.fetch = realFetch;
console.log(fail ? `\n${fail} FAILED` : "\nall green");
process.exit(fail ? 1 : 0);
