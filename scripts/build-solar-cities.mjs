#!/usr/bin/env node
/* Builds the static city pages of solar.wattu.org:
 *   <out>/ville/<slug>/index.html   one page per city in solar/data/cities.json
 *   <out>/villes/index.html         the comparison table linking them all
 *   <out>/sitemap.xml               home + every page above
 *   <out>/llms.txt                  plain-text map of the site for AI crawlers
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

function layout({ title, description, canonical, depth, body, jsonLd }) {
  const up = "../".repeat(depth);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${offline ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Wattu">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="fr_MA">
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
  <a class="w-brand" href="${up}" aria-label="Wattu Solaire — accueil">
    <img class="w-mark" src="${up}mark.svg" alt="" width="26" height="26">
    <span class="w-word">wattu</span>
    <span class="w-product">Solaire</span>
  </a>
  <nav class="topnav">
    <a href="${up}villes/">Villes</a>
    <a href="${up}">Simulateur</a>
  </nav>
</header>

<main class="cp-main">
${body}
</main>

<footer class="site-footer">
  <a class="w-brand" href="${up}" aria-label="Wattu Solaire — accueil">
    <img class="w-mark" src="${up}mark.svg" alt="" width="22" height="22">
    <span class="w-word">wattu</span>
  </a>
  <nav>
    <a href="${up}villes/">Rentabilité par ville</a>
    <a href="https://energy.wattu.org/">Carte énergie × digital</a>
    <a href="https://github.com/redatahiri37/morocco-energy-digital-map">Code source</a>
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
  });
}

function sitemap(all) {
  const urls = [`${SITE}/`, `${SITE}/villes/`, ...all.map(c => `${SITE}/ville/${c.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function llmsTxt(all) {
  const sorted = [...all].sort((a, b) => b.result.yieldPerKw - a.result.yieldPerKw);
  return `# Wattu Solaire

> Simulateur gratuit de production et de rentabilité des panneaux solaires résidentiels au Maroc. Production calculée avec PVGIS (Commission européenne), économies avec les tarifs ONEE par tranche. Sans inscription, sans commission. Par ${AUTHOR}. Mis à jour le ${today}.

- [Simulateur](${SITE}/): production, économies en MAD et amortissement pour une adresse précise
- [Rentabilité par ville](${SITE}/villes/): tableau comparatif de ${all.length} villes marocaines

## Villes

${sorted.map(c => { const p = c.result.profiles.find(x => x.bill === REFERENCE_BILL); return `- [${c.name}](${SITE}/ville/${c.slug}/): ${num(c.result.yieldPerKw)} kWh/kWc/an; facture ${REFERENCE_BILL} MAD/mois → ${kw(p.kwp)} kWc, ${num(p.savings)} MAD économisés par an, amorti en ${years(p.payback)}`; }).join("\n")}
`;
}

// ── Build ───────────────────────────────────────────
const { cities } = JSON.parse(readFileSync(join(ROOT, "solar/data/cities.json"), "utf8"));
const slugs = new Set();
for (const c of cities) {
  if (!/^[a-z0-9-]+$/.test(c.slug) || slugs.has(c.slug)) throw new Error(`bad or duplicate slug: ${c.slug}`);
  slugs.add(c.slug);
  if (!inMorocco(c.lat, c.lon)) throw new Error(`${c.name} is outside Morocco: ${c.lat},${c.lon}`);
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
write("sitemap.xml", sitemap(cities));
write("llms.txt", llmsTxt(cities));
console.log(`wrote ${cities.length} city pages, villes/, sitemap.xml, llms.txt to ${out}`);
