/* Wattu — chat assistant page (prototype).
 *
 * Talks to the Worker's POST /chat (solar/proxy/chat.js), which runs an open
 * model on Cloudflare Workers AI (free allowance)
 * with the estimator's engine as tools and streams the answer back as
 * NDJSON. The page keeps the conversation in memory only and sends it, as
 * plain text, with each question.
 *
 * Opened with a private link: …/chat/#k=<access key>[&l=fr|ar|en]. The key
 * is kept in this browser (localStorage) and removed from the address bar.
 *
 * Like app.js, every element is built with createElement / textContent:
 * no text, the model's included, is ever parsed as HTML.
 */
(function () {
  "use strict";

  const ENDPOINT = "https://solar-pvgis.redatahiri.workers.dev/chat";
  const MAX_MESSAGES = 20;     // the Worker's limit (chat.js)
  const MAX_CHARS = 1500;
  const MAX_REPLY_CHARS = 6000; // a longer reply is sent back cut (chat.js limit)
  const LINK_HOSTS = ["solar.wattu.org", "www.taqapro.ma", "taqapro.ma"];

  const STR = {
    fr: {
      dir: "ltr", numLocale: "fr-FR", langName: "Langue",
      home: "Wattu Solaire — simulateur", homeHref: "../",
      product: "Solaire",
      kicker: "Assistant · prototype",
      title: "Votre question sur le solaire, en clair",
      lede: "Dites votre ville et votre facture d'électricité : l'assistant calcule avec le moteur du simulateur Wattu (PVGIS, tarifs ONEE) et répond en français, en darija ou en anglais.",
      locked: "Ce prototype s'ouvre avec un lien d'accès privé.",
      label: "Votre question",
      placeholder: "Ex. : ma facture est de 600 DH à Casablanca, ça vaut le coup ?",
      send: "Envoyer", reset: "Nouvelle conversation",
      privacy: "Prototype gratuit. Vos messages sont traités par un modèle d'IA ouvert chez Cloudflare (Workers AI) pour rédiger la réponse ; Wattu ne les enregistre pas. N'indiquez ni nom, ni téléphone, ni adresse exacte. Les chiffres viennent du simulateur Wattu : ce sont des estimations, pas un devis.",
      you: "Vous", bot: "Wattu",
      thinking: "Réflexion…",
      tools: { estimate_solar: "Calcul avec PVGIS et les tarifs ONEE…", onee_bill: "Calcul de la facture ONEE…" },
      card: { kicker: "Estimation Wattu", size: "Puissance", panels: "panneaux", invest: "Investissement", savings: "Économie la 1re année", payback: "Amortissement", years: "ans", never: "non amorti", production: "Production", open: "Ouvrir dans le simulateur →", approx: "Production approximative : PVGIS n'a pas répondu." },
      kwc: "kWc", mad: "MAD", kwhYear: "kWh/an",
      errors: {
        401: "Lien d'accès invalide. Demandez un nouveau lien.",
        413: "La conversation est trop longue : commencez-en une nouvelle.",
        429: "Trop de messages d'un coup : réessayez dans une minute.",
        503: "L'assistant n'est pas encore activé.",
        refused: "Je ne peux pas répondre à cette demande. Posez une question sur le solaire ou l'électricité au Maroc.",
        failed: "La réponse a échoué. Réessayez.",
        busy: "L'assistant gratuit a atteint sa limite du jour. Donnez votre ville et votre facture pour une estimation, ou utilisez le simulateur : solar.wattu.org",
        offline: "Pas de connexion. Vérifiez le réseau et réessayez.",
      },
      suggestions: [
        "Ma facture est de 600 DH à Casablanca : combien de panneaux, et c'est rentable ?",
        "Le solaire vaut-il le coup à Marrakech pour une facture de 400 DH ?",
        "Peut-on revendre son électricité avec la loi 82-21 ?",
        "Comment choisir un installateur solaire sérieux ?",
      ],
    },
    ar: {
      dir: "rtl", numLocale: "fr-FR", langName: "اللغة",
      home: "Wattu — المحاكي", homeHref: "../ar/",
      product: "Solaire",
      kicker: "مساعد · نسخة تجريبية",
      title: "سول على الطاقة الشمسية، ونجاوبك بالواضح",
      lede: "قول لينا المدينة ديالك وشحال كتخلص فالضو: المساعد كيحسب بنفس المحرك ديال المحاكي Wattu (PVGIS وتعريفة ONEE) وكيجاوبك بالدارجة، بالفرنسية ولا بالإنجليزية.",
      locked: "هاد النسخة التجريبية كتحل غير بواحد الرابط خاص.",
      label: "السؤال ديالك",
      placeholder: "مثلا: الفاتورة ديالي 600 درهم فكازا، واش كتسوا؟",
      send: "صيفط", reset: "محادثة جديدة",
      privacy: "نسخة تجريبية فابور. الرسائل ديالك كيعالجها واحد النموذج ديال الذكاء الاصطناعي مفتوح عند Cloudflare (Workers AI) باش يكتب الجواب، و Wattu ما كيحفظهاش. ما تكتبش السمية ولا التيليفون ولا العنوان بالضبط. الأرقام جاية من المحاكي ديال Wattu: تقديرات، ماشي ديفي.",
      you: "أنت", bot: "Wattu",
      thinking: "كنفكر…",
      tools: { estimate_solar: "كنحسب بـ PVGIS وتعريفة ONEE…", onee_bill: "كنحسب الفاتورة ديال ONEE…" },
      card: { kicker: "تقدير Wattu", size: "القوة", panels: "بلاكات", invest: "الثمن", savings: "شحال كتوفر فالعام الأول", payback: "كيرجعو فلوسك فـ", years: "عام", never: "ما كيرجعوش", production: "الإنتاج", open: "حلّو فالمحاكي ←", approx: "الإنتاج تقريبي: PVGIS ما جاوبش." },
      kwc: "kWc", mad: "درهم", kwhYear: "kWh فالعام",
      errors: {
        401: "الرابط ماشي صالح. طلب رابط جديد.",
        413: "المحادثة طويلة بزاف: بدا محادثة جديدة.",
        429: "صيفطتي بزاف ديال الرسائل دقة وحدة: عاود من بعد دقيقة.",
        503: "المساعد مازال ما تشعلش.",
        refused: "ما نقدرش نجاوب على هاد الطلب. سول على الطاقة الشمسية ولا الضو فالمغرب.",
        failed: "الجواب ما وصلش. عاود جرب.",
        busy: "المساعد الفابور وصل للحد ديالو اليوم. عطينا المدينة والفاتورة باش نحسبو ليك، ولا خدم بالمحاكي: solar.wattu.org/ar/",
        offline: "ما كاينش الأنترنيت. تأكد من الريزو وعاود.",
      },
      suggestions: [
        "الفاتورة ديالي 600 درهم فكازا: شحال خاصني من بلاكة، وواش كتجيب؟",
        "واش الطاقة الشمسية كتسوا فمراكش إلا كنخلص 400 درهم فالشهر؟",
        "واش نقدر نبيع الضو اللي كنتج بالقانون 82-21؟",
        "كيفاش نختار شركة مزيانة تركب لي البلاكات؟",
      ],
    },
    en: {
      dir: "ltr", numLocale: "en-US", langName: "Language",
      home: "Wattu Solar — simulator", homeHref: "../en/",
      product: "Solar",
      kicker: "Assistant · prototype",
      title: "Your solar question, answered plainly",
      lede: "Tell it your city and your electricity bill: the assistant calculates with the Wattu simulator's engine (PVGIS, ONEE tariffs) and answers in English, French or Darija.",
      locked: "This prototype opens with a private access link.",
      label: "Your question",
      placeholder: "E.g. my bill is 600 MAD in Casablanca, is solar worth it?",
      send: "Send", reset: "New conversation",
      privacy: "Free prototype. Your messages are processed by an open AI model at Cloudflare (Workers AI) to write the answer; Wattu does not keep them. Don't include your name, phone number or exact address. Figures come from the Wattu simulator: estimates, not a quote.",
      you: "You", bot: "Wattu",
      thinking: "Thinking…",
      tools: { estimate_solar: "Calculating with PVGIS and ONEE tariffs…", onee_bill: "Calculating the ONEE bill…" },
      card: { kicker: "Wattu estimate", size: "System", panels: "panels", invest: "Investment", savings: "Savings in year 1", payback: "Payback", years: "years", never: "no payback", production: "Production", open: "Open in the simulator →", approx: "Approximate production: PVGIS did not answer." },
      kwc: "kWp", mad: "MAD", kwhYear: "kWh/yr",
      errors: {
        401: "Invalid access link. Ask for a new one.",
        413: "The conversation is too long: start a new one.",
        429: "Too many messages at once: try again in a minute.",
        503: "The assistant is not switched on yet.",
        refused: "I can't answer that. Ask about solar power or electricity in Morocco.",
        failed: "The answer failed. Please try again.",
        busy: "The free assistant has reached today's limit. Give your city and your bill for an estimate, or use the simulator: solar.wattu.org/en/",
        offline: "No connection. Check the network and try again.",
      },
      suggestions: [
        "My bill is 600 MAD in Casablanca: how many panels, and does it pay off?",
        "Is solar worth it in Marrakech for a 400 MAD bill?",
        "Can I sell my electricity under law 82-21?",
        "How do I choose a reliable solar installer?",
      ],
    },
  };

  const $ = (id) => document.getElementById(id);
  const log = $("chat-log"), form = $("chat-form"), input = $("chat-input");
  const sendBtn = $("chat-send"), suggest = $("chat-suggest");

  // ── Settings kept in this browser (best effort) ─────────────────────
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("k")) store.set("wattu-chat-key", hash.get("k").slice(0, 200));
  let key = hash.get("k") || store.get("wattu-chat-key") || "";
  if (location.hash) {
    // The key stays out of the address bar, screenshots and shared links.
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  const guess = (navigator.language || "").slice(0, 2);
  let lang = [hash.get("l"), store.get("wattu-chat-lang"), guess].find((l) => l && STR[l]) || "fr";

  let convo = [];            // [{ role, content }], text only
  let busy = null;           // AbortController of the answer in progress

  // ── Language ────────────────────────────────────────────────────────
  function applyLang(next) {
    lang = next;
    store.set("wattu-chat-lang", lang);
    const S = STR[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = S.dir;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = S[el.dataset.i18n]; });
    input.placeholder = S.placeholder;
    const home = $("chat-home");
    home.setAttribute("aria-label", S.home);
    home.href = S.homeHref;
    document.querySelector(".chat-langs").setAttribute("aria-label", S.langName);
    document.querySelectorAll(".chat-lang").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    renderSuggestions();
  }

  function renderSuggestions() {
    suggest.replaceChildren();
    if (convo.length || !key) return;
    for (const text of STR[lang].suggestions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chat-chip";
      b.dir = "auto";
      b.textContent = text;
      b.addEventListener("click", () => ask(text));
      suggest.append(b);
    }
  }

  // ── Messages ────────────────────────────────────────────────────────
  function bubble(role) {
    const li = document.createElement("li");
    li.className = "chat-msg chat-" + role;
    const who = document.createElement("span");
    who.className = "chat-who";
    who.textContent = role === "user" ? STR[lang].you : STR[lang].bot;
    const body = document.createElement("div");
    body.className = "chat-body";
    body.dir = "auto";
    li.append(who, body);
    log.append(li);
    return { li, body };
  }
  const scrollDown = () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  // A small, safe subset of Markdown: paragraphs, "- " and "1. " lists,
  // **bold**, and links to a few known sites. Everything else is text.
  function render(el, text) {
    el.replaceChildren();
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const bullet = /^[-•*]\s+/, numbered = /^\d+[.)]\s+/;
      if (lines.every((l) => bullet.test(l)) || lines.every((l) => numbered.test(l))) {
        const list = document.createElement(bullet.test(lines[0]) ? "ul" : "ol");
        for (const l of lines) {
          const li = document.createElement("li");
          inline(li, l.replace(bullet, "").replace(numbered, ""));
          list.append(li);
        }
        el.append(list);
      } else {
        const p = document.createElement("p");
        lines.forEach((l, i) => { if (i) p.append(document.createElement("br")); inline(p, l); });
        el.append(p);
      }
    }
  }
  function inline(parent, text) {
    for (const part of text.split(/(\*\*[^*]+\*\*)/)) {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        const b = document.createElement("strong");
        links(b, part.slice(2, -2));
        parent.append(b);
      } else if (part) {
        links(parent, part);
      }
    }
  }
  // "3 kWc" inside an Arabic sentence would show as "kWc 3": a number
  // with a Latin unit is isolated (invisible LRI…PDI, no effect in LTR text).
  const UNIT = /\d[\d\u00a0\u202f .,]*\s?(?:kWc|kWp|kWh|kW|Wc|Wp|MAD|m²|CO2)(?:\/(?:an|yr|mois|month))?/g;
  const plain = (parent, text) => parent.append(text.replace(UNIT, (m) => `\u2066${m}\u2069`));
  function links(parent, text) {
    const re = /https?:\/\/[^\s<>"'()\]]+[^\s<>"'()\].,;:!?،]/g;
    let at = 0, m;
    while ((m = re.exec(text))) {
      plain(parent, text.slice(at, m.index));
      let url = null;
      try { url = new URL(m[0]); } catch (e) { /* not a URL */ }
      if (url && url.protocol === "https:" && LINK_HOSTS.includes(url.hostname)) {
        const a = document.createElement("a");
        a.href = url.href;
        a.target = "_blank";
        a.rel = "noopener";
        a.dir = "ltr";
        let path = url.pathname;
        try { path = decodeURI(path); } catch (e) { /* keep it encoded */ }
        a.textContent = url.hostname + path + (url.hash ? "#…" : "");
        parent.append(a);
      } else {
        parent.append(m[0]);
      }
      at = m.index + m[0].length;
    }
    plain(parent, text.slice(at));
  }

  // The figures of an estimate, from the engine, as a card.
  function card(e) {
    const S = STR[lang], C = S.card;
    const n = (v) => Math.round(v).toLocaleString(S.numLocale);
    const d = (v) => v.toLocaleString(S.numLocale, { maximumFractionDigits: 1 });
    // Latin units inside Arabic text keep their order (as in app.js).
    const iso = (t) => (lang === "ar" ? `\u2066${t}\u2069` : t);
    // Darija counts years in سنين up to ten, عام beyond (as the simulator).
    const years = (v) => (lang === "ar" && v <= 10 ? "سنين" : C.years);
    const box = document.createElement("div");
    box.className = "chat-card";
    const k = document.createElement("span");
    k.className = "w-kicker";
    k.textContent = `${C.kicker} · ${e.place}`;
    const grid = document.createElement("dl");
    const add = (label, value) => {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value;
      grid.append(dt, dd);
    };
    add(C.size, `${iso(`${d(e.kwc)} ${S.kwc}`)} · ${e.panels} ${C.panels}`);
    add(C.invest, `${n(e.investment)} ${S.mad}`);
    add(C.savings, `${n(e.savings)} ${S.mad}`);
    add(C.payback, e.payback === null ? C.never : `${d(e.payback)} ${years(e.payback)}`);
    add(C.production, lang === "ar" ? `${iso(`${n(e.production)} kWh`)} فالعام` : `${n(e.production)} ${S.kwhYear}`);
    box.append(k, grid);
    if (e.approximate) {
      const p = document.createElement("p");
      p.className = "chat-note";
      p.textContent = C.approx;
      box.append(p);
    }
    try {
      const url = new URL(e.url);
      if (url.protocol === "https:" && url.hostname === "solar.wattu.org") {
        const a = document.createElement("a");
        a.className = "chat-open";
        a.href = url.href;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = C.open;
        box.append(a);
      }
    } catch (err) { /* no link */ }
    return box;
  }

  function showError(body, code) {
    const p = document.createElement("p");
    p.className = "chat-error";
    p.textContent = STR[lang].errors[code] || STR[lang].errors.failed;
    body.replaceChildren(p);
  }

  // ── Asking ──────────────────────────────────────────────────────────
  async function ask(raw) {
    const text = String(raw || "").trim().slice(0, MAX_CHARS);
    if (!text || busy || !key) return;
    input.value = "";
    suggest.replaceChildren();
    render(bubble("user").body, text);

    // The latest exchanges only, starting with a question (the Worker's rule).
    let past = convo.slice(-(MAX_MESSAGES - 1));
    if (past.length && past[0].role !== "user") past = past.slice(1);
    const messages = past.concat({ role: "user", content: text });

    const { li, body } = bubble("assistant");
    li.classList.add("chat-pending");
    const status = document.createElement("p");
    status.className = "chat-status";
    status.textContent = STR[lang].thinking;
    body.append(status);
    const cards = document.createElement("div");
    cards.className = "chat-cards";
    const answer = document.createElement("div");
    body.append(cards, answer);
    scrollDown();

    busy = new AbortController();
    sendBtn.disabled = true;
    let reply = "", outcome = null, frame = 0;   // outcome: "done" | "error"
    const paint = () => { frame = 0; render(answer, reply); };
    const handle = (ev) => {
      if (ev.t === "tool") {
        status.hidden = false;
        status.textContent = STR[lang].tools[ev.name] || STR[lang].thinking;
      } else if (ev.t === "estimate") {
        cards.append(card(ev));
      } else if (ev.t === "text") {
        status.hidden = true;
        reply += ev.v;
        if (!frame) frame = requestAnimationFrame(paint);
      } else if (ev.t === "rewind") {
        reply = reply.slice(0, ev.to);
        if (!frame) frame = requestAnimationFrame(paint);
      } else if (ev.t === "done") {
        outcome = "done";
        reply = ev.text;
        convo = messages.concat({ role: "assistant", content: ev.text.slice(0, MAX_REPLY_CHARS) });
      } else if (ev.t === "error") {
        outcome = "error";
        status.remove();
        showError(answer, ev.code);
      }
    };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ key, lang, messages }),
        signal: busy.signal,
      });
      if (!res.ok) {
        outcome = "error";
        status.remove();
        showError(answer, res.status);
        if (res.status === 401) { key = ""; store.set("wattu-chat-key", ""); lock(); }
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (line) handle(JSON.parse(line));
          }
        }
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (!outcome) { status.remove(); showError(answer, "failed"); }
        else if (outcome === "done") { status.remove(); render(answer, reply); }
      }
    } catch (e) {
      if (e.name !== "AbortError") { status.remove(); showError(answer, navigator.onLine === false ? "offline" : "failed"); }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      li.classList.remove("chat-pending");
      busy = null;
      sendBtn.disabled = false;
      scrollDown();
    }
  }

  function lock() {
    $("chat-locked").hidden = false;
    form.hidden = true;
    suggest.replaceChildren();
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter breaks the line (not while composing Arabic).
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  $("chat-reset").addEventListener("click", () => {
    if (busy) busy.abort();
    convo = [];
    log.replaceChildren();
    renderSuggestions();
    input.focus();
  });
  document.querySelectorAll(".chat-lang").forEach((b) => b.addEventListener("click", () => applyLang(b.dataset.lang)));

  applyLang(lang);
  if (!key) lock();
})();
