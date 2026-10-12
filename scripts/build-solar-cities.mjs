#!/usr/bin/env node
/* Builds the static city pages of solar.wattu.org:
 *   <out>/ville/<slug>/index.html   one page per city in solar/data/cities.json
 *   <out>/villes/index.html         the comparison table linking them all
 *   <out>/ar/ville/<slug>/, ar/villes/  the same pages in Moroccan Arabic (right to left)
 *   <out>/en/city/<slug>/, en/cities/   the same pages in English (all three hreflang-linked)
 *   <out>/ar/guide/, en/guide/          the guides in Arabic (French slugs) and English (English slugs)
 *   <out>/sitemap.xml               home + every page above
 *   <out>/llms.txt                  plain-text map of the site for AI crawlers
 *   <out>/guide/, guide/<slug>/      answers to common questions (price, panels, ONEE tariff, law 82-21, Taqa Pro)
 *   <out>/<key>.txt                 IndexNow key file (see scripts/indexnow-ping.mjs)
 *
 * The estimator computes everything in the browser, after an address is
 * typed: search engines and AI crawlers see none of it. These pages carry
 * the same figures as plain HTML. They are computed with the estimator's
 * own engine (CONFIG, Tariff, ROI, read from solar/app.js), so a page and
 * the tool never disagree, and with PVGIS at each city centre.
 *
 *   node scripts/build-solar-cities.mjs _site [--version abc123]
 *   node scripts/build-solar-cities.mjs /tmp/out --offline   # no network
 *
 * --offline uses the estimator's built-in nearest-city yields instead of
 * PVGIS and marks every page noindex: for layout work only, never deployed.
 * Without it, any PVGIS failure stops the build, so no page is ever
 * published with approximate figures.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://solar.wattu.org";
const PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc";
const BILLS = [300, 500, 800, 1200];      // MAD/month profiles shown on every page
const REFERENCE_BILL = 500;               // the profile quoted in sentences and the index
const AUTHOR = "Reda Tahiri";
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const args = process.argv.slice(2);
const out = args.find(a => !a.startsWith("--"));
const offline = args.includes("--offline");
const vIdx = args.indexOf("--version");
const version = vIdx >= 0 ? args[vIdx + 1] : "";
if (!out) {
  console.error("usage: build-solar-cities.mjs <outDir> [--offline] [--version V]");
  process.exit(2);
}

// ── The estimator's engine ──────────────────────────
// app.js is a browser script; run it with a stub document so its boot
// handler is registered and never fires, then read its top-level objects.
function loadEngine() {
  const src = readFileSync(join(ROOT, "solar/app.js"), "utf8");
  const ctx = vm.createContext({
    document: { addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }) },
    console,
  });
  return vm.runInContext(src + "\n;({ CONFIG, Tariff, ROI, PVGIS, State, inMorocco })", ctx);
}
const { CONFIG, Tariff, ROI, PVGIS, State, inMorocco } = loadEngine();
const ANGLE = State.params.angle;     // 30°
const ASPECT = State.params.aspect;   // 0 = south
const COST = State.params.cost;       // MAD/Wc

async function fetchPerKw(lat, lon) {
  const params = new URLSearchParams({
    lat: lat.toFixed(4), lon: lon.toFixed(4), peakpower: "1",
    loss: String(CONFIG.PVGIS_LOSS), angle: String(ANGLE), aspect: String(ASPECT),
    mountingplace: CONFIG.PVGIS_MOUNTING, outputformat: "json",
  });
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${PVGIS_URL}?${params}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const totals = data?.outputs?.totals?.fixed;
      const monthly = data?.outputs?.monthly?.fixed;
      if (!totals || !monthly || monthly.length !== 12) throw new Error("unexpected response");
      return {
        yieldPerKw: totals.E_y,
        monthlyPerKw: monthly.map(m => m.E_m),
        radiationAnnual: totals["H(i)_y"],
      };
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`PVGIS failed for ${lat},${lon}: ${lastErr.message}`);
}

// Same sizing rule as UI.recalc(): cover AUTOSIZE_COVER of the yearly
// consumption, rounded to 0.5 kWc, between 1 and 10 kWc, no export.
function profile(perKw, bill) {
  const consumption = Tariff.kwhFromBill(bill);
  const targetKw = (consumption * 12 * CONFIG.AUTOSIZE_COVER) / perKw.yieldPerKw;
  const kwp = Math.min(10, Math.max(1, Math.round(targetKw * 2) / 2));
  const pv = PVGIS.scale(perKw, kwp);
  const capex = kwp * 1000 * COST;
  const roi = ROI.compute({ pv, monthlyConsumption: consumption, capexMAD: capex, exportAllowed: false });
  return {
    bill, consumption, kwp, panels: Math.ceil(kwp / CONFIG.PANEL_KWP - 1e-9),
    capex, annualKwh: pv.annualKwh, savings: roi.annualSavingsMAD,
    payback: roi.paybackYr, lifetime: roi.lifetimeSavingsMAD - capex,
    co2: pv.annualKwh * CONFIG.CO2_KG_PER_KWH / 1000,
  };
}

// ── Formatting ──────────────────────────────────────
const num = (n) => Math.round(n).toLocaleString("fr-FR");
const dec = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kw = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const years = (n) => Number.isFinite(n) ? `${dec(n)} ans` : "plus de 25 ans";
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const v = version ? `?v=${encodeURIComponent(version)}` : "";
const today = new Date().toISOString().slice(0, 10);
const todayFr = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const ldJson = (o) => JSON.stringify(o, null, 2).replace(/</g, "\\u003c");

function toolLink(c, bill) {
  const q = new URLSearchParams({ lat: c.lat.toFixed(5), lon: c.lon.toFixed(5), f: bill, a: ANGLE, o: ASPECT, c: COST, n: c.name });
  return `../../#${q.toString()}`;
}

// alt = { fr, ar, en }: root-relative paths of the same page in each
// language, for hreflang and the language links. Arabic is right to left.
const LANG_LABEL = { fr: "Français", ar: "العربية", en: "English" };
const altCity = (c) => ({ fr: `/ville/${c.slug}/`, ar: `/ar/ville/${c.slug}/`, en: `/en/city/${c.slug}/` });
const ALT_INDEX = { fr: "/villes/", ar: "/ar/villes/", en: "/en/cities/" };
function layout({ title, description, canonical, depth, body, jsonLd, lang = "fr", alt = null }) {
  const up = "../".repeat(depth);
  const ar = lang === "ar";
  const hreflang = alt ? Object.entries(alt).map(([l, path]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${path}">`).join("\n")
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}${alt.fr}">\n` : "";
  const langLinks = alt ? Object.entries(alt).filter(([l]) => l !== lang)
    .map(([l, path]) => `\n    <a class="nav-lang" href="${path}" lang="${l}" hreflang="${l}">${LANG_LABEL[l]}</a>`).join("") : "";
  const home = { fr: "Wattu Solaire — accueil", ar: "Wattu — الصفحة الرئيسية", en: "Wattu Solar — home" }[lang];
  const nav = {
    fr: `    <a href="${up}villes/">Villes</a>
    <a href="${up}guide/">Guides</a>
    <a class="nav-sim" href="${up}">Simulateur</a>`,
    ar: `    <a href="${up}ar/villes/">المدن</a>
    <a href="${up}ar/guide/">شروحات</a>
    <a class="nav-sim" href="${up}">المحاكي</a>`,
    en: `    <a href="${up}en/cities/">Cities</a>
    <a href="${up}en/guide/">Guides</a>
    <a class="nav-sim" href="${up}">Simulator</a>`,
  }[lang] + langLinks;
  const footNav = {
    fr: `    <a href="${up}villes/">Rentabilité par ville</a>
    <a href="${up}guide/">Guides</a>
    <a href="https://energy.wattu.org/">Carte énergie × digital</a>`,
    ar: `    <a href="${up}ar/villes/">شحال كتربح فكل مدينة</a>
    <a href="${up}ar/guide/">شروحات</a>`,
    en: `    <a href="${up}en/cities/">Solar payback by city</a>
    <a href="${up}en/guide/">Guides</a>
    <a href="https://energy.wattu.org/">Energy × digital map</a>`,
  }[lang];
  return `<!doctype html>
<html lang="${lang}"${ar ? ' dir="rtl"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${offline ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${canonical}">
${hreflang}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Wattu">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${{ fr: "fr_MA", ar: "ar_MA", en: "en_US" }[lang]}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#050B18">
<script type="application/ld+json">
${ldJson(jsonLd)}
</script>
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}style.css${v}">
<link rel="stylesheet" href="${up}brand.css${v}">
<link rel="stylesheet" href="${up}pages.css${v}">
</head>
<body class="cp">

<header class="topbar">
  <a class="w-brand" href="${up}" aria-label="${home}">
    <img class="w-mark" src="${up}mark.svg" alt="" width="26" height="26">
    <span class="w-word">wattu</span>
    <span class="w-product">Solaire</span>
  </a>
  <nav class="topnav">
${nav}
  </nav>
</header>

<main class="cp-main">
${body}
</main>

<footer class="site-footer">
  <a class="w-brand" href="${up}" aria-label="${home}">
    <img class="w-mark" src="${up}mark.svg" alt="" width="22" height="22">
    <span class="w-word">wattu</span>
  </a>
  <nav>
${footNav}
  </nav>
</footer>
</body>
</html>
`;
}

const methodHtml = () => `
<section class="cp-section" id="methode">
  <h2>Méthode et sources</h2>
  <ul class="cp-method">
    <li><strong>Production&nbsp;:</strong> PVGIS v5.2 (Centre commun de recherche de la Commission européenne), au centre-ville, panneaux en toiture inclinés à ${ANGLE}° plein sud, ${CONFIG.PVGIS_LOSS}&nbsp;% de pertes système.</li>
    <li><strong>Économies&nbsp;:</strong> tarifs résidentiels basse tension de l'ONEE par tranche (TTC). Le solaire remplace d'abord les kWh des tranches les plus chères. Part autoconsommée estimée selon la taille du système, sans revente du surplus.</li>
    <li><strong>Dimensionnement&nbsp;:</strong> système couvrant environ ${Math.round(CONFIG.AUTOSIZE_COVER * 100)}&nbsp;% de la consommation annuelle, arrondi au demi-kWc, panneaux de ${CONFIG.PANEL_KWP * 1000}&nbsp;Wc.</li>
    <li><strong>Coût&nbsp;:</strong> ${num(COST)}&nbsp;MAD par Wc installé (hypothèse, à remplacer par le devis de votre installateur). Maintenance ${Math.round(CONFIG.OPEX_PCT_CAPEX_YR * 100)}&nbsp;% par an, dégradation ${dec(CONFIG.DEGRADATION_PCT_YR * 100)}&nbsp;% par an, hausse du tarif ${Math.round(CONFIG.TARIFF_INFLATION_YR * 100)}&nbsp;% par an, durée ${CONFIG.LIFETIME_YR}&nbsp;ans.</li>
    <li><strong>CO₂&nbsp;:</strong> ${dec(CONFIG.CO2_KG_PER_KWH)}&nbsp;kg évités par kWh (mix électrique marocain).</li>
  </ul>
  <p class="cp-meta">Mis à jour le <time datetime="${today}">${todayFr}</time> par ${AUTHOR}, expert des infrastructures énergétiques et numériques au Maroc. Les chiffres sont recalculés à chaque mise à jour du simulateur. Wattu ne vend pas d'installation et ne perçoit aucune commission.</p>
</section>`;

function cityPage(c, all) {
  const r = c.result;
  const ref = r.profiles.find(p => p.bill === REFERENCE_BILL);
  const url = `${SITE}/ville/${c.slug}/`;
  const nationalAvg = all.reduce((a, x) => a + x.result.yieldPerKw, 0) / all.length;
  const diff = (r.yieldPerKw / nationalAvg - 1) * 100;
  const diffTxt = Math.abs(diff) < 1 ? "dans la moyenne des villes marocaines"
    : `${num(Math.abs(diff))} % ${diff > 0 ? "au-dessus" : "en dessous"} de la moyenne des ${all.length} villes étudiées`;
  const rank = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw).indexOf(c) + 1;
  const best = Math.max(...r.monthlyPerKw), worst = Math.min(...r.monthlyPerKw);

  const answer = `À ${c.name}, chaque kWc de panneaux solaires produit environ ${num(r.yieldPerKw)} kWh par an. Pour une facture ONEE de ${REFERENCE_BILL} MAD par mois, une installation de ${kw(ref.kwp)} kWc (environ ${num(ref.capex)} MAD) économise près de ${num(ref.savings)} MAD par an et s'amortit en ${years(ref.payback)}.`;

  const faq = [
    [`Combien produit un panneau solaire à ${c.name} ?`,
      `Un panneau de ${CONFIG.PANEL_KWP * 1000} Wc bien orienté produit environ ${num(r.yieldPerKw * CONFIG.PANEL_KWP)} kWh par an à ${c.name}, soit ${num(r.yieldPerKw)} kWh par kWc installé (PVGIS, toiture inclinée à ${ANGLE}° plein sud). La production va de ${num(worst)} kWh par kWc au mois le plus faible à ${num(best)} kWh au mois le plus fort.`],
    [`Combien coûte une installation solaire à ${c.name} ?`,
      `Pour une maison dont la facture est de ${REFERENCE_BILL} MAD par mois, il faut environ ${kw(ref.kwp)} kWc, soit ${ref.panels} panneaux, pour un budget de l'ordre de ${num(ref.capex)} MAD à ${num(COST)} MAD par Wc. Le prix réel dépend de l'installateur, du matériel et du toit.`],
    [`Le solaire est-il rentable à ${c.name} ?`,
      `Oui pour la plupart des foyers : avec une facture de ${REFERENCE_BILL} MAD par mois, l'installation s'amortit en ${years(ref.payback)} et rapporte environ ${num(ref.lifetime)} MAD nets sur ${CONFIG.LIFETIME_YR} ans. Plus la facture est élevée, plus l'amortissement est rapide, car le solaire remplace d'abord les tranches ONEE les plus chères.`],
    [`Peut-on revendre le surplus à l'ONEE à ${c.name} ?`,
      `La loi 82-21 sur l'autoproduction autorise l'injection du surplus sur le réseau, plafonnée à ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)} % de la production annuelle. Le tarif de rachat résidentiel n'étant pas encore publié, les chiffres de cette page n'en tiennent pas compte : ce sont des estimations prudentes.`],
  ];

  const sameRegion = all.filter(x => x !== c && x.region === c.region);
  const others = all.filter(x => x !== c && x.region !== c.region);

  const body = `
<nav class="cp-crumbs" aria-label="Fil d'Ariane"><a href="../../">Wattu Solaire</a> › <a href="../../villes/">Villes</a> › <span>${esc(c.name)}</span></nav>

<article>
  <header class="cp-head">
    <p class="w-kicker">Solaire résidentiel · ${esc(c.region)}</p>
    <h1>Panneaux solaires à ${esc(c.name)}&nbsp;: production, prix et rentabilité</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="${esc(toolLink(c, REFERENCE_BILL))}">Calculer pour mon adresse à ${esc(c.name)} →</a>
  </header>

  <section class="cp-figures" aria-label="Chiffres clés">
    <div><span class="cp-fig">${num(r.yieldPerKw)}</span><span class="cp-unit">kWh par kWc et par an</span></div>
    <div><span class="cp-fig">${r.radiationAnnual ? num(r.radiationAnnual) : "—"}</span><span class="cp-unit">kWh/m²/an d'ensoleillement sur le panneau</span></div>
    <div><span class="cp-fig">${rank}<sup>${rank === 1 ? "re" : "e"}</sup></span><span class="cp-unit">sur ${all.length} villes pour la production</span></div>
    <div><span class="cp-fig">${years(ref.payback).replace(" ans", "")}</span><span class="cp-unit">ans d'amortissement (facture ${REFERENCE_BILL} MAD)</span></div>
  </section>
  <p class="cp-note">La production solaire à ${esc(c.name)} est ${diffTxt}.</p>

  <section class="cp-section">
    <h2>Rentabilité selon votre facture d'électricité</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>Installation en toiture à ${esc(c.name)}, ${ANGLE}° plein sud, ${num(COST)} MAD/Wc, sans revente du surplus</caption>
      <thead><tr><th scope="col">Facture ONEE</th><th scope="col">Consommation</th><th scope="col">Puissance conseillée</th><th scope="col">Investissement</th><th scope="col">Production</th><th scope="col">Économie an&nbsp;1</th><th scope="col">Amortissement</th><th scope="col">Gain net sur ${CONFIG.LIFETIME_YR} ans</th></tr></thead>
      <tbody>
${r.profiles.map(p => `        <tr><th scope="row">${num(p.bill)} MAD/mois</th><td>${num(p.consumption)} kWh/mois</td><td>${kw(p.kwp)} kWc (${p.panels} panneaux)</td><td>${num(p.capex)} MAD</td><td>${num(p.annualKwh)} kWh/an</td><td>${num(p.savings)} MAD</td><td>${years(p.payback)}</td><td>${num(p.lifetime)} MAD</td></tr>`).join("\n")}
      </tbody>
    </table>
    </div>
    <p class="cp-note">Votre toit, votre orientation et votre devis changent ces chiffres. <a href="${esc(toolLink(c, REFERENCE_BILL))}">Le simulateur</a> les recalcule pour votre adresse exacte, avec la surface réelle de votre toit.</p>
  </section>

  <section class="cp-section">
    <h2>Production solaire mois par mois à ${esc(c.name)}</h2>
    <div class="cp-scroll">
    <table class="cp-table cp-months">
      <caption>kWh produits par kWc installé (PVGIS)</caption>
      <thead><tr>${MONTHS.map(m => `<th scope="col">${m}</th>`).join("")}</tr></thead>
      <tbody><tr>${r.monthlyPerKw.map(m => `<td>${num(m)}</td>`).join("")}</tr></tbody>
    </table>
    </div>
  </section>

  <section class="cp-section">
    <h2>Questions fréquentes</h2>
${faq.map(([q, a]) => `    <h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join("\n")}
  </section>

  ${methodHtml()}

  <section class="cp-section">
    <h2>Autres villes</h2>
    ${sameRegion.length ? `<p class="cp-near">Même région&nbsp;: ${sameRegion.map(x => `<a href="../${x.slug}/">${esc(x.name)}</a> (${num(x.result.yieldPerKw)} kWh/kWc)`).join(" · ")}</p>` : ""}
    <p class="cp-near">${others.map(x => `<a href="../${x.slug}/">${esc(x.name)}</a>`).join(" · ")}</p>
    <p><a href="../../villes/">Comparer les ${all.length} villes →</a></p>
    <p class="cp-near">Guides&nbsp;: <a href="../../guide/combien-de-panneaux-solaires/">combien de panneaux&nbsp;?</a> · <a href="../../guide/prix-panneau-solaire-maroc/">prix d'une installation</a> · <a href="../../guide/tarif-electricite-onee/">tarifs ONEE</a> · <a href="../../guide/loi-82-21-autoproduction/">loi 82-21</a> · <a href="../../guide/taqa-pro-installateur/">installateurs Taqa Pro</a></p>
  </section>
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": url + "#article",
        headline: `Panneaux solaires à ${c.name} : production, prix et rentabilité`,
        description: answer,
        inLanguage: "fr-MA",
        url,
        dateModified: today,
        author: { "@type": "Person", name: AUTHOR },
        publisher: { "@type": "Organization", name: "Wattu", url: SITE + "/" },
        about: {
          "@type": "City", name: c.name,
          containedInPlace: { "@type": "AdministrativeArea", name: c.region },
          geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon },
        },
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Wattu Solaire", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Villes", item: SITE + "/villes/" },
          { "@type": "ListItem", position: 3, name: c.name, item: url },
        ],
      },
    ],
  };

  return layout({
    title: `Panneaux solaires ${c.name} : production, prix, rentabilité (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer,
    canonical: url,
    depth: 2,
    body,
    jsonLd,
    alt: altCity(c),
  });
}

function indexPage(all) {
  const url = `${SITE}/villes/`;
  const sorted = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw);
  const ys = sorted.map(c => c.result.yieldPerKw);
  const refOf = (c) => c.result.profiles.find(p => p.bill === REFERENCE_BILL);
  const paybacks = sorted.map(c => refOf(c).payback).filter(Number.isFinite);
  const top = sorted[0], low = sorted[sorted.length - 1];
  const answer = `Au Maroc, un kWc de panneaux solaires produit de ${num(Math.min(...ys))} à ${num(Math.max(...ys))} kWh par an selon la ville, de ${low.name} à ${top.name}. Pour une facture ONEE de ${REFERENCE_BILL} MAD par mois, une installation résidentielle s'amortit en ${dec(Math.min(...paybacks))} à ${dec(Math.max(...paybacks))} ans.`;

  const body = `
<nav class="cp-crumbs" aria-label="Fil d'Ariane"><a href="../">Wattu Solaire</a> › <span>Villes</span></nav>
<article>
  <header class="cp-head">
    <p class="w-kicker">Solaire résidentiel · Maroc</p>
    <h1>Rentabilité des panneaux solaires au Maroc, ville par ville</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="../">Calculer pour mon adresse →</a>
  </header>

  <section class="cp-section">
    <h2>Les ${all.length} villes classées par production solaire</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>Toiture ${ANGLE}° plein sud, facture de ${REFERENCE_BILL} MAD/mois, ${num(COST)} MAD/Wc, sans revente du surplus</caption>
      <thead><tr><th scope="col">Ville</th><th scope="col">Région</th><th scope="col">Production par kWc</th><th scope="col">Puissance conseillée</th><th scope="col">Économie an&nbsp;1</th><th scope="col">Amortissement</th></tr></thead>
      <tbody>
${sorted.map(c => { const p = refOf(c); return `        <tr><th scope="row"><a href="../ville/${c.slug}/">${esc(c.name)}</a></th><td>${esc(c.region)}</td><td>${num(c.result.yieldPerKw)} kWh/an</td><td>${kw(p.kwp)} kWc</td><td>${num(p.savings)} MAD</td><td>${years(p.payback)}</td></tr>`; }).join("\n")}
      </tbody>
    </table>
    </div>
  </section>

  ${methodHtml().replace("au centre-ville", "au centre de chaque ville")}
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        name: "Production et rentabilité du solaire résidentiel dans les villes du Maroc",
        description: answer,
        url,
        inLanguage: "fr-MA",
        dateModified: today,
        creator: { "@type": "Person", name: AUTHOR },
        license: "https://creativecommons.org/licenses/by/4.0/",
        spatialCoverage: { "@type": "Country", name: "Maroc" },
        variableMeasured: ["Production photovoltaïque annuelle (kWh/kWc)", "Économie annuelle (MAD)", "Durée d'amortissement (années)"],
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Wattu Solaire", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Villes", item: url },
        ],
      },
    ],
  };

  return layout({
    title: `Rentabilité des panneaux solaires au Maroc par ville (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer,
    canonical: url,
    depth: 1,
    body,
    jsonLd,
    alt: ALT_INDEX,
  });
}

// ── Arabic pages (/ar/ville/<slug>/, /ar/villes/) ──
// Same figures as the French pages, written the Moroccan way: headings,
// questions and the lead in Darija (the words people type: البلاكات,
// فاتورة الضو, شحال, واش, فوقاش), the method in plain Arabic. Right to
// left; Western digits and Moroccan month names, as Moroccan media print them.
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"];
const todayAr = new Date().toLocaleDateString("ar-MA-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
// Darija counts: سنين up to 10, عام beyond; بلاكات up to 10, بلاكة beyond.
const yearsAr = (n) => !Number.isFinite(n) ? "كثر من 25 عام" : `${dec(n)} ${n <= 10 ? "سنين" : "عام"}`;
const panelsAr = (n) => n === 1 ? "بلاكة وحدة" : n === 2 ? "جوج بلاكات" : n <= 10 ? `${n} بلاكات` : `${n} بلاكة`;
// Darija prepositions glued to a name: ف + فاس is written apart (ف فاس);
// ل + الداخلة drops the alef (للداخلة).
const fi = (n) => n.startsWith("ف") ? `ف ${n}` : `ف${n}`;
const li = (n) => n.startsWith("ال") ? `لل${n.slice(2)}` : `ل${n}`;
const KWH = "كيلوواط ساعة", KWC = "كيلوواط ذروة", MAD_AR = "درهم";

const methodHtmlAr = (where) => `
<section class="cp-section" id="methode">
  <h2>كيفاش حسبنا</h2>
  <ul class="cp-method">
    <li><strong>الإنتاج:</strong> PVGIS v5.2 ديال المفوضية الأوروبية، ${where}، بلاكات فوق السطح مايلين ب${ANGLE}° لجهة الجنوب، مع ${CONFIG.PVGIS_LOSS}% ديال الضياع.</li>
    <li><strong>التوفير:</strong> تعريفة الضو ديال الديور (الجهد المنخفض) ديال المكتب الوطني للكهرباء والماء الصالح للشرب، حسب الأشطر ومع الضرائب. البلاكات كتعوض الأول الكيلوواط الغالي. الجزء اللي كتستهلك من الإنتاج ديالك محسوب حسب الحجم ديال التركيب، بلا ما تبيع الفائض.</li>
    <li><strong>الحجم:</strong> تركيب كيغطي تقريبا ${Math.round(CONFIG.AUTOSIZE_COVER * 100)}% من الاستهلاك ديال العام، مقرّب لنص ${KWC}، ببلاكات ديال ${CONFIG.PANEL_KWP * 1000} واط.</li>
    <li><strong>الثمن:</strong> ${num(COST)} ${MAD_AR} للواط مركّب (فرضية، بدّلها بالدوفي ديال المركّب ديالك). الصيانة ${Math.round(CONFIG.OPEX_PCT_CAPEX_YR * 100)}% فالعام، المردود كينقص ${dec(CONFIG.DEGRADATION_PCT_YR * 100)}% فالعام، التعريفة كتزيد ${Math.round(CONFIG.TARIFF_INFLATION_YR * 100)}% فالعام، على ${CONFIG.LIFETIME_YR} عام.</li>
  </ul>
  <p class="cp-meta">تحدّث نهار <time datetime="${today}">${todayAr}</time> من طرف <span lang="fr">${AUTHOR}</span>، خبير فالبنيات التحتية ديال الطاقة والرقمي فالمغرب. الحسابات كتعاود مع كل تحديث ديال المحاكي. <span lang="fr">Wattu</span> ما كتبيعش التركيبات وما كتاخد حتى عمولة.</p>
</section>`;

function cityPageAr(c, all) {
  const r = c.result;
  const ref = r.profiles.find(p => p.bill === REFERENCE_BILL);
  const url = `${SITE}/ar/ville/${c.slug}/`;
  const nationalAvg = all.reduce((a, x) => a + x.result.yieldPerKw, 0) / all.length;
  const diff = (r.yieldPerKw / nationalAvg - 1) * 100;
  const name = c.name_ar;
  const diffTxt = Math.abs(diff) < 1 ? "قريب من المعدل ديال المدن المغربية"
    : `${diff > 0 ? "كثر" : "قل"} ب${num(Math.abs(diff))}% من المعدل ديال ${all.length} مدينة اللي درسنا`;
  const rank = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw).indexOf(c) + 1;
  const best = Math.max(...r.monthlyPerKw), worst = Math.min(...r.monthlyPerKw);

  const answer = `${fi(name)}، كل ${KWC} ديال البلاكات الشمسية (الألواح الشمسية) كينتج تقريبا ${num(r.yieldPerKw)} ${KWH} فالعام. إلا كانت فاتورة الضو ديالك ${REFERENCE_BILL} ${MAD_AR} فالشهر، تركيب ديال ${kw(ref.kwp)} ${KWC} كيكلف تقريبا ${num(ref.capex)} ${MAD_AR}، كيوفر ليك قريب ${num(ref.savings)} ${MAD_AR} فالعام، وكترجع فلوسك ف${yearsAr(ref.payback)}.`;

  const faq = [
    [`شحال كتنتج البلاكة الشمسية ${fi(name)}؟`,
      `بلاكة ديال ${CONFIG.PANEL_KWP * 1000} واط، إلا كانت مقادة مزيان، كتنتج تقريبا ${num(r.yieldPerKw * CONFIG.PANEL_KWP)} ${KWH} فالعام ${fi(name)}، يعني ${num(r.yieldPerKw)} ${KWH} لكل ${KWC} (حسب PVGIS، سطح مايل ب${ANGLE}° لجهة الجنوب). فالشهر الضعيف كتنتج ${num(worst)} ${KWH} لكل ${KWC}، وفالشهر القوي ${num(best)}.`],
    [`شحال كيكلف تركيب الطاقة الشمسية ${fi(name)}؟`,
      `لدار فيها فاتورة ديال ${REFERENCE_BILL} ${MAD_AR} فالشهر، خاصك تقريبا ${kw(ref.kwp)} ${KWC}، يعني ${panelsAr(ref.panels)}، والميزانية قريبة ل${num(ref.capex)} ${MAD_AR} على حساب ${num(COST)} ${MAD_AR} للواط. الثمن الحقيقي كيتبدل حسب المركّب، السلعة والسطح.`],
    [`واش الطاقة الشمسية كتربح ${fi(name)}؟`,
      `إيه، لأغلب الديور: بفاتورة ديال ${REFERENCE_BILL} ${MAD_AR} فالشهر، كترجع فلوسك ف${yearsAr(ref.payback)} وكتربح تقريبا ${num(ref.lifetime)} ${MAD_AR} صافية ف${CONFIG.LIFETIME_YR} عام. وكلما كانت الفاتورة كبيرة، كترجع فلوسك بالزربة، حيت البلاكات كتعوض الأول الأشطر الغالية فالفاتورة.`],
    [`واش نقدر نبيع الضو الزايد للشبكة ${fi(name)}؟`,
      `القانون 82-21 ديال الإنتاج الذاتي كيسمح تدخّل الفائض للشبكة، ولكن ماشي كثر من ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)}% من الإنتاج ديال العام. والثمن اللي غادي يشريو بيه الفائض من الديور مازال ما تنشرش، داكشي علاش الأرقام ديال هاد الصفحة ما حاسباهش: هادي تقديرات محتاطة.`],
  ];

  const sameRegion = all.filter(x => x !== c && x.region === c.region);
  const others = all.filter(x => x !== c && x.region !== c.region);

  const body = `
<nav class="cp-crumbs" aria-label="فين كاين"><a href="../../../">Wattu</a> ‹ <a href="../../villes/">المدن</a> ‹ <span>${esc(name)}</span></nav>

<article>
  <header class="cp-head">
    <p class="w-kicker">الطاقة الشمسية فالدار · ${esc(c.region_ar)}</p>
    <h1>البلاكات الشمسية ${esc(fi(name))}: شحال كتنتج، شحال كتكلف، وفوقاش كترجع فلوسك</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="${esc("../" + toolLink(c, REFERENCE_BILL))}">حسب لدارك ${esc(fi(name))} ←</a>
    <p class="cp-note">المحاكي متوفر دابا غير بالفرنسية.</p>
  </header>

  <section class="cp-figures" aria-label="الأرقام المهمة">
    <div><span class="cp-fig">${num(r.yieldPerKw)}</span><span class="cp-unit">${KWH} لكل ${KWC} فالعام</span></div>
    <div><span class="cp-fig">${r.radiationAnnual ? num(r.radiationAnnual) : "—"}</span><span class="cp-unit">${KWH}/م² ديال الشمس على البلاكة فالعام</span></div>
    <div><span class="cp-fig">${rank}</span><span class="cp-unit">الرتبة ديالها من بين ${all.length} مدينة فالإنتاج</span></div>
    <div><span class="cp-fig">${dec(ref.payback)}</span><span class="cp-unit">${ref.payback <= 10 ? "سنين" : "عام"} باش ترجع فلوسك (فاتورة ${REFERENCE_BILL} ${MAD_AR})</span></div>
  </section>
  <p class="cp-note">الإنتاج الشمسي ${esc(fi(name))} ${diffTxt}.</p>

  <section class="cp-section">
    <h2>شحال كتربح حسب فاتورة الضو ديالك</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>تركيب فوق السطح ${esc(fi(name))}، مايل ب${ANGLE}° لجهة الجنوب، ${num(COST)} ${MAD_AR} للواط، بلا ما تبيع الفائض</caption>
      <thead><tr><th scope="col">فاتورة الضو</th><th scope="col">الاستهلاك</th><th scope="col">القوة اللي خاصك</th><th scope="col">ثمن التركيب</th><th scope="col">الإنتاج</th><th scope="col">التوفير فالعام الأول</th><th scope="col">فوقاش كترجع فلوسك</th><th scope="col">الربح الصافي ف${CONFIG.LIFETIME_YR} عام</th></tr></thead>
      <tbody>
${r.profiles.map(p => `        <tr><th scope="row">${num(p.bill)} ${MAD_AR}/الشهر</th><td>${num(p.consumption)} ${KWH}/الشهر</td><td>${kw(p.kwp)} ${KWC} (${panelsAr(p.panels)})</td><td>${num(p.capex)} ${MAD_AR}</td><td>${num(p.annualKwh)} ${KWH}/العام</td><td>${num(p.savings)} ${MAD_AR}</td><td>${yearsAr(p.payback)}</td><td>${num(p.lifetime)} ${MAD_AR}</td></tr>`).join("\n")}
      </tbody>
    </table>
    </div>
    <p class="cp-note">السطح ديالك، الاتجاه ديالو والدوفي ديال المركّب كيبدلو هاد الأرقام. <a href="${esc("../" + toolLink(c, REFERENCE_BILL))}">المحاكي</a> كيعاود يحسبهم للعنوان ديالك بالضبط، مع المساحة الحقيقية ديال السطح.</p>
  </section>

  <section class="cp-section">
    <h2>شحال كتنتج البلاكات كل شهر ${esc(fi(name))}</h2>
    <div class="cp-scroll">
    <table class="cp-table cp-months">
      <caption>${KWH} لكل ${KWC} مركّب (PVGIS)</caption>
      <thead><tr>${MONTHS_AR.map(m => `<th scope="col">${m}</th>`).join("")}</tr></thead>
      <tbody><tr>${r.monthlyPerKw.map(m => `<td>${num(m)}</td>`).join("")}</tr></tbody>
    </table>
    </div>
  </section>

  <section class="cp-section">
    <h2>الأسئلة اللي كيسولو الناس</h2>
${faq.map(([q, a]) => `    <h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join("\n")}
  </section>

  ${methodHtmlAr("فوسط المدينة")}

  <section class="cp-section">
    <h2>مدن خرين</h2>
    ${sameRegion.length ? `<p class="cp-near">فنفس الجهة: ${sameRegion.map(x => `<a href="../${x.slug}/">${esc(x.name_ar)}</a> (${num(x.result.yieldPerKw)} ${KWH}/${KWC})`).join(" · ")}</p>` : ""}
    <p class="cp-near">${others.map(x => `<a href="../${x.slug}/">${esc(x.name_ar)}</a>`).join(" · ")}</p>
    <p><a href="../../villes/">قارن بين ${all.length} مدينة ←</a></p>
    <p class="cp-near">شروحات: <a href="../../guide/combien-de-panneaux-solaires/">شحال ديال البلاكات خاصني؟</a> · <a href="../../guide/prix-panneau-solaire-maroc/">ثمن التركيب</a> · <a href="../../guide/tarif-electricite-onee/">تعريفة ONEE</a> · <a href="../../guide/loi-82-21-autoproduction/">القانون 82-21</a> · <a href="../../guide/taqa-pro-installateur/">المركّبين Taqa Pro</a></p>
  </section>
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article", "@id": url + "#article",
        headline: `البلاكات الشمسية ${fi(name)}: شحال كتنتج، شحال كتكلف، وفوقاش كترجع فلوسك`,
        description: answer, inLanguage: "ar-MA", url, dateModified: today,
        author: { "@type": "Person", name: AUTHOR },
        publisher: { "@type": "Organization", name: "Wattu", url: SITE + "/" },
        about: {
          "@type": "City", name, alternateName: c.name,
          containedInPlace: { "@type": "AdministrativeArea", name: c.region_ar },
          geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon },
        },
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wattu", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "المدن", item: SITE + "/ar/villes/" },
        { "@type": "ListItem", position: 3, name, item: url },
      ] },
    ],
  };

  return layout({
    title: `الطاقة الشمسية ${fi(name)}: شحال كتنتج البلاكات وشحال كتربح (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer, canonical: url, depth: 3, body, jsonLd,
    lang: "ar", alt: altCity(c),
  });
}

function indexPageAr(all) {
  const url = `${SITE}/ar/villes/`;
  const sorted = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw);
  const ys = sorted.map(c => c.result.yieldPerKw);
  const refOf = (c) => c.result.profiles.find(p => p.bill === REFERENCE_BILL);
  const paybacks = sorted.map(c => refOf(c).payback).filter(Number.isFinite);
  const top = sorted[0], low = sorted[sorted.length - 1];
  const answer = `فالمغرب، كل ${KWC} ديال البلاكات الشمسية (الألواح الشمسية) كينتج بين ${num(Math.min(...ys))} و${num(Math.max(...ys))} ${KWH} فالعام حسب المدينة، من ${low.name_ar} حتى ${li(top.name_ar)}. إلا كانت فاتورة الضو ديالك ${REFERENCE_BILL} ${MAD_AR} فالشهر، كترجع فلوس التركيب ف${dec(Math.min(...paybacks))} حتى ل${dec(Math.max(...paybacks))} عام.`;

  const body = `
<nav class="cp-crumbs" aria-label="فين كاين"><a href="../../">Wattu</a> ‹ <span>المدن</span></nav>
<article>
  <header class="cp-head">
    <p class="w-kicker">الطاقة الشمسية فالدار · المغرب</p>
    <h1>الطاقة الشمسية فالمغرب: شحال كتربح فكل مدينة</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="../../">حسب لدارك ←</a>
    <p class="cp-note">المحاكي متوفر دابا غير بالفرنسية.</p>
  </header>

  <section class="cp-section">
    <h2>ترتيب ${all.length} مدينة حسب الإنتاج الشمسي</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>سطح مايل ب${ANGLE}° لجهة الجنوب، فاتورة ${REFERENCE_BILL} ${MAD_AR} فالشهر، ${num(COST)} ${MAD_AR} للواط، بلا ما تبيع الفائض</caption>
      <thead><tr><th scope="col">المدينة</th><th scope="col">الجهة</th><th scope="col">الإنتاج لكل ${KWC}</th><th scope="col">القوة اللي خاصك</th><th scope="col">التوفير فالعام الأول</th><th scope="col">فوقاش كترجع فلوسك</th></tr></thead>
      <tbody>
${sorted.map(c => { const p = refOf(c); return `        <tr><th scope="row"><a href="../ville/${c.slug}/">${esc(c.name_ar)}</a></th><td>${esc(c.region_ar)}</td><td>${num(c.result.yieldPerKw)} ${KWH}/العام</td><td>${kw(p.kwp)} ${KWC}</td><td>${num(p.savings)} ${MAD_AR}</td><td>${yearsAr(p.payback)}</td></tr>`; }).join("\n")}
      </tbody>
    </table>
    </div>
  </section>

  ${methodHtmlAr("فوسط كل مدينة")}
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        name: "الإنتاج والربح ديال الطاقة الشمسية فالديور حسب المدن المغربية",
        description: answer, url, inLanguage: "ar-MA", dateModified: today,
        creator: { "@type": "Person", name: AUTHOR },
        license: "https://creativecommons.org/licenses/by/4.0/",
        spatialCoverage: { "@type": "Country", name: "المغرب" },
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wattu", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "المدن", item: url },
      ] },
    ],
  };

  return layout({
    title: `الطاقة الشمسية فالمغرب: شحال كتربح البلاكات فكل مدينة (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer, canonical: url, depth: 2, body, jsonLd,
    lang: "ar", alt: ALT_INDEX,
  });
}

// ── English pages (/en/city/<slug>/, /en/cities/) ──
// For expatriates, the diaspora and English-language search. Same figures,
// English number format (1,646 · 9.8).
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const numEn = (n) => Math.round(n).toLocaleString("en-US");
const decEn = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kwEn = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const yearsEn = (n) => Number.isFinite(n) ? `${decEn(n)} years` : "over 25 years";
const ordinalEn = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
const todayEn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const methodHtmlEn = (where) => `
<section class="cp-section" id="methode">
  <h2>Method and sources</h2>
  <ul class="cp-method">
    <li><strong>Output:</strong> PVGIS v5.2 (European Commission Joint Research Centre), ${where}, rooftop panels tilted ${ANGLE}° due south, ${CONFIG.PVGIS_LOSS}% system losses.</li>
    <li><strong>Savings:</strong> ONEE low-voltage residential tariff by tranche (tax included). Solar replaces the most expensive kWh of the bill first. The share used on site depends on system size; no surplus sales.</li>
    <li><strong>Sizing:</strong> a system covering about ${Math.round(CONFIG.AUTOSIZE_COVER * 100)}% of yearly consumption, rounded to half a kWp, with ${CONFIG.PANEL_KWP * 1000} Wp panels.</li>
    <li><strong>Cost:</strong> ${numEn(COST)} MAD per installed watt-peak (an assumption: use your installer's quote). Maintenance ${Math.round(CONFIG.OPEX_PCT_CAPEX_YR * 100)}% a year, ${decEn(CONFIG.DEGRADATION_PCT_YR * 100)}% yearly output loss, ${Math.round(CONFIG.TARIFF_INFLATION_YR * 100)}% yearly tariff rise, ${CONFIG.LIFETIME_YR}-year life.</li>
  </ul>
  <p class="cp-meta">Updated <time datetime="${today}">${todayEn}</time> by ${AUTHOR}, an energy and digital infrastructure expert focused on Morocco. Figures are recalculated with every update of the simulator. Wattu does not sell installations and takes no commission.</p>
</section>`;

function cityPageEn(c, all) {
  const r = c.result;
  const ref = r.profiles.find(p => p.bill === REFERENCE_BILL);
  const url = `${SITE}/en/city/${c.slug}/`;
  const name = c.name_en;
  const nationalAvg = all.reduce((a, x) => a + x.result.yieldPerKw, 0) / all.length;
  const diff = (r.yieldPerKw / nationalAvg - 1) * 100;
  const diffTxt = Math.abs(diff) < 1 ? "in line with the Moroccan average"
    : `${numEn(Math.abs(diff))}% ${diff > 0 ? "above" : "below"} the average of the ${all.length} cities studied`;
  const rank = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw).indexOf(c) + 1;
  const best = Math.max(...r.monthlyPerKw), worst = Math.min(...r.monthlyPerKw);

  const answer = `In ${name}, each kWp of solar panels produces about ${numEn(r.yieldPerKw)} kWh a year. For an electricity bill of ${REFERENCE_BILL} MAD a month, a ${kwEn(ref.kwp)} kWp system (about ${numEn(ref.capex)} MAD) saves around ${numEn(ref.savings)} MAD a year and pays for itself in ${yearsEn(ref.payback)}.`;

  const faq = [
    [`How much does a solar panel produce in ${name}?`,
      `A well-oriented ${CONFIG.PANEL_KWP * 1000} Wp panel produces about ${numEn(r.yieldPerKw * CONFIG.PANEL_KWP)} kWh a year in ${name}, or ${numEn(r.yieldPerKw)} kWh per installed kWp (PVGIS, roof tilted ${ANGLE}° due south). Output ranges from ${numEn(worst)} kWh per kWp in the weakest month to ${numEn(best)} kWh in the strongest.`],
    [`How much does a home solar system cost in ${name}?`,
      `For a home with a ${REFERENCE_BILL} MAD monthly bill, you need about ${kwEn(ref.kwp)} kWp, or ${ref.panels} panels, for a budget of around ${numEn(ref.capex)} MAD at ${numEn(COST)} MAD per watt-peak. The actual price depends on the installer, the equipment and the roof.`],
    [`Is solar worth it in ${name}?`,
      `For most households, yes: with a ${REFERENCE_BILL} MAD monthly bill, the system pays for itself in ${yearsEn(ref.payback)} and returns about ${numEn(ref.lifetime)} MAD net over ${CONFIG.LIFETIME_YR} years. The higher the bill, the faster the payback, because solar replaces the most expensive tranches of the ONEE tariff first.`],
    [`Can you sell surplus solar power to the grid in ${name}?`,
      `Morocco's self-generation law 82-21 allows surplus power to be fed into the grid, capped at ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)}% of yearly output. The residential buy-back tariff has not been published yet, so the figures on this page leave it out: they are conservative estimates.`],
  ];

  const sameRegion = all.filter(x => x !== c && x.region === c.region);
  const others = all.filter(x => x !== c && x.region !== c.region);

  const body = `
<nav class="cp-crumbs" aria-label="Breadcrumb"><a href="../../../">Wattu Solar</a> › <a href="../../cities/">Cities</a> › <span>${esc(name)}</span></nav>

<article>
  <header class="cp-head">
    <p class="w-kicker">Home solar · ${esc(c.region)}</p>
    <h1>Solar panels in ${esc(name)}, Morocco: output, cost and payback</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="${esc("../" + toolLink(c, REFERENCE_BILL))}">Calculate for my address in ${esc(name)} →</a>
    <p class="cp-note">The simulator is in French for now.</p>
  </header>

  <section class="cp-figures" aria-label="Key figures">
    <div><span class="cp-fig">${numEn(r.yieldPerKw)}</span><span class="cp-unit">kWh per kWp per year</span></div>
    <div><span class="cp-fig">${r.radiationAnnual ? numEn(r.radiationAnnual) : "—"}</span><span class="cp-unit">kWh/m² of sunlight on the panel per year</span></div>
    <div><span class="cp-fig">${ordinalEn(rank)}</span><span class="cp-unit">of ${all.length} cities for solar output</span></div>
    <div><span class="cp-fig">${decEn(ref.payback)}</span><span class="cp-unit">years to pay back (${REFERENCE_BILL} MAD bill)</span></div>
  </section>
  <p class="cp-note">Solar output in ${esc(name)} is ${diffTxt}.</p>

  <section class="cp-section">
    <h2>Payback by electricity bill</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>Rooftop system in ${esc(name)}, ${ANGLE}° due south, ${numEn(COST)} MAD/Wp, no surplus sales</caption>
      <thead><tr><th scope="col">ONEE bill</th><th scope="col">Consumption</th><th scope="col">Recommended size</th><th scope="col">Investment</th><th scope="col">Output</th><th scope="col">Year-1 savings</th><th scope="col">Payback</th><th scope="col">Net gain over ${CONFIG.LIFETIME_YR} years</th></tr></thead>
      <tbody>
${r.profiles.map(p => `        <tr><th scope="row">${numEn(p.bill)} MAD/month</th><td>${numEn(p.consumption)} kWh/month</td><td>${kwEn(p.kwp)} kWp (${p.panels} panels)</td><td>${numEn(p.capex)} MAD</td><td>${numEn(p.annualKwh)} kWh/yr</td><td>${numEn(p.savings)} MAD</td><td>${yearsEn(p.payback)}</td><td>${numEn(p.lifetime)} MAD</td></tr>`).join("\n")}
      </tbody>
    </table>
    </div>
    <p class="cp-note">Your roof, its orientation and your quote change these figures. <a href="${esc("../" + toolLink(c, REFERENCE_BILL))}">The simulator</a> recalculates them for your exact address, with your actual roof area.</p>
  </section>

  <section class="cp-section">
    <h2>Month-by-month solar output in ${esc(name)}</h2>
    <div class="cp-scroll">
    <table class="cp-table cp-months">
      <caption>kWh per installed kWp (PVGIS)</caption>
      <thead><tr>${MONTHS_EN.map(m => `<th scope="col">${m}</th>`).join("")}</tr></thead>
      <tbody><tr>${r.monthlyPerKw.map(m => `<td>${numEn(m)}</td>`).join("")}</tr></tbody>
    </table>
    </div>
  </section>

  <section class="cp-section">
    <h2>Frequently asked questions</h2>
${faq.map(([q, a]) => `    <h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join("\n")}
  </section>

  ${methodHtmlEn("at the city centre")}

  <section class="cp-section">
    <h2>Other cities</h2>
    ${sameRegion.length ? `<p class="cp-near">Same region: ${sameRegion.map(x => `<a href="../${x.slug}/">${esc(x.name_en)}</a> (${numEn(x.result.yieldPerKw)} kWh/kWp)`).join(" · ")}</p>` : ""}
    <p class="cp-near">${others.map(x => `<a href="../${x.slug}/">${esc(x.name_en)}</a>`).join(" · ")}</p>
    <p><a href="../../cities/">Compare the ${all.length} cities →</a></p>
    <p class="cp-near">Guides: <a href="../../guide/how-many-solar-panels/">how many panels?</a> · <a href="../../guide/solar-panel-cost-morocco/">installation cost</a> · <a href="../../guide/onee-electricity-tariff/">ONEE tariff</a> · <a href="../../guide/law-82-21-self-generation/">Law 82-21</a> · <a href="../../guide/taqa-pro-installers/">Taqa Pro installers</a></p>
  </section>
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article", "@id": url + "#article",
        headline: `Solar panels in ${name}, Morocco: output, cost and payback`,
        description: answer, inLanguage: "en", url, dateModified: today,
        author: { "@type": "Person", name: AUTHOR },
        publisher: { "@type": "Organization", name: "Wattu", url: SITE + "/" },
        about: {
          "@type": "City", name, alternateName: c.name,
          containedInPlace: { "@type": "AdministrativeArea", name: c.region },
          geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lon },
        },
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wattu Solar", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "Cities", item: SITE + "/en/cities/" },
        { "@type": "ListItem", position: 3, name, item: url },
      ] },
    ],
  };

  return layout({
    title: `Solar panels in ${name}, Morocco: output, cost, payback (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer, canonical: url, depth: 3, body, jsonLd,
    lang: "en", alt: altCity(c),
  });
}

function indexPageEn(all) {
  const url = `${SITE}/en/cities/`;
  const sorted = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw);
  const ys = sorted.map(c => c.result.yieldPerKw);
  const refOf = (c) => c.result.profiles.find(p => p.bill === REFERENCE_BILL);
  const paybacks = sorted.map(c => refOf(c).payback).filter(Number.isFinite);
  const top = sorted[0], low = sorted[sorted.length - 1];
  const answer = `In Morocco, one kWp of solar panels produces ${numEn(Math.min(...ys))} to ${numEn(Math.max(...ys))} kWh a year depending on the city, from ${low.name_en} to ${top.name_en}. For an electricity bill of ${REFERENCE_BILL} MAD a month, a home system pays for itself in ${decEn(Math.min(...paybacks))} to ${decEn(Math.max(...paybacks))} years.`;

  const body = `
<nav class="cp-crumbs" aria-label="Breadcrumb"><a href="../../">Wattu Solar</a> › <span>Cities</span></nav>
<article>
  <header class="cp-head">
    <p class="w-kicker">Home solar · Morocco</p>
    <h1>Solar panel payback in Morocco, city by city</h1>
    <p class="cp-answer">${esc(answer)}</p>
    <a class="cp-cta" href="../../">Calculate for my address →</a>
    <p class="cp-note">The simulator is in French for now.</p>
  </header>

  <section class="cp-section">
    <h2>The ${all.length} cities ranked by solar output</h2>
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>Roof at ${ANGLE}° due south, ${REFERENCE_BILL} MAD monthly bill, ${numEn(COST)} MAD/Wp, no surplus sales</caption>
      <thead><tr><th scope="col">City</th><th scope="col">Region</th><th scope="col">Output per kWp</th><th scope="col">Recommended size</th><th scope="col">Year-1 savings</th><th scope="col">Payback</th></tr></thead>
      <tbody>
${sorted.map(c => { const p = refOf(c); return `        <tr><th scope="row"><a href="../city/${c.slug}/">${esc(c.name_en)}</a></th><td>${esc(c.region)}</td><td>${numEn(c.result.yieldPerKw)} kWh/yr</td><td>${kwEn(p.kwp)} kWp</td><td>${numEn(p.savings)} MAD</td><td>${yearsEn(p.payback)}</td></tr>`; }).join("\n")}
      </tbody>
    </table>
    </div>
  </section>

  ${methodHtmlEn("at each city centre")}
</article>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        name: "Home solar output and payback in Moroccan cities",
        description: answer, url, inLanguage: "en", dateModified: today,
        creator: { "@type": "Person", name: AUTHOR },
        license: "https://creativecommons.org/licenses/by/4.0/",
        spatialCoverage: { "@type": "Country", name: "Morocco" },
        variableMeasured: ["Yearly PV output (kWh/kWp)", "Yearly savings (MAD)", "Payback (years)"],
        isBasedOn: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en",
      },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wattu Solar", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "Cities", item: url },
      ] },
    ],
  };

  return layout({
    title: `Solar panel payback in Morocco by city (${new Date().getUTCFullYear()}) | Wattu`,
    description: answer, canonical: url, depth: 2, body, jsonLd,
    lang: "en", alt: ALT_INDEX,
  });
}

function sitemap(all, guideList, guideListAr = [], guideListEn = []) {
  const urls = [`${SITE}/`, `${SITE}/villes/`, `${SITE}/guide/`,
    ...guideList.map(g => `${SITE}/guide/${g.slug}/`), ...all.map(c => `${SITE}/ville/${c.slug}/`),
    `${SITE}/ar/villes/`, ...all.map(c => `${SITE}/ar/ville/${c.slug}/`),
    `${SITE}/en/cities/`, ...all.map(c => `${SITE}/en/city/${c.slug}/`),
    `${SITE}/ar/guide/`, ...guideListAr.map(g => `${SITE}/ar/guide/${g.slug}/`),
    `${SITE}/en/guide/`, ...guideListEn.map(g => `${SITE}/en/guide/${g.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function llmsTxt(all, guideList) {
  const sorted = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw);
  return `# Wattu Solaire

> Simulateur gratuit de production et de rentabilité des panneaux solaires résidentiels au Maroc. Production calculée avec PVGIS (Commission européenne), économies avec les tarifs ONEE par tranche. Sans inscription, sans commission. Par ${AUTHOR}. Mis à jour le ${today}.

- [Simulateur](${SITE}/): production, économies en MAD et amortissement pour une adresse précise
- [Rentabilité par ville](${SITE}/villes/): tableau comparatif de ${all.length} villes marocaines
- [الطاقة الشمسية فالمغرب: شحال كتربح فكل مدينة](${SITE}/ar/villes/): les mêmes pages villes en arabe marocain (darija)
- [Solar panel payback in Morocco, city by city](${SITE}/en/cities/): the same city pages in English
- [شروحات البلاكات الشمسية فالمغرب](${SITE}/ar/guide/) · [Solar panel guides for Morocco](${SITE}/en/guide/): the guides below in Arabic and English

## Guides

${guideList.map(g => `- [${g.h1}](${SITE}/guide/${g.slug}/): ${g.answer}`).join("\n")}

## Villes

${sorted.map(c => { const p = c.result.profiles.find(x => x.bill === REFERENCE_BILL); return `- [${c.name}](${SITE}/ville/${c.slug}/): ${num(c.result.yieldPerKw)} kWh/kWc/an; facture ${REFERENCE_BILL} MAD/mois → ${kw(p.kwp)} kWc, ${num(p.savings)} MAD économisés par an, amorti en ${years(p.payback)}`; }).join("\n")}
`;
}

// ── Guides (/guide/<slug>/) ─────────────────────────
// Answers to the questions people actually type, built from the same
// engine and the same PVGIS runs as the city pages. Facts that are not
// computed (law, label, cost range) come from solar/README.md "Data
// sources" and solar/INSTALLERS.md, with their sources on the page.
const COST_LOW = 8, COST_HIGH = 15;   // MAD/Wc, README "Installed cost"
const SOURCES = {
  onee: ["Grille tarifaire résidentielle ONEE (kherba.com)", "https://kherba.com/tarifs"],
  cost: ["Prix du solaire résidentiel au Maroc (lechantier.ma, mai 2026)", "https://lechantier.ma/en/prix/solaire"],
  pvgis: ["PVGIS, Commission européenne", "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en"],
  taqa: ["Liste officielle des entreprises labellisées Taqa Pro", "https://taqapro.ma/entreprises-labellisees-taqapro/"],
  decret: ["Décret n° 2.25.100 du 5 mars 2026 pris pour l'application de la loi 82-21", null],
};
const price2 = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price4 = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const tableHtml = (caption, head, rows) => `
    <div class="cp-scroll">
    <table class="cp-table">
      <caption>${caption}</caption>
      <thead><tr>${head.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead>
      <tbody>
${rows.map(r => `        <tr><th scope="row">${r[0]}</th>${r.slice(1).map(x => `<td>${x}</td>`).join("")}</tr>`).join("\n")}
      </tbody>
    </table>
    </div>`;
const sourcesHtml = (keys) => `<p class="cp-meta">Sources&nbsp;: ${keys.map(k => SOURCES[k][1] ? `<a href="${SOURCES[k][1]}" rel="nofollow noopener">${esc(SOURCES[k][0])}</a>` : esc(SOURCES[k][0])).join(" · ")}. Mis à jour le <time datetime="${today}">${todayFr}</time> par ${AUTHOR}.</p>`;

function guides(all) {
  const byYield = [...all].sort((a, b) => a.result.yieldPerKw - b.result.yieldPerKw);
  const med = byYield[Math.floor(byYield.length / 2)];
  const Y = med.result.yieldPerKw;
  const yMin = byYield[0], yMax = byYield[byYield.length - 1];
  const refs = all.map(c => c.result.profiles.find(p => p.bill === REFERENCE_BILL));
  const pbMin = Math.min(...refs.map(p => p.payback)), pbMax = Math.max(...refs.map(p => p.payback));
  const surface = (panels) => panels * CONFIG.PANEL_W_M * CONFIG.PANEL_L_M;
  const medNote = `production d'une ville médiane (${esc(med.name)}, ${num(Y)} kWh par kWc et par an selon PVGIS)`;

  // ── 1. ONEE tariff
  const T = CONFIG.ONEE_TRANCHES;
  const trancheRows = T.map(([upper, price], i) => {
    const low = i === 0 ? 0 : T[i - 1][0] + 1;
    return [upper === Infinity ? `Plus de ${T[i - 1][0]} kWh` : `${low} à ${upper} kWh`, `${price4(price)} MAD`];
  });
  const marginal = (kwh) => T.find(([upper]) => kwh <= upper)[1];
  const consRows = [80, 140, 180, 250, 400, 600].map(k => [`${k} kWh/mois`, `${price4(marginal(k))} MAD`, `${num(marginal(k) * 100)} MAD`]);
  const tarif = {
    slug: "tarif-electricite-onee",
    kicker: "Tarifs",
    h1: "Tarif de l'électricité ONEE par tranche : le prix du kWh",
    title: "Tarif électricité ONEE par tranche : prix du kWh TTC | Wattu",
    answer: `Le prix du kWh résidentiel de l'ONEE va de ${price4(T[0][1])} MAD (jusqu'à ${T[0][0]} kWh par mois) à ${price4(T[T.length - 1][1])} MAD (au-delà de ${T[T.length - 2][0]} kWh), TTC. Plus votre consommation est élevée, plus votre dernier kWh coûte cher, et c'est ce kWh que des panneaux solaires remplacent en premier.`,
    body: `
  <section class="cp-section">
    <h2>Les tranches du tarif résidentiel basse tension</h2>
${tableHtml("Prix TTC par kWh, consommation mensuelle", ["Consommation mensuelle", "Prix du kWh (TTC)"], trancheRows)}
    <p class="cp-note">Au-delà de 150 kWh par mois, la facturation de l'ONEE devient sélective.</p>
  </section>
  <section class="cp-section">
    <h2>Ce que vaut un kWh solaire selon votre consommation</h2>
    <p>Un kWh produit par vos panneaux et consommé sur place vous évite d'acheter le kWh le plus cher de votre facture. Plus vous consommez, plus le solaire est rentable.</p>
${tableHtml("Prix du kWh évité par l'autoconsommation solaire", ["Votre consommation", "Prix du kWh évité", "Valeur de 100 kWh solaires"], consRows)}
    <p>Pour voir ce que cela donne chez vous, <a href="../../">le simulateur</a> part de votre facture en dirhams et en déduit votre consommation.</p>
  </section>`,
    faq: [
      ["Combien coûte le kWh d'électricité au Maroc ?", `Pour un foyer raccordé à l'ONEE, de ${price4(T[0][1])} MAD TTC le kWh pour une petite consommation à ${price4(T[T.length - 1][1])} MAD au-delà de ${T[T.length - 2][0]} kWh par mois.`],
      ["Quelle tranche le solaire fait-il économiser ?", "Les kWh solaires consommés sur place remplacent d'abord les kWh des tranches les plus chères de votre facture. C'est pourquoi le solaire s'amortit plus vite quand la facture est élevée."],
    ],
    sources: ["onee"],
  };

  // ── 2. Installed price
  const sizes = [1, 2, 3, 5, 8, 10];
  const prixRows = sizes.map(k => {
    const panels = Math.ceil(k / CONFIG.PANEL_KWP - 1e-9);
    return [`${kw(k)} kWc`, `${panels}`, `${num(surface(panels))} m²`, `${num(k * 1000 * COST_LOW)} MAD`, `${num(k * 1000 * COST)} MAD`, `${num(k * 1000 * COST_HIGH)} MAD`, `${num(k * Y)} kWh`];
  });
  const prix = {
    slug: "prix-panneau-solaire-maroc",
    kicker: "Prix",
    h1: `Prix d'une installation solaire au Maroc en ${new Date().getUTCFullYear()}`,
    title: "Prix panneau solaire Maroc : combien coûte une installation ? | Wattu",
    answer: `Une installation solaire résidentielle au Maroc coûte en général de ${COST_LOW} à ${COST_HIGH} MAD par watt-crête posé, soit environ ${num(COST * 1000)} MAD par kWc au prix central. Un système de 3 kWc revient ainsi à environ ${num(3000 * COST)} MAD, entre ${num(3000 * COST_LOW)} et ${num(3000 * COST_HIGH)} MAD selon l'installateur et le matériel.`,
    body: `
  <section class="cp-section">
    <h2>Prix selon la puissance installée</h2>
${tableHtml(`Prix posé, panneaux de ${CONFIG.PANEL_KWP * 1000} Wc ; production : ${medNote}`, ["Puissance", "Panneaux", "Surface de toit", `Bas (${COST_LOW} MAD/Wc)`, `Central (${COST} MAD/Wc)`, `Haut (${COST_HIGH} MAD/Wc)`, "Production/an"], prixRows)}
    <p>Le prix posé comprend en général les panneaux, l'onduleur, la structure, le câblage et la pose. Un panneau de ${CONFIG.PANEL_KWP * 1000} Wc revient ainsi à environ ${num(CONFIG.PANEL_KWP * 1000 * COST)} MAD une fois installé, tout compris.</p>
  </section>
  <section class="cp-section">
    <h2>En combien de temps l'installation est-elle remboursée&nbsp;?</h2>
    <p>Pour une facture de ${REFERENCE_BILL} MAD par mois et un prix de ${COST} MAD/Wc, l'installation s'amortit en ${dec(pbMin)} à ${dec(pbMax)} ans selon la ville, puis continue de produire pendant une vingtaine d'années. <a href="../../villes/">Le détail par ville</a> donne le calcul pour ${all.length} villes.</p>
    <p>Un devis nettement au-dessus de ${COST_HIGH} MAD/Wc mérite une question. Comparez au moins trois devis d'<a href="../taqa-pro-installateur/">installateurs labellisés Taqa Pro</a>.</p>
  </section>`,
    faq: [
      ["Combien coûte une installation solaire de 3 kWc au Maroc ?", `Environ ${num(3000 * COST)} MAD posée, entre ${num(3000 * COST_LOW)} et ${num(3000 * COST_HIGH)} MAD selon l'installateur. Elle produit de l'ordre de ${num(3 * Y)} kWh par an.`],
      ["Quel est le prix d'un panneau solaire au Maroc ?", `Installé et raccordé, un panneau de ${CONFIG.PANEL_KWP * 1000} Wc représente environ ${num(CONFIG.PANEL_KWP * 1000 * COST)} MAD au prix central de ${COST} MAD par watt-crête, onduleur et pose compris.`],
    ],
    sources: ["cost", "pvgis"],
  };

  // ── 3. How many panels
  const billsN = [200, 300, 400, 500, 700, 1000, 1500];
  const nb = billsN.map(b => profile(med.result, b));
  const nb500 = nb.find(p => p.bill === 500);
  const nbRows = nb.map(p => [`${num(p.bill)} MAD/mois`, `${num(p.consumption)} kWh/mois`, `${kw(p.kwp)} kWc`, `${p.panels}`, `${num(surface(p.panels))} m²`, `${num(p.capex)} MAD`, `${num(p.savings)} MAD`, years(p.payback)]);
  const combien = {
    slug: "combien-de-panneaux-solaires",
    kicker: "Dimensionnement",
    h1: "Combien de panneaux solaires pour ma facture d'électricité ?",
    title: "Combien de panneaux solaires pour une maison au Maroc ? | Wattu",
    answer: `Pour une facture ONEE de 500 MAD par mois, il faut environ ${kw(nb500.kwp)} kWc, soit ${nb500.panels} panneaux de ${CONFIG.PANEL_KWP * 1000} Wc et environ ${num(surface(nb500.panels))} m² de toit. Ce système coûte près de ${num(nb500.capex)} MAD et économise environ ${num(nb500.savings)} MAD par an.`,
    body: `
  <section class="cp-section">
    <h2>Nombre de panneaux selon votre facture</h2>
${tableHtml(`Système couvrant environ ${Math.round(CONFIG.AUTOSIZE_COVER * 100)} % de la consommation annuelle, ${COST} MAD/Wc, sans revente ; ${medNote}`, ["Facture ONEE", "Consommation", "Puissance", "Panneaux", "Surface de toit", "Investissement", "Économie an 1", "Amortissement"], nbRows)}
    <p class="cp-note">La puissance est plafonnée à 10 kWc, ce qui reste sous le seuil de 11 kW de la <a href="../loi-82-21-autoproduction/">simple déclaration prévue par la loi 82-21</a>. Les surfaces comptent les panneaux seuls&nbsp;: prévoyez une marge autour, et de l'espace entre les rangées sur un toit plat.</p>
  </section>
  <section class="cp-section">
    <h2>Pourquoi ne pas couvrir 100&nbsp;% de la consommation&nbsp;?</h2>
    <p>Les panneaux produisent le jour, alors qu'une partie de la consommation a lieu le soir. Au-delà d'environ ${Math.round(CONFIG.AUTOSIZE_COVER * 100)}&nbsp;% de couverture, une part croissante de la production part sur le réseau, où elle est peu rémunérée. Un système plus petit, consommé presque entièrement sur place, s'amortit plus vite.</p>
    <p>Pour votre toit précis, <a href="../../">le simulateur</a> repère le contour du bâtiment et indique combien de panneaux y tiennent.</p>
  </section>`,
    faq: [
      ["Combien de panneaux solaires faut-il pour une maison ?", `Cela dépend de la facture&nbsp;: environ ${nb.find(p => p.bill === 300).panels} panneaux pour 300 MAD par mois, ${nb500.panels} pour 500 MAD et ${nb.find(p => p.bill === 1000).panels} pour 1 000 MAD, avec des panneaux de ${CONFIG.PANEL_KWP * 1000} Wc.`.replace("&nbsp;", " ")],
      ["Quelle surface de toit pour des panneaux solaires ?", `Environ ${dec(CONFIG.PANEL_W_M * CONFIG.PANEL_L_M)} m² par panneau de ${CONFIG.PANEL_KWP * 1000} Wc, soit ${num(surface(2))} m² par kWc, sans compter les marges et l'espacement des rangées.`],
    ],
    sources: ["onee", "pvgis"],
  };

  // ── 4. Law 82-21
  const capexRef = nb500.kwp * 1000 * COST;
  const pvRef = PVGIS.scale(med.result, nb500.kwp);
  const withX = ROI.compute({ pv: pvRef, monthlyConsumption: nb500.consumption, capexMAD: capexRef, exportAllowed: true });
  const extra = withX.annualSavingsMAD - nb500.savings;
  const loi = {
    slug: "loi-82-21-autoproduction",
    kicker: "Réglementation",
    h1: "Loi 82-21 : produire et revendre son électricité solaire au Maroc",
    title: "Loi 82-21 autoproduction : panneaux solaires et revente du surplus | Wattu",
    answer: `La loi 82-21 permet aux particuliers de produire leur propre électricité. Depuis le décret n° 2.25.100 du 5 mars 2026, une installation de moins de 11 kW se fait sur simple déclaration, et le surplus injecté sur le réseau est plafonné à ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)} % de la production annuelle.`,
    body: `
  <section class="cp-section">
    <h2>Ce que la loi change pour une maison</h2>
    <ul class="cp-method">
      <li><strong>Moins de 11 kW&nbsp;:</strong> une simple déclaration suffit pour installer des panneaux et consommer l'électricité produite. Les systèmes résidentiels courants (2 à 10 kWc) sont concernés.</li>
      <li><strong>Revente du surplus&nbsp;:</strong> l'électricité non consommée peut être injectée sur le réseau, dans la limite de ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)}&nbsp;% de la production de l'année.</li>
      <li><strong>Prix de rachat&nbsp;:</strong> le tarif résidentiel n'est pas encore publié. La référence disponible est d'environ ${price2(CONFIG.EXPORT_PRICE_MAD_PER_KWH)}&nbsp;MAD par kWh (tarif moyenne tension en heures creuses), à prendre comme un maximum.</li>
    </ul>
  </section>
  <section class="cp-section">
    <h2>Combien rapporte la revente&nbsp;?</h2>
    <p>Peu, comparé à l'autoconsommation. Prenons une facture de 500 MAD par mois, un système de ${kw(nb500.kwp)} kWc et la ${medNote}&nbsp;: consommer sa production fait économiser environ ${num(nb500.savings)} MAD par an, et revendre le surplus ajouterait au plus ${num(extra)} MAD par an.</p>
    <p>Un kWh consommé sur place évite un kWh acheté entre ${price4(CONFIG.ONEE_TRANCHES[0][1])} et ${price4(CONFIG.ONEE_TRANCHES[CONFIG.ONEE_TRANCHES.length - 1][1])} MAD (<a href="../tarif-electricite-onee/">tarifs ONEE</a>), contre environ ${price2(CONFIG.EXPORT_PRICE_MAD_PER_KWH)} MAD pour un kWh revendu. Mieux vaut dimensionner l'installation pour consommer sa production&nbsp;: c'est ce que fait <a href="../../">le simulateur</a>.</p>
  </section>`,
    faq: [
      ["Faut-il une autorisation pour installer des panneaux solaires chez soi au Maroc ?", "Depuis le décret n° 2.25.100 du 5 mars 2026 pris pour la loi 82-21, une installation de moins de 11 kW se fait sur simple déclaration."],
      ["Peut-on revendre son électricité solaire au Maroc ?", `Oui, la loi 82-21 autorise l'injection du surplus sur le réseau, plafonnée à ${Math.round(CONFIG.EXPORT_CAP_PCT * 100)} % de la production annuelle. Le tarif de rachat résidentiel n'est pas encore publié ; la référence disponible est d'environ ${price2(CONFIG.EXPORT_PRICE_MAD_PER_KWH)} MAD par kWh.`],
    ],
    sources: ["decret", "onee", "pvgis"],
  };

  // ── 5. Taqa Pro
  const taqa = {
    slug: "taqa-pro-installateur",
    kicker: "Installateurs",
    h1: "Taqa Pro : choisir un installateur solaire labellisé au Maroc",
    title: "Taqa Pro : trouver un installateur solaire labellisé au Maroc | Wattu",
    answer: "Taqa Pro est le label qualité des installateurs solaires au Maroc, lancé en 2018 par l'AMEE (Agence marocaine pour l'efficacité énergétique), l'AMISOLE et le Cluster solaire. Les entreprises labellisées ont suivi une formation, réussi un examen final et signé une charte éthique, et leurs installations peuvent être auditées.",
    body: `
  <section class="cp-section">
    <h2>Vérifier qu'un installateur est labellisé</h2>
    <p>Le label est le seul repère indépendant de qualité pour les installateurs photovoltaïques au Maroc. La <a href="${SOURCES.taqa[1]}" rel="nofollow noopener">liste officielle des entreprises labellisées</a> est publiée sur le site Taqa Pro&nbsp;: vérifiez-y le nom de l'entreprise avant de signer.</p>
  </section>
  <section class="cp-section">
    <h2>Comparer les devis</h2>
    <ul class="cp-method">
      <li><strong>Demandez au moins trois devis</strong>, pour la même puissance en kWc.</li>
      <li><strong>Ramenez chaque devis au prix par watt-crête</strong> (prix total ÷ puissance en Wc). La fourchette courante est de ${COST_LOW} à ${COST_HIGH} MAD/Wc posé (<a href="../prix-panneau-solaire-maroc/">détail des prix</a>). Un devis nettement au-dessus mérite une question.</li>
      <li><strong>Comparez la production annoncée</strong> à une estimation indépendante&nbsp;: <a href="../../">le simulateur</a> la calcule pour votre adresse avec PVGIS, et son PDF peut accompagner votre demande de devis.</li>
      <li><strong>Déclarez l'installation</strong>&nbsp;: sous 11 kW, une simple déclaration suffit (<a href="../loi-82-21-autoproduction/">loi 82-21</a>).</li>
    </ul>
    <p class="cp-note">Wattu ne vend pas d'installation et ne perçoit aucune commission.</p>
  </section>`,
    faq: [
      ["Comment choisir un installateur de panneaux solaires au Maroc ?", "Choisissez une entreprise labellisée Taqa Pro (liste officielle sur taqapro.ma), demandez au moins trois devis pour la même puissance et comparez-les en prix par watt-crête."],
      ["Qui délivre le label Taqa Pro ?", "Le label Taqa Pro est porté par l'AMEE, l'AMISOLE et le Cluster solaire, depuis 2018."],
    ],
    sources: ["taqa", "cost"],
  };

  return [combien, prix, tarif, loi, taqa];
}

// ── Guides in Arabic and English (/ar/guide/<slug>/, /en/guide/<slug>/) ──
// Same facts and figures as the French guides. Arabic keeps the French
// slugs; English gets English ones. A guide's key is its French slug.
const EN_GUIDE_SLUG = {
  "combien-de-panneaux-solaires": "how-many-solar-panels",
  "prix-panneau-solaire-maroc": "solar-panel-cost-morocco",
  "tarif-electricite-onee": "onee-electricity-tariff",
  "loi-82-21-autoproduction": "law-82-21-self-generation",
  "taqa-pro-installateur": "taqa-pro-installers",
};
const altGuide = (key) => ({ fr: `/guide/${key}/`, ar: `/ar/guide/${key}/`, en: `/en/guide/${EN_GUIDE_SLUG[key]}/` });
const ALT_GUIDE_INDEX = { fr: "/guide/", ar: "/ar/guide/", en: "/en/guide/" };
const price2En = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price4En = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const SOURCES_AR = {
  onee: "تعريفة ONEE ديال الديور (kherba.com)",
  cost: "أثمنة الطاقة الشمسية فالديور فالمغرب (lechantier.ma، ماي 2026)",
  pvgis: "PVGIS، المفوضية الأوروبية",
  taqa: "اللائحة الرسمية ديال الشركات اللي عندها العلامة Taqa Pro",
  decret: "المرسوم رقم 2.25.100 ديال 5 مارس 2026 لتطبيق القانون 82-21",
};
const SOURCES_EN = {
  onee: "ONEE residential tariff (kherba.com)",
  cost: "Home solar prices in Morocco (lechantier.ma, May 2026)",
  pvgis: "PVGIS, European Commission",
  taqa: "Official list of Taqa Pro certified companies",
  decret: "Decree No. 2.25.100 of 5 March 2026 implementing Law 82-21",
};
const sourceLink = (k, label) => SOURCES[k][1] ? `<a href="${SOURCES[k][1]}" rel="nofollow noopener">${esc(label)}</a>` : esc(label);
const sourcesHtmlL = (keys, lang) => lang === "ar"
  ? `<p class="cp-meta">المصادر: ${keys.map(k => sourceLink(k, SOURCES_AR[k])).join(" · ")}. تحدّث نهار <time datetime="${today}">${todayAr}</time> من طرف <span lang="fr">${AUTHOR}</span>.</p>`
  : lang === "en"
  ? `<p class="cp-meta">Sources: ${keys.map(k => sourceLink(k, SOURCES_EN[k])).join(" · ")}. Updated <time datetime="${today}">${todayEn}</time> by ${AUTHOR}.</p>`
  : sourcesHtml(keys);

// The numbers every guide rests on, whatever the language.
function guideFacts(all) {
  const byYield = [...all].sort((a, b) => a.result.yieldPerKw - b.result.yieldPerKw);
  const med = byYield[Math.floor(byYield.length / 2)];
  const refs = all.map(c => c.result.profiles.find(p => p.bill === REFERENCE_BILL));
  const T = CONFIG.ONEE_TRANCHES;
  const nb = [200, 300, 400, 500, 700, 1000, 1500].map(b => profile(med.result, b));
  const nb500 = nb.find(p => p.bill === 500);
  const pvRef = PVGIS.scale(med.result, nb500.kwp);
  const withX = ROI.compute({ pv: pvRef, monthlyConsumption: nb500.consumption, capexMAD: nb500.kwp * 1000 * COST, exportAllowed: true });
  return {
    med, Y: med.result.yieldPerKw,
    pbMin: Math.min(...refs.map(p => p.payback)), pbMax: Math.max(...refs.map(p => p.payback)),
    surface: (panels) => panels * CONFIG.PANEL_W_M * CONFIG.PANEL_L_M,
    T, p0: T[0][1], pL: T[T.length - 1][1], first: T[0][0], last: T[T.length - 2][0],
    marginal: (kwh) => T.find(([upper]) => kwh <= upper)[1],
    consKwh: [80, 140, 180, 250, 400, 600],
    sizes: [1, 2, 3, 5, 8, 10],
    nb, nb500, nbOf: (bill) => nb.find(p => p.bill === bill),
    extra: withX.annualSavingsMAD - nb500.savings,
    cap: Math.round(CONFIG.EXPORT_CAP_PCT * 100), cover: Math.round(CONFIG.AUTOSIZE_COVER * 100),
    panelW: CONFIG.PANEL_KWP * 1000, exportPrice: CONFIG.EXPORT_PRICE_MAD_PER_KWH,
    year: new Date().getUTCFullYear(), n: all.length,
  };
}

const GUIDE_L = {
  fr: { depth: 2, root: "../../", home: "Wattu Solaire", crumbs: "Fil d'Ariane", sep: "›", guides: "Guides", kicker: "Guide",
        cta: "Calculer pour mon adresse →", note: "", faq: "Questions fréquentes", others: "Autres guides",
        cities: ["../../villes/", "Rentabilité du solaire ville par ville →"], inLang: "fr-MA", base: "/guide/" },
  ar: { depth: 3, root: "../../../", home: "Wattu", crumbs: "فين كاين", sep: "‹", guides: "شروحات", kicker: "شرح",
        cta: "حسب لدارك ←", note: "المحاكي متوفر دابا غير بالفرنسية.", faq: "الأسئلة اللي كيسولو الناس", others: "شروحات خرين",
        cities: ["../../villes/", "شحال كتربح الطاقة الشمسية فكل مدينة ←"], inLang: "ar-MA", base: "/ar/guide/" },
  en: { depth: 3, root: "../../../", home: "Wattu Solar", crumbs: "Breadcrumb", sep: "›", guides: "Guides", kicker: "Guide",
        cta: "Calculate for my address →", note: "The simulator is in French for now.", faq: "Frequently asked questions", others: "Other guides",
        cities: ["../../cities/", "Solar payback, city by city →"], inLang: "en", base: "/en/guide/" },
};

function guidesAr(all) {
  const f = guideFacts(all);
  const medNote = `الإنتاج ديال مدينة متوسطة (${esc(f.med.name_ar)}، ${num(f.Y)} ${KWH} لكل ${KWC} فالعام حسب PVGIS)`;

  const tarif = {
    key: "tarif-electricite-onee", slug: "tarif-electricite-onee", kicker: "التعريفة",
    h1: "تعريفة الضو ديال ONEE حسب الأشطر: شحال كيسوا الكيلوواط ساعة",
    title: "تعريفة الكهرباء ONEE حسب الأشطر: ثمن الكيلوواط ساعة | Wattu",
    answer: `الثمن ديال الكيلوواط ساعة فالديور عند المكتب الوطني للكهرباء (ONEE) كيبدا من ${price4(f.p0)} ${MAD_AR} (حتى ل${f.first} ${KWH} فالشهر) ويوصل ل${price4(f.pL)} ${MAD_AR} (فوق ${f.last} ${KWH})، مع الضرائب. كلما كتستهلك كثر، كيغلا عليك الكيلوواط الأخير، وهو هذا اللي كتعوضو البلاكات الشمسية الأول.`,
    body: `
  <section class="cp-section">
    <h2>الأشطر ديال تعريفة الديور (الجهد المنخفض)</h2>
${tableHtml("الثمن مع الضرائب لكل كيلوواط ساعة، حسب الاستهلاك ديال الشهر", ["الاستهلاك فالشهر", "ثمن الكيلوواط ساعة (مع الضرائب)"],
  f.T.map(([upper, price], i) => [upper === Infinity ? `كثر من ${f.T[i - 1][0]} ${KWH}` : `من ${i === 0 ? 0 : f.T[i - 1][0] + 1} حتى ل${upper} ${KWH}`, `${price4(price)} ${MAD_AR}`]))}
    <p class="cp-note">فوق 150 ${KWH} فالشهر، الفوترة ديال ONEE كتولي انتقائية.</p>
  </section>
  <section class="cp-section">
    <h2>شحال كيسوا كيلوواط ساعة شمسي حسب الاستهلاك ديالك</h2>
    <p>كل كيلوواط ساعة كتنتجو البلاكات وكتستهلكو فالدار كيوفر عليك تشري الكيلوواط الغالي فالفاتورة. كلما كتستهلك كثر، كلما الطاقة الشمسية كتربح كثر.</p>
${tableHtml("ثمن الكيلوواط اللي كتوفر بالاستهلاك الذاتي", ["الاستهلاك ديالك", "ثمن الكيلوواط اللي كتوفر", "شحال كتسوا 100 كيلوواط ساعة شمسية"],
  f.consKwh.map(k => [`${k} ${KWH}/الشهر`, `${price4(f.marginal(k))} ${MAD_AR}`, `${num(f.marginal(k) * 100)} ${MAD_AR}`]))}
    <p>باش تشوف شنو كيعطي عندك، <a href="../../../">المحاكي</a> كيبدا من الفاتورة ديالك بالدرهم وكيحسب منها الاستهلاك.</p>
  </section>`,
    faq: [
      ["شحال كيسوا الكيلوواط ساعة ديال الضو فالمغرب؟", `لدار مربوطة مع ONEE، من ${price4(f.p0)} ${MAD_AR} للكيلوواط ساعة مع الضرائب للاستهلاك الصغير حتى ل${price4(f.pL)} ${MAD_AR} فوق ${f.last} ${KWH} فالشهر.`],
      ["أشمن شطر كتوفر عليك الطاقة الشمسية؟", "الكيلوواط الشمسي اللي كتستهلك فالدار كيعوض الأول الكيلوواطات ديال الأشطر الغالية فالفاتورة. داكشي علاش الطاقة الشمسية كترجع فلوسها بالزربة ملي الفاتورة كتكون كبيرة."],
    ],
    sources: ["onee"],
  };

  const prix = {
    key: "prix-panneau-solaire-maroc", slug: "prix-panneau-solaire-maroc", kicker: "الثمن",
    h1: `شحال كيسوا تركيب الطاقة الشمسية فالمغرب ف${f.year}`,
    title: "ثمن البلاكات الشمسية فالمغرب: شحال كيكلف التركيب؟ | Wattu",
    answer: `تركيب الطاقة الشمسية فالدار فالمغرب كيكلف عادة بين ${COST_LOW} و${COST_HIGH} ${MAD_AR} للواط مركّب، يعني تقريبا ${num(COST * 1000)} ${MAD_AR} لكل ${KWC} بالثمن المتوسط. تركيب ديال 3 ${KWC} كيجي تقريبا ${num(3000 * COST)} ${MAD_AR}، بين ${num(3000 * COST_LOW)} و${num(3000 * COST_HIGH)} ${MAD_AR} حسب المركّب والسلعة.`,
    body: `
  <section class="cp-section">
    <h2>الثمن حسب القوة</h2>
${tableHtml(`ثمن التركيب، بلاكات ديال ${f.panelW} واط؛ الإنتاج: ${medNote}`, ["القوة", "البلاكات", "مساحة السطح", `رخيص (${COST_LOW} ${MAD_AR}/واط)`, `متوسط (${COST} ${MAD_AR}/واط)`, `غالي (${COST_HIGH} ${MAD_AR}/واط)`, "الإنتاج فالعام"],
  f.sizes.map(k => { const p = Math.ceil(k / CONFIG.PANEL_KWP - 1e-9); return [`${kw(k)} ${KWC}`, `${p}`, `${num(f.surface(p))} م²`, `${num(k * 1000 * COST_LOW)} ${MAD_AR}`, `${num(k * 1000 * COST)} ${MAD_AR}`, `${num(k * 1000 * COST_HIGH)} ${MAD_AR}`, `${num(k * f.Y)} ${KWH}`]; }))}
    <p>ثمن التركيب عادة كيدخل فيه البلاكات، الأوندولور، الستريكتور، الكابلاج والخدمة. يعني بلاكة ديال ${f.panelW} واط كتجي تقريبا ${num(f.panelW * COST)} ${MAD_AR} مركّبة، كلشي داخل.</p>
  </section>
  <section class="cp-section">
    <h2>فشحال ديال الوقت كترجع فلوسك؟</h2>
    <p>بفاتورة ديال ${REFERENCE_BILL} ${MAD_AR} فالشهر وثمن ديال ${COST} ${MAD_AR} للواط، التركيب كيرجع فلوسو ف${dec(f.pbMin)} حتى ل${dec(f.pbMax)} عام حسب المدينة، ومن بعد كيبقى ينتج تقريبا عشرين عام آخرين. <a href="../../villes/">التفاصيل حسب المدينة</a> فيها الحساب ديال ${f.n} مدينة.</p>
    <p>إلا جاك دوفي غالي بزاف على ${COST_HIGH} ${MAD_AR} للواط، سول علاش. قارن على الأقل بين 3 ديال الدوفيات ديال <a href="../taqa-pro-installateur/">مركّبين عندهم العلامة Taqa Pro</a>.</p>
  </section>`,
    faq: [
      [`شحال كيكلف تركيب ديال 3 ${KWC} فالمغرب؟`, `تقريبا ${num(3000 * COST)} ${MAD_AR} مركّب، بين ${num(3000 * COST_LOW)} و${num(3000 * COST_HIGH)} ${MAD_AR} حسب المركّب. وكينتج تقريبا ${num(3 * f.Y)} ${KWH} فالعام.`],
      ["شحال كيسوا البلاكة الشمسية فالمغرب؟", `مركّبة ومربوطة، بلاكة ديال ${f.panelW} واط كتجي تقريبا ${num(f.panelW * COST)} ${MAD_AR} بالثمن المتوسط ديال ${COST} ${MAD_AR} للواط، مع الأوندولور والخدمة.`],
    ],
    sources: ["cost", "pvgis"],
  };

  const combien = {
    key: "combien-de-panneaux-solaires", slug: "combien-de-panneaux-solaires", kicker: "الحجم",
    h1: "شحال ديال البلاكات الشمسية خاصني على حساب فاتورة الضو؟",
    title: "شحال ديال البلاكات الشمسية خاص الدار فالمغرب؟ | Wattu",
    answer: `لفاتورة ديال ${REFERENCE_BILL} ${MAD_AR} فالشهر، خاصك تقريبا ${kw(f.nb500.kwp)} ${KWC}، يعني ${panelsAr(f.nb500.panels)} ديال ${f.panelW} واط وتقريبا ${num(f.surface(f.nb500.panels))} م² فالسطح. هاد التركيب كيكلف قريب ${num(f.nb500.capex)} ${MAD_AR} وكيوفر تقريبا ${num(f.nb500.savings)} ${MAD_AR} فالعام.`,
    body: `
  <section class="cp-section">
    <h2>شحال ديال البلاكات حسب الفاتورة ديالك</h2>
${tableHtml(`تركيب كيغطي تقريبا ${f.cover}% من الاستهلاك ديال العام، ${COST} ${MAD_AR} للواط، بلا بيع؛ ${medNote}`, ["فاتورة الضو", "الاستهلاك", "القوة", "البلاكات", "مساحة السطح", "ثمن التركيب", "التوفير فالعام الأول", "فوقاش كترجع فلوسك"],
  f.nb.map(p => [`${num(p.bill)} ${MAD_AR}/الشهر`, `${num(p.consumption)} ${KWH}/الشهر`, `${kw(p.kwp)} ${KWC}`, `${p.panels}`, `${num(f.surface(p.panels))} م²`, `${num(p.capex)} ${MAD_AR}`, `${num(p.savings)} ${MAD_AR}`, yearsAr(p.payback)]))}
    <p class="cp-note">القوة محدودة ف10 ${KWC}، يعني تحت الحد ديال 11 كيلوواط ديال <a href="../loi-82-21-autoproduction/">التصريح البسيط اللي جا بيه القانون 82-21</a>. المساحات محسوبة غير للبلاكات: خلي شوية ديال البلاصة دايرة بيهم، والمسافة بين الصفوف إلا كان السطح مستوي.</p>
  </section>
  <section class="cp-section">
    <h2>علاش ما نغطيوش 100% من الاستهلاك؟</h2>
    <p>البلاكات كتنتج فالنهار، والدار كتستهلك جزء فالليل. فوق تقريبا ${f.cover}% ديال التغطية، جزء كبير من الإنتاج كيمشي للشبكة، وتما ما كيتخلصش مزيان. تركيب صغير اللي كتستهلكو تقريبا كامل فالدار كيرجع فلوسو بالزربة.</p>
    <p>للسطح ديالك بالضبط، <a href="../../../">المحاكي</a> كيلقى الحدود ديال الدار وكيقول ليك شحال ديال البلاكات كيدخلو.</p>
  </section>`,
    faq: [
      ["شحال ديال البلاكات الشمسية خاص الدار؟", `على حساب الفاتورة: تقريبا ${panelsAr(f.nbOf(300).panels)} لفاتورة 300 ${MAD_AR}، ${panelsAr(f.nb500.panels)} ل500 ${MAD_AR} و${panelsAr(f.nbOf(1000).panels)} ل1000 ${MAD_AR}، ببلاكات ديال ${f.panelW} واط.`],
      ["شحال ديال المساحة خاصها البلاكات الشمسية فالسطح؟", `تقريبا ${dec(CONFIG.PANEL_W_M * CONFIG.PANEL_L_M)} م² لكل بلاكة ديال ${f.panelW} واط، يعني ${num(f.surface(2))} م² لكل ${KWC}، بلا ما نحسبو الهوامش والمسافة بين الصفوف.`],
    ],
    sources: ["onee", "pvgis"],
  };

  const loi = {
    key: "loi-82-21-autoproduction", slug: "loi-82-21-autoproduction", kicker: "القانون",
    h1: "القانون 82-21: تنتج الضو ديالك وتبيع الزايد فالمغرب",
    title: "القانون 82-21 ديال الإنتاج الذاتي: البلاكات الشمسية وبيع الفائض | Wattu",
    answer: `القانون 82-21 كيسمح للناس ينتجو الضو ديالهم بوحدهم. من نهار المرسوم رقم 2.25.100 ديال 5 مارس 2026، التركيب اللي تحت 11 كيلوواط كيكفيه تصريح بسيط، والفائض اللي كيدخل للشبكة ماشي كثر من ${f.cap}% من الإنتاج ديال العام.`,
    body: `
  <section class="cp-section">
    <h2>شنو بدّل القانون للدار</h2>
    <ul class="cp-method">
      <li><strong>تحت 11 كيلوواط:</strong> تصريح بسيط كافي باش تركب البلاكات وتستهلك الضو اللي كتنتج. التركيبات العادية ديال الديور (من 2 حتى ل10 ${KWC}) داخلين فهادشي.</li>
      <li><strong>بيع الفائض:</strong> الضو اللي ما استهلكتيش يقدر يدخل للشبكة، ولكن ماشي كثر من ${f.cap}% من الإنتاج ديال العام.</li>
      <li><strong>ثمن الشراء:</strong> التعريفة ديال الديور مازال ما تنشراتش. المرجع اللي كاين هو تقريبا ${price2(f.exportPrice)} ${MAD_AR} للكيلوواط ساعة (تعريفة الجهد المتوسط فالساعات الخاوية)، وخودو كحد أقصى.</li>
    </ul>
  </section>
  <section class="cp-section">
    <h2>شحال كتربح من البيع؟</h2>
    <p>قليل، إلا قارنتيه مع الاستهلاك ديالك. خود فاتورة ديال ${REFERENCE_BILL} ${MAD_AR} فالشهر، تركيب ديال ${kw(f.nb500.kwp)} ${KWC} و${medNote}: إلا استهلكتي الإنتاج ديالك كتوفر تقريبا ${num(f.nb500.savings)} ${MAD_AR} فالعام، والبيع ديال الفائض غادي يزيد على الأكثر ${num(f.extra)} ${MAD_AR} فالعام.</p>
    <p>كل كيلوواط ساعة كتستهلكو فالدار كيوفر عليك كيلوواط كان غادي تشريه بين ${price4(f.p0)} و${price4(f.pL)} ${MAD_AR} (<a href="../tarif-electricite-onee/">تعريفة ONEE</a>)، والكيلوواط اللي كتبيع كيجيب تقريبا ${price2(f.exportPrice)} ${MAD_AR}. حسن ليك تختار حجم التركيب على قد الاستهلاك ديالك، وهادشي اللي كيدير <a href="../../../">المحاكي</a>.</p>
  </section>`,
    faq: [
      ["واش خاصني رخصة باش نركب البلاكات الشمسية فداري فالمغرب؟", "من نهار المرسوم رقم 2.25.100 ديال 5 مارس 2026 اللي جا مع القانون 82-21، التركيب اللي تحت 11 كيلوواط كيكفيه تصريح بسيط."],
      ["واش نقدر نبيع الضو الشمسي ديالي فالمغرب؟", `إيه، القانون 82-21 كيسمح تدخّل الفائض للشبكة، ماشي كثر من ${f.cap}% من الإنتاج ديال العام. التعريفة ديال الشراء من الديور مازال ما تنشراتش؛ المرجع اللي كاين هو تقريبا ${price2(f.exportPrice)} ${MAD_AR} للكيلوواط ساعة.`],
    ],
    sources: ["decret", "onee", "pvgis"],
  };

  const taqa = {
    key: "taqa-pro-installateur", slug: "taqa-pro-installateur", kicker: "المركّبين",
    h1: "Taqa Pro: كيفاش تختار مركّب ديال الطاقة الشمسية عندو العلامة فالمغرب",
    title: "Taqa Pro: لقا مركّب ديال الطاقة الشمسية معتمد فالمغرب | Wattu",
    answer: "Taqa Pro هي علامة الجودة ديال المركّبين ديال الطاقة الشمسية فالمغرب، طلقاتها ف2018 الوكالة المغربية للنجاعة الطاقية (AMEE)، والجمعية AMISOLE والكلوستر الشمسي. الشركات اللي عندها العلامة دازو من تكوين، نجحو فامتحان نهائي ووقعو على ميثاق أخلاقي، والتركيبات ديالهم تقدر تتراقب.",
    body: `
  <section class="cp-section">
    <h2>تأكد بلي المركّب عندو العلامة</h2>
    <p>العلامة هي المرجع المستقل الوحيد ديال الجودة للمركّبين ديال البلاكات فالمغرب. <a href="${SOURCES.taqa[1]}" rel="nofollow noopener">اللائحة الرسمية ديال الشركات اللي عندها العلامة</a> منشورة فالموقع ديال Taqa Pro: قلّب فيها على السمية ديال الشركة قبل ما توقع.</p>
  </section>
  <section class="cp-section">
    <h2>قارن بين الدوفيات</h2>
    <ul class="cp-method">
      <li><strong>طلب على الأقل 3 ديال الدوفيات</strong>، لنفس القوة ب${KWC}.</li>
      <li><strong>حسب الثمن ديال كل دوفي للواط</strong> (الثمن الكامل ÷ القوة بالواط). الثمن العادي بين ${COST_LOW} و${COST_HIGH} ${MAD_AR} للواط مركّب (<a href="../prix-panneau-solaire-maroc/">تفاصيل الأثمنة</a>). دوفي غالي بزاف كيستاهل سؤال.</li>
      <li><strong>قارن الإنتاج اللي عطاك المركّب</strong> مع تقدير مستقل: <a href="../../../">المحاكي</a> كيحسبو للعنوان ديالك ب PVGIS، والـPDF ديالو تقدر تزيدو مع الطلب ديال الدوفي.</li>
      <li><strong>صرّح بالتركيب</strong>: تحت 11 كيلوواط، تصريح بسيط كافي (<a href="../loi-82-21-autoproduction/">القانون 82-21</a>).</li>
    </ul>
    <p class="cp-note"><span lang="fr">Wattu</span> ما كتبيعش التركيبات وما كتاخد حتى عمولة.</p>
  </section>`,
    faq: [
      ["كيفاش نختار مركّب ديال البلاكات الشمسية فالمغرب؟", "ختار شركة عندها العلامة Taqa Pro (اللائحة الرسمية فـ taqapro.ma)، طلب على الأقل 3 ديال الدوفيات لنفس القوة، وقارنهم بالثمن ديال الواط."],
      ["شكون اللي كيعطي العلامة Taqa Pro؟", "العلامة Taqa Pro كتسيرها الوكالة المغربية للنجاعة الطاقية (AMEE)، AMISOLE والكلوستر الشمسي، من 2018."],
    ],
    sources: ["taqa", "cost"],
  };

  return [combien, prix, tarif, loi, taqa];
}

function guidesEn(all) {
  const f = guideFacts(all);
  const S = EN_GUIDE_SLUG;
  const medNote = `output of a median city (${esc(f.med.name_en)}, ${numEn(f.Y)} kWh per kWp per year per PVGIS)`;

  const tarif = {
    key: "tarif-electricite-onee", slug: S["tarif-electricite-onee"], kicker: "Tariffs",
    h1: "ONEE electricity tariff by tranche: the price per kWh",
    title: "ONEE electricity tariff in Morocco: price per kWh by tranche | Wattu",
    answer: `ONEE's residential electricity price runs from ${price4En(f.p0)} MAD per kWh (up to ${f.first} kWh a month) to ${price4En(f.pL)} MAD (above ${f.last} kWh), tax included. The more you use, the more your last kWh costs, and that is the kWh solar panels replace first.`,
    body: `
  <section class="cp-section">
    <h2>Residential low-voltage tariff tranches</h2>
${tableHtml("Price per kWh including tax, by monthly consumption", ["Monthly consumption", "Price per kWh (incl. tax)"],
  f.T.map(([upper, price], i) => [upper === Infinity ? `Over ${f.T[i - 1][0]} kWh` : `${i === 0 ? 0 : f.T[i - 1][0] + 1}–${upper} kWh`, `${price4En(price)} MAD`]))}
    <p class="cp-note">Above 150 kWh a month, ONEE switches to selective billing.</p>
  </section>
  <section class="cp-section">
    <h2>What a solar kWh is worth, by consumption</h2>
    <p>Each kWh your panels produce and you use at home saves you buying the most expensive kWh on your bill. The more you use, the more solar pays.</p>
${tableHtml("Price of the kWh avoided by using your own solar power", ["Your consumption", "Price of the kWh avoided", "Value of 100 solar kWh"],
  f.consKwh.map(k => [`${k} kWh/month`, `${price4En(f.marginal(k))} MAD`, `${numEn(f.marginal(k) * 100)} MAD`]))}
    <p>To see what it means for you, <a href="../../../">the simulator</a> starts from your bill in dirhams and works out your consumption.</p>
  </section>`,
    faq: [
      ["How much does electricity cost per kWh in Morocco?", `For a household on the ONEE grid, from ${price4En(f.p0)} MAD per kWh including tax for small consumption to ${price4En(f.pL)} MAD above ${f.last} kWh a month.`],
      ["Which tranche does solar save you?", "The solar kWh you use at home replace the kWh of the most expensive tranches on your bill first. That is why solar pays back faster when the bill is high."],
    ],
    sources: ["onee"],
  };

  const prix = {
    key: "prix-panneau-solaire-maroc", slug: S["prix-panneau-solaire-maroc"], kicker: "Cost",
    h1: `How much does a home solar system cost in Morocco in ${f.year}?`,
    title: "Solar panel cost in Morocco: what a home installation costs | Wattu",
    answer: `A home solar installation in Morocco usually costs ${COST_LOW} to ${COST_HIGH} MAD per installed watt-peak, about ${numEn(COST * 1000)} MAD per kWp at the mid price. A 3 kWp system therefore comes to about ${numEn(3000 * COST)} MAD, between ${numEn(3000 * COST_LOW)} and ${numEn(3000 * COST_HIGH)} MAD depending on the installer and the equipment.`,
    body: `
  <section class="cp-section">
    <h2>Price by system size</h2>
${tableHtml(`Installed price, ${f.panelW} Wp panels; output: ${medNote}`, ["System size", "Panels", "Roof area", `Low (${COST_LOW} MAD/Wp)`, `Mid (${COST} MAD/Wp)`, `High (${COST_HIGH} MAD/Wp)`, "Output/yr"],
  f.sizes.map(k => { const p = Math.ceil(k / CONFIG.PANEL_KWP - 1e-9); return [`${kwEn(k)} kWp`, `${p}`, `${numEn(f.surface(p))} m²`, `${numEn(k * 1000 * COST_LOW)} MAD`, `${numEn(k * 1000 * COST)} MAD`, `${numEn(k * 1000 * COST_HIGH)} MAD`, `${numEn(k * f.Y)} kWh`]; }))}
    <p>The installed price usually covers the panels, the inverter, the mounting structure, the wiring and the labour. A ${f.panelW} Wp panel therefore comes to about ${numEn(f.panelW * COST)} MAD installed, all included.</p>
  </section>
  <section class="cp-section">
    <h2>How long until the system pays for itself?</h2>
    <p>For a ${REFERENCE_BILL} MAD monthly bill at ${COST} MAD/Wp, the system pays for itself in ${decEn(f.pbMin)} to ${decEn(f.pbMax)} years depending on the city, then keeps producing for another twenty years or so. <a href="../../cities/">The city-by-city figures</a> give the calculation for ${f.n} cities.</p>
    <p>A quote well above ${COST_HIGH} MAD/Wp deserves a question. Compare at least three quotes from <a href="../${S["taqa-pro-installateur"]}/">Taqa Pro certified installers</a>.</p>
  </section>`,
    faq: [
      ["How much does a 3 kWp solar system cost in Morocco?", `About ${numEn(3000 * COST)} MAD installed, between ${numEn(3000 * COST_LOW)} and ${numEn(3000 * COST_HIGH)} MAD depending on the installer. It produces around ${numEn(3 * f.Y)} kWh a year.`],
      ["What does a solar panel cost in Morocco?", `Installed and connected, a ${f.panelW} Wp panel comes to about ${numEn(f.panelW * COST)} MAD at the mid price of ${COST} MAD per watt-peak, inverter and labour included.`],
    ],
    sources: ["cost", "pvgis"],
  };

  const combien = {
    key: "combien-de-panneaux-solaires", slug: S["combien-de-panneaux-solaires"], kicker: "Sizing",
    h1: "How many solar panels do I need for my electricity bill?",
    title: "How many solar panels does a home in Morocco need? | Wattu",
    answer: `For an electricity bill of ${REFERENCE_BILL} MAD a month, you need about ${kwEn(f.nb500.kwp)} kWp: ${f.nb500.panels} panels of ${f.panelW} Wp and about ${numEn(f.surface(f.nb500.panels))} m² of roof. The system costs about ${numEn(f.nb500.capex)} MAD and saves around ${numEn(f.nb500.savings)} MAD a year.`,
    body: `
  <section class="cp-section">
    <h2>Number of panels by electricity bill</h2>
${tableHtml(`System covering about ${f.cover}% of yearly consumption, ${COST} MAD/Wp, no surplus sales; ${medNote}`, ["ONEE bill", "Consumption", "System size", "Panels", "Roof area", "Investment", "Year-1 savings", "Payback"],
  f.nb.map(p => [`${numEn(p.bill)} MAD/month`, `${numEn(p.consumption)} kWh/month`, `${kwEn(p.kwp)} kWp`, `${p.panels}`, `${numEn(f.surface(p.panels))} m²`, `${numEn(p.capex)} MAD`, `${numEn(p.savings)} MAD`, yearsEn(p.payback)]))}
    <p class="cp-note">System size is capped at 10 kWp, below the 11 kW threshold for the <a href="../${S["loi-82-21-autoproduction"]}/">simple declaration under Law 82-21</a>. Areas count the panels only: allow a margin around them, and spacing between rows on a flat roof.</p>
  </section>
  <section class="cp-section">
    <h2>Why not cover 100% of consumption?</h2>
    <p>Panels produce in the daytime, while part of a home's consumption is in the evening. Beyond about ${f.cover}% coverage, a growing share of the output goes to the grid, where it earns little. A smaller system whose output is used almost entirely at home pays back faster.</p>
    <p>For your own roof, <a href="../../../">the simulator</a> finds the building outline and tells you how many panels fit.</p>
  </section>`,
    faq: [
      ["How many solar panels does a house need?", `It depends on the bill: about ${f.nbOf(300).panels} panels for 300 MAD a month, ${f.nb500.panels} for 500 MAD and ${f.nbOf(1000).panels} for 1,000 MAD, with ${f.panelW} Wp panels.`],
      ["How much roof space do solar panels need?", `About ${decEn(CONFIG.PANEL_W_M * CONFIG.PANEL_L_M)} m² per ${f.panelW} Wp panel, or ${numEn(f.surface(2))} m² per kWp, not counting margins and row spacing.`],
    ],
    sources: ["onee", "pvgis"],
  };

  const loi = {
    key: "loi-82-21-autoproduction", slug: S["loi-82-21-autoproduction"], kicker: "Regulation",
    h1: "Law 82-21: generating and selling your own solar power in Morocco",
    title: "Morocco Law 82-21 on self-generation: home solar and selling surplus power | Wattu",
    answer: `Law 82-21 lets households in Morocco generate their own electricity. Since Decree No. 2.25.100 of 5 March 2026, a system under 11 kW only needs a simple declaration, and surplus power fed into the grid is capped at ${f.cap}% of yearly output.`,
    body: `
  <section class="cp-section">
    <h2>What the law changes for a home</h2>
    <ul class="cp-method">
      <li><strong>Under 11 kW:</strong> a simple declaration is enough to install panels and use the power they produce. Typical home systems (2 to 10 kWp) fall in this range.</li>
      <li><strong>Selling surplus:</strong> power you do not use can be fed into the grid, up to ${f.cap}% of the year's output.</li>
      <li><strong>Buy-back price:</strong> the residential tariff has not been published yet. The available reference is about ${price2En(f.exportPrice)} MAD per kWh (the medium-voltage off-peak tariff), best treated as a ceiling.</li>
    </ul>
  </section>
  <section class="cp-section">
    <h2>How much does selling surplus earn?</h2>
    <p>Little, compared with using the power yourself. Take a ${REFERENCE_BILL} MAD monthly bill, a ${kwEn(f.nb500.kwp)} kWp system and the ${medNote}: using your own output saves about ${numEn(f.nb500.savings)} MAD a year, and selling the surplus would add at most ${numEn(f.extra)} MAD a year.</p>
    <p>Each kWh used at home avoids buying a kWh at ${price4En(f.p0)} to ${price4En(f.pL)} MAD (<a href="../${S["tarif-electricite-onee"]}/">ONEE tariff</a>), against about ${price2En(f.exportPrice)} MAD for a kWh sold. It is better to size the system to your own use, which is what <a href="../../../">the simulator</a> does.</p>
  </section>`,
    faq: [
      ["Do I need a permit to install solar panels at home in Morocco?", "Since Decree No. 2.25.100 of 5 March 2026 implementing Law 82-21, a system under 11 kW only needs a simple declaration."],
      ["Can I sell my solar power in Morocco?", `Yes. Law 82-21 allows surplus power to be fed into the grid, capped at ${f.cap}% of yearly output. The residential buy-back tariff has not been published yet; the available reference is about ${price2En(f.exportPrice)} MAD per kWh.`],
    ],
    sources: ["decret", "onee", "pvgis"],
  };

  const taqa = {
    key: "taqa-pro-installateur", slug: S["taqa-pro-installateur"], kicker: "Installers",
    h1: "Taqa Pro: choosing a certified solar installer in Morocco",
    title: "Taqa Pro: finding a certified solar installer in Morocco | Wattu",
    answer: "Taqa Pro is the quality label for solar installers in Morocco, launched in 2018 by AMEE (the Moroccan Agency for Energy Efficiency), AMISOLE and the Cluster Solaire. Certified companies have completed training, passed a final exam and signed an ethics charter, and their installations can be audited.",
    body: `
  <section class="cp-section">
    <h2>Check that an installer is certified</h2>
    <p>The label is the only independent quality signal for photovoltaic installers in Morocco. The <a href="${SOURCES.taqa[1]}" rel="nofollow noopener">official list of certified companies</a> is published on the Taqa Pro website: check the company's name there before you sign.</p>
  </section>
  <section class="cp-section">
    <h2>Comparing quotes</h2>
    <ul class="cp-method">
      <li><strong>Ask for at least three quotes</strong> for the same system size in kWp.</li>
      <li><strong>Work out each quote's price per watt-peak</strong> (total price ÷ size in Wp). The usual range is ${COST_LOW} to ${COST_HIGH} MAD/Wp installed (<a href="../${S["prix-panneau-solaire-maroc"]}/">price details</a>). A quote well above it deserves a question.</li>
      <li><strong>Compare the output the installer promises</strong> with an independent estimate: <a href="../../../">the simulator</a> calculates it for your address with PVGIS, and its PDF can go with your quote request.</li>
      <li><strong>Declare the installation</strong>: under 11 kW, a simple declaration is enough (<a href="../${S["loi-82-21-autoproduction"]}/">Law 82-21</a>).</li>
    </ul>
    <p class="cp-note">Wattu does not sell installations and takes no commission.</p>
  </section>`,
    faq: [
      ["How do I choose a solar panel installer in Morocco?", "Pick a Taqa Pro certified company (official list on taqapro.ma), ask for at least three quotes for the same system size and compare them on price per watt-peak."],
      ["Who awards the Taqa Pro label?", "The Taqa Pro label is run by AMEE, AMISOLE and the Cluster Solaire, since 2018."],
    ],
    sources: ["taqa", "cost"],
  };

  return [combien, prix, tarif, loi, taqa];
}

function guidePage(g, list, lang = "fr") {
  const L = GUIDE_L[lang];
  const url = `${SITE}${L.base}${g.slug}/`;
  const body = `
<nav class="cp-crumbs" aria-label="${L.crumbs}"><a href="${L.root}">${L.home}</a> ${L.sep} <a href="../">${L.guides}</a> ${L.sep} <span>${esc(g.kicker)}</span></nav>
<article>
  <header class="cp-head">
    <p class="w-kicker">${L.kicker} · ${esc(g.kicker)}</p>
    <h1>${esc(g.h1)}</h1>
    <p class="cp-answer">${esc(g.answer)}</p>
    <a class="cp-cta" href="${L.root}">${L.cta}</a>${L.note ? `\n    <p class="cp-note">${L.note}</p>` : ""}
  </header>
${g.body}
  <section class="cp-section">
    <h2>${L.faq}</h2>
${g.faq.map(([q, a]) => `    <h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join("\n")}
    ${sourcesHtmlL(g.sources, lang)}
  </section>
  <section class="cp-section">
    <h2>${L.others}</h2>
    <p class="cp-near">${list.filter(x => x !== g).map(x => `<a href="../${x.slug}/">${esc(x.h1)}</a>`).join("<br>")}</p>
    <p><a href="${L.cities[0]}">${L.cities[1]}</a></p>
  </section>
</article>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": url + "#article", headline: g.h1, description: g.answer, inLanguage: L.inLang, url,
        dateModified: today, author: { "@type": "Person", name: AUTHOR }, publisher: { "@type": "Organization", name: "Wattu", url: SITE + "/" } },
      { "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: L.home, item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: L.guides, item: SITE + L.base },
        { "@type": "ListItem", position: 3, name: g.h1, item: url },
      ] },
    ],
  };
  return layout({ title: g.title, description: g.answer, canonical: url, depth: L.depth, body, jsonLd, lang, alt: altGuide(g.key || g.slug) });
}

const GUIDE_INDEX_L = {
  fr: { depth: 1, crumbs: `<a href="../">Wattu Solaire</a> › <span>Guides</span>`, kicker: "Guides · Solaire résidentiel au Maroc",
        h1: "Panneaux solaires au Maroc : les réponses chiffrées",
        answer: "Prix, nombre de panneaux, tarifs ONEE, loi 82-21 et choix d'un installateur : les réponses chiffrées aux questions qu'on se pose avant d'installer des panneaux solaires au Maroc.",
        cities: ["../villes/", "Rentabilité du solaire ville par ville", (n) => `Production, économies et amortissement pour ${n} villes marocaines.`],
        title: "Guides panneaux solaires au Maroc : prix, tarifs, loi 82-21 | Wattu", name: "Guides Wattu Solaire", inLang: "fr-MA", base: "/guide/" },
  ar: { depth: 2, crumbs: `<a href="../../">Wattu</a> ‹ <span>شروحات</span>`, kicker: "شروحات · الطاقة الشمسية فالدار",
        h1: "البلاكات الشمسية فالمغرب: الأجوبة بالأرقام",
        answer: "الثمن، شحال ديال البلاكات، تعريفة ONEE، القانون 82-21 وكيفاش تختار المركّب: الأجوبة بالأرقام على الأسئلة اللي كيسولو الناس قبل ما يركبو البلاكات الشمسية فالمغرب.",
        cities: ["../villes/", "شحال كتربح الطاقة الشمسية فكل مدينة", (n) => `الإنتاج، التوفير وفوقاش كترجع فلوسك ف${n} مدينة مغربية.`],
        title: "شروحات البلاكات الشمسية فالمغرب: الثمن، التعريفة، القانون 82-21 | Wattu", name: "شروحات Wattu", inLang: "ar-MA", base: "/ar/guide/" },
  en: { depth: 2, crumbs: `<a href="../../">Wattu Solar</a> › <span>Guides</span>`, kicker: "Guides · Home solar in Morocco",
        h1: "Solar panels in Morocco: answers in numbers",
        answer: "Cost, number of panels, ONEE tariff, Law 82-21 and choosing an installer: answers in numbers to the questions people ask before installing solar panels in Morocco.",
        cities: ["../cities/", "Solar payback, city by city", (n) => `Output, savings and payback for ${n} Moroccan cities.`],
        title: "Solar panel guides for Morocco: cost, tariffs, Law 82-21 | Wattu", name: "Wattu Solar guides", inLang: "en", base: "/en/guide/" },
};

function guideIndex(list, lang = "fr") {
  const L = GUIDE_INDEX_L[lang];
  const url = `${SITE}${L.base}`;
  const body = `
<nav class="cp-crumbs" aria-label="${GUIDE_L[lang].crumbs}">${L.crumbs}</nav>
<article>
  <header class="cp-head">
    <p class="w-kicker">${L.kicker}</p>
    <h1>${L.h1}</h1>
    <p class="cp-answer">${esc(L.answer)}</p>
  </header>
${list.map(g => `  <section class="cp-section">
    <h2><a href="${g.slug}/">${esc(g.h1)}</a></h2>
    <p>${esc(g.answer)}</p>
  </section>`).join("\n")}
  <section class="cp-section">
    <h2><a href="${L.cities[0]}">${L.cities[1]}</a></h2>
    <p>${L.cities[2](cities.length)}</p>
  </section>
</article>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage", name: L.name, description: L.answer, url, inLanguage: L.inLang, dateModified: today,
    hasPart: list.map(g => ({ "@type": "Article", headline: g.h1, url: `${url}${g.slug}/` })),
  };
  return layout({ title: L.title, description: L.answer, canonical: url, depth: L.depth, body, jsonLd, lang, alt: ALT_GUIDE_INDEX });
}

// ── Build ───────────────────────────────────────────
const { cities } = JSON.parse(readFileSync(join(ROOT, "solar/data/cities.json"), "utf8"));
const slugs = new Set();
for (const c of cities) {
  if (!/^[a-z0-9-]+$/.test(c.slug) || slugs.has(c.slug)) throw new Error(`bad or duplicate slug: ${c.slug}`);
  slugs.add(c.slug);
  if (!inMorocco(c.lat, c.lon)) throw new Error(`${c.name} is outside Morocco: ${c.lat},${c.lon}`);
  if (!c.name_ar || !c.region_ar || !c.name_en) throw new Error(`${c.name}: name_ar, region_ar and name_en are required`);
}

if (offline) console.warn("OFFLINE: approximate yields, every page is noindex. Do not deploy this output.");
for (const c of cities) {
  const perKw = offline ? PVGIS.fallbackPerKw(c.lat, c.lon) : await fetchPerKw(c.lat, c.lon);
  if (!offline && !(perKw.yieldPerKw > 1000 && perKw.yieldPerKw < 2500))
    throw new Error(`${c.name}: implausible yield ${perKw.yieldPerKw} kWh/kWc`);
  c.result = { ...perKw, profiles: BILLS.map(b => profile(perKw, b)) };
  const ref = c.result.profiles.find(p => p.bill === REFERENCE_BILL);
  console.log(`${c.name.padEnd(12)} ${String(Math.round(perKw.yieldPerKw)).padStart(5)} kWh/kWc  ${REFERENCE_BILL} MAD → ${ref.kwp} kWc, ${Math.round(ref.savings)} MAD/an, ${ref.payback.toFixed(1)} ans`);
}

const write = (rel, content) => {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
for (const c of cities) write(`ville/${c.slug}/index.html`, cityPage(c, cities));
write("villes/index.html", indexPage(cities));
for (const c of cities) write(`ar/ville/${c.slug}/index.html`, cityPageAr(c, cities));
write("ar/villes/index.html", indexPageAr(cities));
for (const c of cities) write(`en/city/${c.slug}/index.html`, cityPageEn(c, cities));
write("en/cities/index.html", indexPageEn(cities));
const guideList = guides(cities);
const guideListAr = guidesAr(cities), guideListEn = guidesEn(cities);
for (const [list, lang, dir] of [[guideList, "fr", "guide"], [guideListAr, "ar", "ar/guide"], [guideListEn, "en", "en/guide"]]) {
  for (const g of list) write(`${dir}/${g.slug}/index.html`, guidePage(g, list, lang));
  write(`${dir}/index.html`, guideIndex(list, lang));
}
write("sitemap.xml", sitemap(cities, guideList, guideListAr, guideListEn));
write("llms.txt", llmsTxt(cities, guideList));
// IndexNow ownership proof (scripts/indexnow-ping.mjs): /<key>.txt holds the key.
const indexNowKey = readFileSync(join(ROOT, "solar/indexnow-key.txt"), "utf8").trim();
write(`${indexNowKey}.txt`, indexNowKey);
console.log(`wrote ${cities.length} city pages (fr + ar + en), villes/, ar/villes/, en/cities/, ${guideList.length} guides × 3 languages, sitemap.xml, llms.txt to ${out}`);
