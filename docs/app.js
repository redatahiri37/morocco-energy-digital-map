/* =============================================================
   Energy × Digital Nexus — Infrastructure Map (multi-country)
   Single-file app logic: country switch, layers built from
   countries.config.js by `kind`, KPIs, tooltips, popups, theme,
   methodology modal. MapLibre GL + OpenFreeMap basemap, no token.
   ============================================================= */

(function(){
  "use strict";
  // Deploys add ?v=<commit> to this script's URL (see validate.yml); reuse it
  // on the data files so a phone never mixes new code with cached old data.
  const ASSET_V = (()=>{ try{ return new URL(document.currentScript.src).search; }catch(e){ return ""; } })();
  // Data files are addressed from this script's folder, the site root, not
  // from the page: /fr/ loads the same ./data/ as /.
  const SITE_ROOT = (()=>{ try{ return new URL(".", document.currentScript.src).href; }catch(e){ return location.href; } })();
  const dataUrl = (c, file)=>new URL(c.dataPath + file, SITE_ROOT).href + ASSET_V;

  // ---------- Language ----------
  // The page's <html lang> picks it: energy.wattu.org/ is English, /fr/ is
  // French (built from index.html by scripts/build-map-i18n.mjs). The texts
  // this script writes come from T; numbers follow the language (7.7 / 7,7).
  // Data stays as published: plant names, sources, technology, operators.
  const LANG = document.documentElement.lang === "fr" ? "fr" : "en";
  const LOCALE = LANG === "fr" ? "fr-FR" : "en-GB";
  const FR = LANG === "fr";
  const PCT = FR ? "\u202f%" : "%";      // French sets a narrow space before %
  const COLON = FR ? "\u00a0:" : ":";    // ...and before a colon
  function nfmt(v, max, min){
    return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: max || 0, minimumFractionDigits: min || 0 }).format(v);
  }
  const countryLabel = (c)=>(FR && c.labelFr) || c.label;
  const layerTitle = (L)=>(FR && L.titleFr) || L.title;
  const T = FR ? {
    soon: "bientôt", live: "direct", updated: "mis à jour",
    docTitle: (c)=>`Wattu Energy — carte des infrastructures (${c})`,
    credits: (x)=>`Données : ${x} · `,
    issueData: (c)=>`Carte ${c} — correction de données`,
    issueFeature: (c, n)=>`Carte ${c} — correction : ${n}`,
    issueBody: (id)=>`Identifiant : ${id}\n\nCorrection proposée :\n`,
    attribToggle: "Afficher les crédits", dataFrom: "Données",
    inService: "En service", pipeline: "En projet", dcSites: "Data centers", dcPipeline: "Projets data centers",
    dcInvestment: "Investissement DC", sites: "sites", plantsCredit: "centrales : ",
    kpiServiceTip: "Centrales de la carte en exploitation",
    kpiPipelineTip: "Centrales de la carte en construction ou annoncées. « — » : la source ne liste que les centrales construites.",
    mixSrc: "Mix électrique", boundary: "Frontière", basemap: "Fond de carte",
    mixSrcNote: (y)=>`chiffres ${y} ; nationaux, pas une somme de la carte`,
    basemapLi: 'MapLibre GL + <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>, © contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) — public, sans jeton.',
    statusSome: (n, t, pipe)=>`${n} sur ${t} actifs cartographiés ` + (pipe ? "sont en construction, annoncés ou planifiés." : "sont en service."),
    statusNonePipe: "Aucun actif cartographié de ce pays n'est en construction ou annoncé : ses sources ne listent que l'existant.",
    statusNoneService: "Aucun actif cartographié de ce pays n'est indiqué en service.",
    totalGen: (v)=>`${v} TWh produits`, totalCap: (v)=>`${v} GW installés`,
    keyPicked: " — cliquer à nouveau pour tout afficher.", keyPick: " — n'afficher que ces centrales sur la carte.",
    filterLine: (f, n)=>`Carte : ${f} uniquement · ${n} centrale${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}`,
    showAll: "Tout afficher",
    renewables: "Renouvelables", ofGen: "de la production", ofCap: "de la capacité", ofDemand: "de la demande",
    trade: "Échanges", balanced: "Importations et exportations s'équilibrent",
    netImports: "Importations nettes", netExports: "Exportations nettes", co2: "Intensité CO₂",
    coverage: (layer, f, mapped, rest)=>`Couche « ${layer} »${f ? " (" + f + ")" : ""} : ${mapped} en service, ${rest}`,
    coveragePct: (pct, nat)=>`soit ${pct} des ${nat} installés. `,
    coverageOver: (nat)=>`pour ${nat} installés selon Ember. `,
    gap: (names)=>`La source n'indique aucune capacité pour : ${names}, qui produit pourtant ; cette vue la sous-estime. `,
    source: "Source : ",
    clusterTip: (n, mw)=>`${n} centrales · ${mw}`, clusterHint: "Cliquer pour zoomer",
    estDemand: "env.", cableLanding: "Atterrissement de câble sous-marin",
    badgeGen: "Production", badgeOsm: "Production · OpenStreetMap", badgeIndustry: "Consommateur industriel",
    badgeCable: "Câble sous-marin", badgeDC: "Data center", badgeInfra: "Infrastructure", badgeLine: "Ligne de transport",
    capacity: "Puissance", fuel: "Filière", technology: "Technologie", commissioned: "Mise en service", targetYear: "Année visée",
    sector: "Secteur", estDemandK: "Demande estimée", gridConnection: "Raccordement", precision: "Précision",
    operator: "Opérateur", investment: "Investissement", energised: "Mise sous tension",
    voltage: "Tension", status: "Statut", kind: "Type", hvdcPlanned: "HVDC (prévu)", ac: "Alternatif",
    rawData: "Données brutes", viewOim: "Voir sur OpenInfraMap ↗", fixOsm: "Corriger sur OpenStreetMap ↗",
    reportError: "Signaler une erreur", primarySource: "Source primaire ↗", copyLink: "Copier le lien",
    unnamedOsm: "Centrale sans nom (OSM)", osmSource: "Contributeurs OpenStreetMap via OpenInfraMap",
    west: "O", linkCopied: "Lien copié", copyFromBar: "Copiez le lien depuis la barre d'adresse",
    powerPlant: "Centrale", industry: "Industrie", cableShort: "Atterrissement de câble", dataCentre: "Data center",
    line: "Ligne", demand: (mw)=>`~${mw} de demande`,
    currentCountry: "Pays affiché", goCountry: "Aller à ce pays",
    searching: "Recherche dans les autres pays…",
    noMatch: "Aucun résultat parmi les actifs cartographiés. Les centrales OSM ne sont pas cherchables.",
    allCountries: "Tous les pays — vue d'ensemble", docTitleOverview: "Wattu Energy — tous les pays",
    legendRenew: "Renouvelables, part de la production", legendCo2: "CO₂ du secteur électrique par kWh produit",
    overviewNote: (years)=>`Ember, dernière année par pays (${years}). Cliquer sur un pays pour l'ouvrir.`,
    clickToOpen: "Cliquer pour ouvrir", noData: "Pas de données de mix", openCountry: (c)=>`Ouvrir : ${c}`
  } : {
    soon: "soon", live: "live", updated: "updated",
    docTitle: (c)=>`Wattu Energy — ${c} infrastructure map`,
    credits: (x)=>`Data: ${x} · `,
    issueData: (c)=>`${c} map — data correction`,
    issueFeature: (c, n)=>`${c} map — correction: ${n}`,
    issueBody: (id)=>`Feature id: ${id}\n\nSuggested correction:\n`,
    attribToggle: "Toggle attribution", dataFrom: "Data from",
    inService: "In service", pipeline: "Pipeline", dcSites: "Data centres", dcPipeline: "DC pipeline",
    dcInvestment: "DC investment", sites: "sites", plantsCredit: "plants: ",
    kpiServiceTip: "Plants on the map that are operating",
    kpiPipelineTip: "Plants on the map under construction or announced. — means the plant source lists built plants only.",
    mixSrc: "Electricity mix", boundary: "Boundary", basemap: "Basemap",
    mixSrcNote: (y)=>`${y} figures; national, not summed from the map`,
    basemapLi: 'MapLibre GL + <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL) — public, no token required.',
    statusSome: (n, t, pipe)=>`${n} of ${t} mapped assets ` + (pipe ? "are under construction, announced or planned." : "are in service."),
    statusNonePipe: "None of this country's mapped assets is under construction or announced: its sources list built ones only.",
    statusNoneService: "None of this country's mapped assets is listed as in service.",
    totalGen: (v)=>`${v} TWh generated`, totalCap: (v)=>`${v} GW installed`,
    keyPicked: ". Pick again to show every plant.", keyPick: ". Show only these plants on the map.",
    filterLine: (f, n)=>`Map: ${f.toLowerCase()} plants only · ${n} shown`,
    showAll: "Show all",
    renewables: "Renewables", ofGen: "of generation", ofCap: "of capacity", ofDemand: "of demand",
    trade: "Trade", balanced: "Imports and exports balance",
    netImports: "Net imports", netExports: "Net exports", co2: "CO₂ intensity",
    coverage: (layer, f, mapped, rest)=>`${layer} layer${f ? ", " + f.toLowerCase() : ""}: ${mapped} in service, ${rest}`,
    coveragePct: (pct, nat)=>`${pct} of the ${nat} installed. `,
    coverageOver: (nat)=>`against ${nat} installed per Ember. `,
    gap: (names)=>`The source lists no ${names} capacity though it generates power: this view undercounts it. `,
    source: "Source: ",
    clusterTip: (n, mw)=>`${n} plants · ${mw}`, clusterHint: "Click to zoom in",
    estDemand: "est.", cableLanding: "Submarine cable landing",
    badgeGen: "Generation", badgeOsm: "Generation · OpenStreetMap", badgeIndustry: "Industrial consumer",
    badgeCable: "Submarine cable", badgeDC: "Data center", badgeInfra: "Infrastructure", badgeLine: "Transmission line",
    capacity: "Capacity", fuel: "Fuel", technology: "Technology", commissioned: "Commissioned", targetYear: "Target year",
    sector: "Sector", estDemandK: "Est. demand", gridConnection: "Grid connection", precision: "Precision",
    operator: "Operator", investment: "Investment", energised: "Energised",
    voltage: "Voltage", status: "Status", kind: "Kind", hvdcPlanned: "HVDC (planned)", ac: "AC",
    rawData: "Raw data", viewOim: "View on OpenInfraMap ↗", fixOsm: "Fix on OpenStreetMap ↗",
    reportError: "Report an error", primarySource: "Primary source ↗", copyLink: "Copy link",
    unnamedOsm: "Unnamed plant (OSM)", osmSource: "OpenStreetMap contributors via OpenInfraMap",
    west: "W", linkCopied: "Link copied", copyFromBar: "Copy the link from the address bar",
    powerPlant: "Power plant", industry: "Industry", cableShort: "Cable landing", dataCentre: "Data centre",
    line: "Line", demand: (mw)=>`~${mw} demand`,
    currentCountry: "Current country", goCountry: "Go to this country",
    searching: "Searching the other countries…",
    noMatch: "No match in the mapped assets. OSM power plants are not searchable.",
    allCountries: "All countries — overview", docTitleOverview: "Wattu Energy — all countries",
    legendRenew: "Renewables, share of generation", legendCo2: "Power-sector CO₂ per kWh generated",
    overviewNote: (years)=>`Ember, latest year per country (${years}). Click a country to open it.`,
    clickToOpen: "Click to open", noData: "No mix data", openCountry: (c)=>`Open ${c}`
  };
  // Data values shown as words: fuel, status, precision, Moroccan sectors.
  const FUEL_WORD = FR
    ? { coal:"charbon", gas:"gaz", oil:"fioul", nuclear:"nucléaire", hydro:"hydraulique", wind:"éolien",
        solar:"solaire", biomass:"biomasse", waste:"déchets", geothermal:"géothermie" }
    : {};
  // The mix legend's labels, by fuel key (English keeps mix.json's own).
  const MIX_LABEL = FR
    ? { coal:"Charbon", gas:"Gaz", oil:"Fioul et autres fossiles", nuclear:"Nucléaire", hydro:"Hydraulique",
        wind:"Éolien", solar:"Solaire", biomass:"Bioénergie", geothermal:"Géothermie et autres" }
    : {};
  const STATUS_WORD_ALL = FR
    ? { operational:"en service", construction:"en construction", announced:"annoncé", planned:"planifié", idle:"à l'arrêt" }
    : { operational:"operational", construction:"construction", announced:"announced", planned:"planned", idle:"idle" };
  const PRECISION_WORD = FR ? { exact:"exacte", approximate:"approximative" } : {};
  const SECTOR_WORD = FR
    ? { "phosphates / fertilisers":"phosphates / engrais", "phosphate mining":"mines de phosphate", "cement":"ciment",
        "steel":"acier", "automotive":"automobile", "oil refining":"raffinage", "mining / metallurgy":"mines / métallurgie" }
    : {};
  const word = (table, v)=>Object.hasOwn(table, v) ? table[v] : v;

  // ---------- Config & country manifest ----------
  const DEFAULT_COUNTRY = "morocco";

  // Basemap: OpenFreeMap vector styles — open, no key, no account.
  // (CARTO's free tiles now arrive stamped "API KEY REQUIRED".) Positron
  // for light, Dark for dark: both are low-contrast so the data layers
  // carry the colour. The styles bring their own glyph server, which is
  // where our label fonts come from.
  function basemapStyle(theme){
    return "https://tiles.openfreemap.org/styles/" + (theme === "dark" ? "dark" : "positron");
  }

  // Used only if the OpenFreeMap style itself can't be fetched: a plain
  // background, so the data layers still render instead of nothing at all.
  function fallbackStyle(theme){
    return {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {},
      layers: [{ id:"background", type:"background",
                 paint:{ "background-color": theme === "dark" ? "#070D1A" : "#F5F7FA" } }]
    };
  }

  // Fonts on the OpenFreeMap glyph server. Labels also get their own
  // sources (see addLabelLayer) so a font failure can only hide text,
  // never the points.
  const FONT_REGULAR = ["Noto Sans Regular"];
  const FONT_BOLD    = ["Noto Sans Bold"];

  // OpenInfraMap vector tiles — transmission grid, substations, plants.
  // Data is OSM under ODbL; attribution is mandatory.
  const OIM_TILES = "https://openinframap.org/tiles/{z}/{x}/{y}.pbf";
  const OIM_ATTR  = '<a href="https://openinframap.org" target="_blank" rel="noopener">OpenInfraMap</a> (ODbL)';
  // Our own attribution text. MapLibre's control renders each source's
  // `attribution` as HTML, and the basemap style is third-party JSON
  // fetched at runtime, outside SRI: a tampered style would run script here.
  const ATTRIBUTION =
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
    T.dataFrom + ' <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
    OIM_ATTR + ' · <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>';
  const COUNTRIES = window.COUNTRIES || {};
  const ENABLED   = (window.COUNTRIES_ENABLED || ["morocco"]).filter(k=>COUNTRIES[k]);
  const REPO_URL  = "https://github.com/redatahiri37/morocco-energy-digital-map";

  const FUEL_COLOR = {
    solar:"#F59E0B", wind:"#0D9488", hydro:"#3B82F6",
    coal:"#8B7F72",  gas:"#C77B3A", oil:"#A55A2A",
    nuclear:"#DB2777", geothermal:"#DC2626", biomass:"#65A30D", waste:"#78716C"
  };
  // Plant dots: area tracks capacity (radius ∝ √MW, with a floor so a 10 MW
  // plant stays visible) and grows with zoom. plantRadius() is the same curve
  // in JS, for the size key under the layer list.
  const PLANT_R_MIN = 3, PLANT_R_PER_SQRT_MW = 0.3;
  const PLANT_ZOOM_SCALE = [[4, 0.6], [7, 1], [10, 1.3]];
  function zoomScale(zoom){
    const s = PLANT_ZOOM_SCALE;
    if(zoom <= s[0][0]) return s[0][1];
    for(let i = 1; i < s.length; i++){
      if(zoom <= s[i][0]){
        const t = (zoom - s[i-1][0]) / (s[i][0] - s[i-1][0]);
        return s[i-1][1] + t * (s[i][1] - s[i-1][1]);
      }
    }
    return s[s.length-1][1];
  }
  const plantRadius = (mw, zoom)=>zoomScale(zoom) * (PLANT_R_MIN + PLANT_R_PER_SQRT_MW * Math.sqrt(Math.max(0, mw)));
  // The same curve as a MapLibre expression on a feature's MW field; `out`
  // turns the radius into another value (halo radius, label offset).
  function plantRadiusExpr(mwField, out){
    const r = (f)=>["*", f, ["+", PLANT_R_MIN,
      ["*", PLANT_R_PER_SQRT_MW, ["sqrt", ["max", 0, ["to-number", ["get", mwField], 0]]]]]];
    return ["interpolate", ["linear"], ["zoom"], ...PLANT_ZOOM_SCALE.flatMap(([z, f])=>[z, out ? out(r(f)) : r(f)])];
  }
  // Capacity in a cluster or tooltip: "850 MW", "4.2 GW".
  const fmtMW = (mw)=>mw >= 1000 ? short(mw/1000) + " GW" : nfmt(mw) + " MW";

  const DIGITAL_COLOR    = "#7C3AED";
  const INDUSTRIAL_COLOR = "#EA580C";
  const CABLE_COLOR      = "#2DD4BF";  // teal — was orange, collided with industrial
  const GRID_COLOR       = "#E5E4E0";

  // Resolves current theme; called inside buildMapLayers which re-runs on theme change
  const isDark = () => document.body.dataset.theme !== "light";
  const INTERCONNECTOR_COLOR = () => isDark() ? "#60A5FA" : "#1D4ED8";
  const PLANNED_COLOR = "#a37df0";

  // Palettes are per country (countries.config.js → `palette`): operators
  // and industrial sectors differ from one market to the next. Anything not
  // listed falls back to DIGITAL_COLOR / INDUSTRIAL_COLOR.
  //   palette.providers: [{ key: <operator as in the data>, color, short }]
  //   palette.sectors:   { <sector as in the data>: color }
  function palette(){
    const p = (COUNTRIES[currentCountry] || {}).palette || {};
    return { providers: p.providers || [], sectors: p.sectors || {} };
  }
  // An empty palette must yield a plain colour: ["case", fallback] is not a
  // valid expression, and MapLibre then drops the layer with only a warning.
  function providerColorExpr(){
    if(!palette().providers.length) return DIGITAL_COLOR;
    const expr = ["case"];
    palette().providers.forEach(p => { expr.push(["==",["get","operator"], p.key], p.color); });
    expr.push(DIGITAL_COLOR); // default
    return expr;
  }
  function sectorColorExpr(){
    if(!Object.keys(palette().sectors).length) return INDUSTRIAL_COLOR;
    const expr = ["case"];
    Object.entries(palette().sectors).forEach(([k,v])=>{
      expr.push(["==",["get","sector"],k], v);
    });
    expr.push(INDUSTRIAL_COLOR); // default
    return expr;
  }

  // A layer's `kind` in countries.config.js picks its renderer. Every map
  // layer and source id is derived from the config layer id, so any number
  // of layers of any kind can coexist and nothing here names a Moroccan file.
  // The order is the draw order, bottom to top.
  const KINDS = ["oim", "oim-plants", "grid", "power", "industrial", "digital"];
  const LIVE_KINDS = ["oim", "oim-plants"]; // drawn from OpenInfraMap tiles, no file

  // Rebuilt by buildMapLayers(): map layer id → { dataLayerId, kind, src, role }.
  // role "point" / "line" get hover + click, "cluster" zooms in on click.
  let mapLayers = {};

  // ---------- State ----------
  let map = null;
  let currentCountry = null;
  let layerData      = {};   // id -> GeoJSON
  let visibility     = {};   // id -> bool
  let hoveredLayer   = null; // { sourceId, dataLayerId, keepId } while a point is hovered
  let boundaryData   = null;
  let mixData        = null;   // national mix (mix.json) of the current country
  let fuelFilter     = null;   // mix fuel key the plant layers are narrowed to, or null
  let statusView     = "all";  // key of STATUS_VIEWS; kept across country switches
  let selected       = null;   // { layer, id } of the feature whose popup is open, if linkable

  // ---------- DOM refs ----------
  const $ = (sel)=>document.querySelector(sel);
  const tooltip = $("#tooltip");
  const popup   = $("#popup");
  const noTokenCard = $("#noTokenCard");

  // ---------- Theme ----------
  // localStorage throws when site data is blocked; the theme is a
  // convenience and must never stop the map from booting.
  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, v); }catch(e){ /* not remembered */ } }
  };
  const savedTheme = store.get("mg.theme") || "dark";
  document.body.dataset.theme = savedTheme;
  $("#themeToggle").addEventListener("click", ()=>{
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    store.set("mg.theme", next);
    if(map){
      // Full reload, not a diff: diffing Positron→Dark patches the basemap in
      // place, which drops our layers and never fires "style.load", so they
      // were never rebuilt (empty map after switching theme). Listen first.
      map.once("style.load", ()=>buildMapLayers(currentCountry));
      map.setStyle(basemapStyle(next), { diff:false });
    }
    if(currentCountry) renderLayerList(currentCountry); // swatch colours are theme-aware
    if(overview) renderOverview();
  });

  // ---------- Country selector ----------
  const countrySelect = $("#countrySelect");
  ENABLED.forEach(key=>{
    const o = document.createElement("option");
    o.value = key; o.textContent = countryLabel(COUNTRIES[key]);
    countrySelect.appendChild(o);
  });
  Object.keys(COUNTRIES).filter(k=>!ENABLED.includes(k)).forEach(key=>{
    const o = document.createElement("option");
    o.value = key; o.textContent = `${countryLabel(COUNTRIES[key])} (${T.soon})`;
    o.disabled = true;
    countrySelect.appendChild(o);
  });

  // ---------- Panel collapse ----------
  const layout = document.querySelector(".layout");
  $("#panelCollapse").addEventListener("click", ()=>layout.classList.add("panel-collapsed"));
  $("#panelExpand").addEventListener("click",   ()=>layout.classList.remove("panel-collapsed"));

  ["githubLink","githubContribute","githubFooter"].forEach(id=>{ const el = $("#"+id); if(el) el.href = REPO_URL; });
  const reportErrorFooter = $("#reportErrorFooter");

  // ---------- Methodology modal ----------
  const methModal = $("#methodologyModal");
  $("#methodologyBtn").addEventListener("click", ()=>methModal.classList.remove("hidden"));
  $("#methodologyClose").addEventListener("click", ()=>methModal.classList.add("hidden"));
  methModal.addEventListener("click", (e)=>{ if(e.target === methModal) methModal.classList.add("hidden"); });

  // ---------- Utility ----------
  // Same markup and classes as MapLibre's compact control, fixed text.
  function staticAttribution(){
    let el;
    return {
      onAdd(){
        el = document.createElement("details");
        el.className = "maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact";
        el.open = true;
        el.innerHTML = '<summary class="maplibregl-ctrl-attrib-button" title="' + T.attribToggle + '" aria-label="' + T.attribToggle + '"></summary>' +
          '<div class="maplibregl-ctrl-attrib-inner">' + ATTRIBUTION + '</div>';
        el.firstChild.addEventListener("click", (e)=>{ e.preventDefault(); el.classList.toggle("maplibregl-compact-show"); });
        return el;
      },
      onRemove(){ el.remove(); }
    };
  }
  // Values below go into innerHTML: anything that is not a finite number
  // (a string slipped into the data) renders as "—", never as markup.
  // One decimal, dropped when it is 0: 2.2, 4.
  const short = (x)=>{ const r = Math.round(x * 10) / 10; return nfmt(r, r % 1 ? 1 : 0, r % 1 ? 1 : 0); };
  function fmtInvestment(v){
    v = num(v);
    if(v == null) return "—";
    if(v >= 1e9) return FR ? short(v/1e9) + " Md$" : "$" + short(v/1e9) + "B";
    if(v >= 1e6) return FR ? nfmt(v/1e6) + " M$" : "$" + nfmt(v/1e6) + "M";
    return FR ? nfmt(v) + " $" : "$" + nfmt(v);
  }
  function fmtCap(mw){ mw = num(mw); return mw == null ? "—" : nfmt(mw, 1) + " MW"; }
  function num(v){ return typeof v === "number" && Number.isFinite(v) ? v : null; }
  // Colours go in data-bg / data-border and are applied here, through the
  // DOM: the CSP allows no style="" attribute in HTML (no 'unsafe-inline').
  function paint(root){
    root.querySelectorAll("[data-bg]").forEach(el=>{ el.style.background = el.dataset.bg; });
    root.querySelectorAll("[data-border]").forEach(el=>{ el.style.borderColor = el.dataset.border; });
  }
  // Links only for http(s): HTML escaping does not stop javascript: URLs.
  function safeUrl(u){
    try { const p = new URL(u).protocol; return p === "https:" || p === "http:" ? u : ""; }
    catch(e){ return ""; }
  }
  function issueUrl(title, body){
    return REPO_URL + "/issues/new?title=" + encodeURIComponent(title) +
      (body ? "&body=" + encodeURIComponent(body) : "");
  }
  function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function layerConfig(layerId){
    return ((COUNTRIES[currentCountry] || {}).layers || []).find(L=>L.id === layerId);
  }
  function layerKind(layerId){ const L = layerConfig(layerId); return L ? L.kind : "other"; }
  // A grid layer whose features are all planned draws as a dashed purple line.
  function isPlannedGrid(layerId){
    const fc = layerData[layerId];
    return !!fc && fc.features.length > 0 && fc.features.every(f=>f.properties.status === "planned");
  }

  function showMapError(reason){
    noTokenCard.classList.remove("hidden");
    if(reason) console.warn("[MoroccoMap]", reason);
  }

  // ---------- Boot ----------
  // Data + map init race each other. Before v1.5 the fetches were small
  // enough that loadAllData usually beat map.on("load"); the 221 KB WBG
  // transmission file flipped that and buildMapLayers started running
  // against empty layerData, so nothing rendered. Track both readiness
  // signals explicitly and only build when both are true.
  let dataReady = false, mapReady = false;
  // A shared link's view and feature wait for the map and the data.
  let initialView = null, pendingFeature = null, pendingOverview = null;
  function tryBuild(){
    if(!(dataReady && mapReady)) return;
    buildMapLayers(currentCountry);
    if(pendingOverview){ const link = pendingOverview; pendingOverview = null; enterOverview(link); }
    else if(pendingFeature){ openLinkedFeature(pendingFeature, !initialView); pendingFeature = null; }
    urlReady = true;
    syncLangLink();
  }

  function boot(){
    const link = readLink();
    const initialCountry = ENABLED.includes(link.country) ? link.country
      : ENABLED.includes(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : ENABLED[0];
    countrySelect.value = initialCountry;
    currentCountry = initialCountry;
    initialView = link.country === initialCountry ? link.view : null;
    if(link.overview){
      // The panel shows the overview from the start, not the country first.
      pendingOverview = link;
      countrySelect.value = OVERVIEW_KEY;
      layout.classList.add("is-overview");
    }
    loadAllData(initialCountry).then(committed=>{
      if(committed){
        applyLinkState(link);
        renderPanel(initialCountry);
        pendingFeature = link.feature;
      }
      dataReady = true;
      tryBuild();
    });
    bootMap();
  }

  function bootMap(){
    if(typeof maplibregl === "undefined"){ showMapError("MapLibre GL not loaded"); return; }
    try{
      const c = COUNTRIES[currentCountry];
      map = new maplibregl.Map({
        container: "map",
        style: basemapStyle(document.body.dataset.theme),
        center: initialView ? initialView.center : c.center,
        zoom: initialView ? initialView.zoom : c.zoom,
        attributionControl: false
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass:false }), "bottom-right");
      map.addControl(staticAttribution(), "bottom-left");

      map.on("load", ()=>{ mapReady = true; tryBuild(); });
      map.on("moveend", ()=>syncUrl());
      let sizeKeyFrame = 0;
      map.on("zoom", ()=>{
        if(sizeKeyFrame) return;
        sizeKeyFrame = requestAnimationFrame(()=>{ sizeKeyFrame = 0; if(currentCountry) renderSizeKey(); });
      });
      map.on("click", (e)=>{
        const features = map.queryRenderedFeatures(e.point, { layers: queryableLayers() });
        if(features.length === 0) closePopup();
      });
      let usingFallback = false;
      map.on("error", (e)=>{
        const err = e && e.error;
        console.warn("[MoroccoMap] map error:", err && String(err.message||""));
        // An error before the style has loaded means the basemap style
        // itself failed (the fetch error carries no URL to match on).
        if(!mapReady && !usingFallback && !map.isStyleLoaded()){
          usingFallback = true;
          map.setStyle(fallbackStyle(document.body.dataset.theme));
        }
      });
    } catch(err){
      showMapError(String(err));
    }
  }

  // Panel, KPIs and methodology for a country whose data is loaded.
  function renderPanel(countryKey){
    renderMix();
    renderStatusNote();
    renderLayerList(countryKey);
    renderSizeKey();
    renderKPIs(countryKey);
    renderMethodologySources(countryKey);
  }

  // ---------- Data loading ----------
  // Resolves true once the country's data is in place, false if the user
  // switched to another country meanwhile (nothing is committed then).
  async function loadAllData(countryKey){
    const c = COUNTRIES[countryKey];
    // Per-country state starts clean: a country without a boundary file (or
    // without a layer) must not inherit the previous country's. Built in
    // locals and committed at the end, so a slower load for a country the
    // user has already switched away from can't overwrite the newer one.
    const data = {}, vis = {};
    let boundary = null, mix = null;
    try{
      const r = await fetch(dataUrl(c, "boundary.geojson"));
      if(r.ok) boundary = await r.json();
    } catch(e){ /* no boundary for this country */ }
    if(c.mix){
      try{
        const r = await fetch(dataUrl(c, c.mix));
        if(r.ok) mix = await r.json();
      } catch(e){ console.warn("[MoroccoMap] failed to load", c.mix, e); }
    }

    const promises = c.layers.map(async (L, idx)=>{
      vis[L.id] = L.visible !== false;
      if(!L.file) return; // OIM or other virtual layers — no fetch needed
      try{
        const res = await fetch(dataUrl(c, L.file));
        if(!res.ok) throw new Error(res.status + " " + L.file);
        const fc = await res.json();
        // Ensure each feature has a stable numeric id — required for feature-state
        fc.features.forEach((f,i)=>{ if(f.id == null) f.id = idx*10000 + i; });
        data[L.id] = fc;
      } catch(e){
        console.warn("[MoroccoMap] failed to load", L.file, e);
        data[L.id] = { type:"FeatureCollection", features:[] };
      }
    });
    await Promise.all(promises);
    if(countryKey !== currentCountry) return false;
    layerData = data;
    visibility = vis;
    boundaryData = boundary;
    mixData = mix;
    return true;
  }

  // ---------- Panel: layer list ----------
  function renderLayerList(countryKey){
    const c = COUNTRIES[countryKey];
    const host = $("#layerList");
    host.innerHTML = "";
    c.layers.forEach(L=>{
      const fc = layerData[L.id] || { features:[] };
      const kind = layerKind(L.id);
      const shown = layerView(L).features.length;
      const planned = kind==="grid" && isPlannedGrid(L.id);
      const dotColor = (
        planned             ? PLANNED_COLOR :
        kind==="grid"       ? INTERCONNECTOR_COLOR() :
        kind==="power"      ? FUEL_COLOR.solar :
        kind==="oim"        ? "#8a877c" :
        kind==="oim-plants" ? OSM_PLANT_SWATCH :
        kind==="industrial" ? INDUSTRIAL_COLOR :
        kind==="digital"    ? DIGITAL_COLOR : "#999"
      );
      const swatch = kind==="grid" || kind==="oim"
        ? `<span class="layer-line${planned ? " dashed" : ""}" data-border="${escapeHtml(dotColor)}"></span>`
        : `<span class="layer-dot" data-bg="${escapeHtml(dotColor)}"></span>`;
      const row = document.createElement("label");
      row.className = "layer-row";
      row.dataset.layer = L.id;
      row.title = `${L.source} · ${T.updated} ${L.updated === "live" ? T.live : L.updated}`;
      row.innerHTML = `
        <input type="checkbox" ${visibility[L.id]!==false?"checked":""}>
        <span class="check"></span>
        ${swatch}
        <span class="layer-name">${escapeHtml(layerTitle(L))}</span>
        <span class="layer-count">${LIVE_KINDS.includes(kind) ? T.live : shown === fc.features.length ? nfmt(shown) : `${nfmt(shown)} / ${nfmt(fc.features.length)}`}</span>
      `;
      paint(row);
      row.querySelector("input").addEventListener("change", (e)=>{
        const on = e.target.checked;
        visibility[L.id] = on;
        row.classList.toggle("muted", !on);
        applyLayerVisibility(L.id, on);
        syncUrl();
      });
      if(visibility[L.id] === false) row.classList.add("muted");
      host.appendChild(row);
    });
  }

  // Three reference dots drawn with the map's own curve at the current zoom,
  // so they match the plants on screen. Redrawn as the map zooms.
  const SIZE_KEY_MW = [100, 1000, 5000];
  function renderSizeKey(){
    const host = $("#sizeKey");
    const hasPlants = COUNTRIES[currentCountry].layers.some(L=>L.kind === "power" || L.kind === "oim-plants");
    host.hidden = !hasPlants;
    if(!hasPlants) return;
    const zoom = map ? map.getZoom() : COUNTRIES[currentCountry].zoom;
    const items = $("#sizeKeyItems");
    items.replaceChildren();
    SIZE_KEY_MW.forEach(mw=>{
      const d = 2 * plantRadius(mw, zoom);
      const item = document.createElement("span");
      item.className = "size-key-item";
      const dot = document.createElement("span");
      dot.className = "size-key-dot";
      dot.style.width = dot.style.height = d.toFixed(1) + "px";
      const label = document.createElement("span");
      label.textContent = fmtMW(mw);
      item.append(dot, label);
      items.appendChild(item);
    });
  }

  // All features of every layer of a kind, for this country.
  function featuresOfKind(countryKey, kind){
    return COUNTRIES[countryKey].layers.filter(L=>L.kind === kind)
      .flatMap(L=>(layerData[L.id] || { features:[] }).features);
  }

  // Statuses counted as not yet built in the "Pipeline" tile.
  const PIPELINE_STATUS = ["construction", "announced", "planned"];
  function fmtPower(mw){
    return mw >= 1000 ? `${nfmt(mw/1000, 1, 1)}<small> GW</small>` : `${nfmt(mw)}<small> MW</small>`;
  }

  // Figures summed from the layers on the map, so they follow the fuel picked
  // in the mix legend. National totals are in the Electricity mix above.
  function renderKPIs(countryKey){
    const host = $("#kpiGrid");
    const c = COUNTRIES[countryKey];
    const snap = $("#snapshotSource");
    const credit = (FR && c.snapshotSourceFr) || c.snapshotSource;
    if(snap) snap.textContent = credit ? T.plantsCredit + credit : "";
    const allPlants = featuresOfKind(countryKey, "power");
    const plants = fuelFilter ? allPlants.filter(f=>plantFuels(fuelFilter).includes(f.properties.fuel_type)) : allPlants;
    const fcDC    = { features: featuresOfKind(countryKey, "digital") };
    const mw = (fs)=>fs.reduce((s,f)=>s + (num(f.properties.capacity_mw) || 0), 0);
    const inService = mw(plants.filter(f=>f.properties.status === "operational"));
    const pipeline  = mw(plants.filter(f=>PIPELINE_STATUS.includes(f.properties.status)));
    const dcMW = fcDC.features.reduce((s,f)=>s + (num(f.properties.capacity_estimate_mw) || 0), 0);
    const dcInvest = fcDC.features.reduce((s,f)=>s + (num(f.properties.investment_usd) || 0), 0);
    // A country with no layer of a kind shows "—", not a zero that reads as a finding.
    const hasPower = allPlants.length > 0, hasDC = fcDC.features.length > 0;
    // Sources such as WRI's database list built plants only: no pipeline to show.
    const tracksPipeline = allPlants.some(f=>PIPELINE_STATUS.includes(f.properties.status));
    // Registries such as PeeringDB list sites without MW or investment
    // figures: show the site count and "—" rather than 0.0 GW / $0.
    const hasDCmw = fcDC.features.some(f=>f.properties.capacity_estimate_mw != null);
    const hasDCinv = fcDC.features.some(f=>f.properties.investment_usd != null);
    const NA = "—";
    const fuel = fuelFilter && mixFuel(fuelFilter);
    const prefix = fuel ? escapeHtml(fuelLabel(fuel)) + " · " : "";
    host.innerHTML = `
      <div class="kpi" title="${escapeHtml(T.kpiServiceTip)}"><div class="k">${prefix}${T.inService}</div>
        <div class="v">${hasPower ? fmtPower(inService) : NA}</div></div>
      <div class="kpi" title="${escapeHtml(T.kpiPipelineTip)}"><div class="k">${prefix}${T.pipeline}</div>
        <div class="v">${hasPower && tracksPipeline ? fmtPower(pipeline) : NA}</div></div>
      <div class="kpi"><div class="k">${hasDC && !hasDCmw ? T.dcSites : T.dcPipeline}</div>
        <div class="v">${!hasDC ? NA : hasDCmw ? `${nfmt(dcMW/1000, 1, 1)}<small> GW</small>`
                                               : `${nfmt(fcDC.features.length)}<small> ${T.sites}</small>`}</div></div>
      <div class="kpi"><div class="k">${T.dcInvestment}</div>
        <div class="v">${hasDCinv ? fmtInvestment(dcInvest) : NA}</div></div>
    `;
  }

  // Country name wherever the page names one: tab title, brand line,
  // methodology intro, the data path it cites, and the report-an-error link.
  function renderCountryText(countryKey){
    const c = COUNTRIES[countryKey];
    document.title = T.docTitle(countryLabel(c));
    document.querySelectorAll("[data-country-label]").forEach(el=>{ el.textContent = countryLabel(c); });
    document.querySelectorAll("[data-country-credits]").forEach(el=>{ el.textContent = c.credits ? T.credits(c.credits) : ""; });
    document.querySelectorAll("[data-country-path]").forEach(el=>{ el.textContent = "/docs/" + c.dataPath.replace(/^\.\//, ""); });
    if(reportErrorFooter) reportErrorFooter.href = issueUrl(T.issueData(countryLabel(c)));
  }

  function renderMethodologySources(countryKey){
    const c = COUNTRIES[countryKey];
    renderCountryText(countryKey);
    const host = $("#methodologySources");
    if(!host) return;
    host.innerHTML = c.layers.map(L=>
      `<li><strong>${escapeHtml(layerTitle(L))}${COLON}</strong> ${escapeHtml(L.source)} — <a href="${escapeHtml(L.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(L.sourceUrl)}</a> <span class="micro">(${T.updated} ${escapeHtml(L.updated === "live" ? T.live : L.updated)})</span></li>`
    ).join("") + (mixData ? `<li><strong>${T.mixSrc}${COLON}</strong> ${escapeHtml(mixData.source)} — <a href="${escapeHtml(safeUrl(mixData.source_url))}" target="_blank" rel="noopener">${escapeHtml(mixData.source_url)}</a> <span class="micro">(${escapeHtml(T.mixSrcNote(mixData.year))})</span></li>` : "") +
    (c.boundary ? `<li><strong>${T.boundary}${COLON}</strong> ${escapeHtml(c.boundary.source)} — <a href="${escapeHtml(c.boundary.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(c.boundary.sourceUrl)}</a>${c.boundary.note ? ` <span class="micro">(${escapeHtml(c.boundary.note)})</span>` : ""}</li>` : "") +
    `<li><strong>${T.basemap}${COLON}</strong> ${T.basemapLi}</li>`;
  }

  // ---------- Electricity mix ----------
  // The plant layers are nameplate capacity, and only the plants we map. The
  // mix is the country's own generation and capacity by fuel, from Ember's
  // yearly data (scripts/build-country-mix.py). Its legend is also the colour
  // key for the plant dots: picking a fuel narrows the plant layers to it.
  let mixMeasure = "generation";   // or "capacity"
  // A mix fuel → the plant fuel_type values it covers on the map.
  const MIX_PLANT_FUELS = { biomass: ["biomass", "waste"] };
  const plantFuels = (fuel)=>MIX_PLANT_FUELS[fuel] || [fuel];
  const mixFuel = (fuel)=>mixData && mixData.fuels.find(f=>f.fuel === fuel);

  // A layer's data as drawn: narrowed to the picked fuel (plant layers) and
  // to the status view (every layer with a file).
  function layerView(L){
    const fc = layerData[L.id] || { type:"FeatureCollection", features:[] };
    const fuels = fuelFilter && L.kind === "power" ? plantFuels(fuelFilter) : null;
    const statuses = STATUS_VIEWS[statusView].statuses;
    if(!fuels && !statuses) return fc;
    return { type:"FeatureCollection", features: fc.features.filter(f=>
      (!fuels || fuels.includes(f.properties.fuel_type)) &&
      (!statuses || statuses.includes(f.properties.status))) };
  }

  // ---------- Status view ----------
  // "In service" and "Pipeline" match the KPI tiles. Idle assets (a closed
  // interconnector, a stopped plant) show under "All" only.
  const STATUS_VIEWS = {
    all:      { statuses: null },
    service:  { statuses: ["operational"] },
    pipeline: { statuses: ["construction", "announced", "planned"] }
  };
  function renderStatusNote(){
    $("#statusRow").querySelectorAll(".seg-btn").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.status === statusView)));
    const note = $("#statusNote");
    note.hidden = statusView === "all";
    if(note.hidden) return;
    // Counted by status alone: a fuel picked in the mix doesn't change it.
    const statuses = STATUS_VIEWS[statusView].statuses;
    const all = COUNTRIES[currentCountry].layers.filter(L=>L.file)
      .flatMap(L=>(layerData[L.id] || { features:[] }).features);
    const total = all.length;
    const shown = all.filter(f=>statuses.includes(f.properties.status)).length;
    note.textContent = shown ? T.statusSome(nfmt(shown), nfmt(total), statusView === "pipeline")
      : statusView === "pipeline" ? T.statusNonePipe : T.statusNoneService;
  }
  function setStatusView(view){
    if(!STATUS_VIEWS[view] || view === statusView) return;
    statusView = view;
    renderStatusNote();
    renderLayerList(currentCountry);
    renderMixFilter();
    if(map && mapReady && dataReady){ hoveredLayer = null; closePopup(); buildMapLayers(currentCountry); }
    syncUrl();
  }
  $("#statusRow").querySelectorAll(".seg-btn").forEach(b=>b.addEventListener("click", ()=>setStatusView(b.dataset.status)));

  // Shares under 1 % keep a decimal, so a small fuel doesn't read as zero.
  const fmtShare = (v)=>v >= 0.95 ? nfmt(v) + PCT : v >= 0.1 ? nfmt(v, 1, 1) + PCT : v > 0 ? "<" + nfmt(0.1, 1, 1) + PCT : "—";
  const fmtAmount = (v, unit)=>(v >= 100 ? nfmt(v) : v >= 0.1 ? nfmt(v, 1, 1) : "<" + nfmt(0.1, 1, 1)) + " " + unit;
  // A mix fuel's label in the page's language.
  const fuelLabel = (f)=>MIX_LABEL[f.fuel] || f.label;
  // Plant capacity in text: MW under 1 GW, as the tiles show it.
  const fmtGW = (gw)=>gw >= 1 ? fmtAmount(gw, "GW") : nfmt(gw * 1000) + " MW";
  function el(tag, cls, text){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }

  // Built with DOM nodes, not HTML strings: every value is data.
  function renderMix(){
    const section = $("#mixSection");
    const m = mixData;
    section.hidden = !m;
    if(!m) return;
    const cap = mixMeasure === "capacity";
    const total = cap ? m.capacity_gw : m.generation_twh;
    const value = (f)=>cap ? f.capacity_gw : f.generation_twh;
    const share = (f)=>cap ? (total ? 100 * f.capacity_gw / total : 0) : f.generation_pct;
    const amount = (f)=>fmtAmount(value(f), cap ? "GW" : "TWh");

    $("#mixYear").textContent = "· " + m.year;
    const totalNum = fmtAmount(total, "").trim();
    $("#mixTotal").textContent = cap ? T.totalCap(totalNum) : T.totalGen(totalNum);
    section.querySelectorAll(".seg-btn").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.measure === mixMeasure)));
    section.classList.toggle("has-filter", !!fuelFilter);
    section.classList.remove("has-hot");   // a tap's hover must not outlive the rebuild

    const bar = $("#mixBar"), legend = $("#mixLegend");
    bar.replaceChildren(); legend.replaceChildren();
    m.fuels.forEach(f=>{
      const color = FUEL_COLOR[f.fuel] || "#888";
      const picked = fuelFilter === f.fuel;
      const tip = `${fuelLabel(f)}${COLON} ${amount(f)}, ${fmtShare(share(f))}`;
      if(value(f) > 0){
        const seg = el("span", "mix-seg" + (picked ? " picked" : ""));
        seg.dataset.fuel = f.fuel;
        seg.title = tip;
        seg.style.flexGrow = String(value(f));
        seg.style.background = color;
        seg.addEventListener("click", ()=>setFuelFilter(f.fuel));
        bar.appendChild(seg);
      }
      const li = el("li");
      const btn = el("button", "mix-key" + (picked ? " picked" : ""));
      btn.type = "button";
      btn.dataset.fuel = f.fuel;
      btn.title = tip + (picked ? T.keyPicked : T.keyPick);
      btn.setAttribute("aria-pressed", String(picked));
      const sw = el("span", "mix-swatch"); sw.style.background = color;
      btn.append(sw, el("span", "mix-label", fuelLabel(f)), el("span", "mix-val", fmtShare(share(f))));
      btn.addEventListener("click", ()=>setFuelFilter(f.fuel));
      li.appendChild(btn);
      legend.appendChild(li);
    });

    renderMixFilter();
    renderMixFacts(m);
    renderMixNote(m, cap);
  }

  // "Showing wind plants only · 12 on the map · Show all"
  function renderMixFilter(){
    const host = $("#mixFilter");
    const f = fuelFilter && mixFuel(fuelFilter);
    host.hidden = !f;
    host.replaceChildren();
    if(!f) return;
    const n = COUNTRIES[currentCountry].layers.filter(L=>L.kind === "power")
      .reduce((s, L)=>s + layerView(L).features.length, 0);
    host.append(el("span", null, T.filterLine(FR ? fuelLabel(f).toLowerCase() : fuelLabel(f), n)));
    const all = el("button", "link-btn", T.showAll);
    all.type = "button";
    all.addEventListener("click", ()=>setFuelFilter(null));
    host.appendChild(all);
  }

  function renderMixFacts(m){
    const dl = $("#mixFacts");
    dl.replaceChildren();
    const row = (k, v)=>{ dl.append(el("dt", null, k), el("dd", null, v)); };
    row(T.renewables, `${fmtShare(m.renewables_pct_generation)} ${T.ofGen}` +
      (m.renewables_pct_capacity != null ? ` · ${fmtShare(m.renewables_pct_capacity)} ${T.ofCap}` : ""));
    const imp = m.net_imports_twh;
    if(imp != null){
      if(Math.abs(imp) < 0.05) row(T.trade, T.balanced);
      else if(imp > 0) row(T.netImports, `${fmtAmount(imp, "TWh")}` +
        (m.demand_twh ? ` · ${fmtShare(100 * imp / m.demand_twh)} ${T.ofDemand}` : ""));
      else row(T.netExports, `${fmtAmount(-imp, "TWh")} · ${fmtShare(100 * -imp / m.generation_twh)} ${T.ofGen}`);
    }
    if(m.co2_intensity_g_per_kwh != null) row(T.co2, `${nfmt(m.co2_intensity_g_per_kwh)} g/kWh`);
  }

  // How much of the national fleet the plant layer holds, a capacity gap in
  // the source if any, and the citation.
  function renderMixNote(m, cap){
    const host = $("#mixNote");
    host.replaceChildren();
    const f = fuelFilter && mixFuel(fuelFilter);
    const keep = f ? plantFuels(f.fuel) : null;
    const mappedMW = featuresOfKind(currentCountry, "power")
      .filter(p=>p.properties.status === "operational" && (!keep || keep.includes(p.properties.fuel_type)))
      .reduce((s, p)=>s + (num(p.properties.capacity_mw) || 0), 0);
    const nationalGW = f ? f.capacity_gw : m.capacity_gw;
    const plantLayer = COUNTRIES[currentCountry].layers.find(L=>L.kind === "power");
    // A national total missing a fuel (capacity_gaps) would overstate coverage.
    const comparable = f ? !m.capacity_gaps.includes(f.fuel) : !m.capacity_gaps.length;
    if(plantLayer && nationalGW > 0 && comparable){
      const pct = 100 * mappedMW / 1000 / nationalGW;
      host.append(el("span", null, T.coverage(layerTitle(plantLayer), f ? (FR ? fuelLabel(f).toLowerCase() : fuelLabel(f)) : "",
        fmtGW(mappedMW / 1000),
        pct <= 100 ? T.coveragePct(nfmt(pct) + PCT, fmtGW(nationalGW)) : T.coverageOver(fmtGW(nationalGW)))));
    }
    if(cap && m.capacity_gaps.length){
      const names = m.capacity_gaps.map(g=>fuelLabel(mixFuel(g) || { fuel:g, label:g })).join(", ");
      host.append(el("span", "mix-gap", T.gap(names)));
    }
    host.append(el("span", null, T.source));
    const a = el("a", null, `Ember ${m.year}`);
    a.href = safeUrl(m.source_url); a.target = "_blank"; a.rel = "noopener";
    host.append(a, el("span", null, " (CC BY 4.0)."));
  }

  // Narrows the plant layers to one fuel (null: all). Picking the shown fuel
  // again clears it. Turns the plant layers on, so the pick is visible.
  function setFuelFilter(fuel){
    // The legend is rebuilt: keep keyboard focus on the fuel just used.
    const a = document.activeElement;
    const refocus = a && a.closest && a.closest("#mixSection") ? (fuel || fuelFilter) : null;
    fuelFilter = fuel && fuel !== fuelFilter ? fuel : null;
    const c = COUNTRIES[currentCountry];
    if(fuelFilter) c.layers.filter(L=>L.kind === "power").forEach(L=>{ visibility[L.id] = true; });
    renderMix();
    if(refocus){
      const key = [...document.querySelectorAll("#mixLegend .mix-key")].find(k=>k.dataset.fuel === refocus);
      if(key) key.focus();
    }
    renderLayerList(currentCountry);
    renderKPIs(currentCountry);
    if(map && mapReady && dataReady){ hoveredLayer = null; buildMapLayers(currentCountry); }
    syncUrl();
  }

  $("#mixSection").querySelectorAll(".seg-btn").forEach(b=>b.addEventListener("click", ()=>{
    if(mixMeasure === b.dataset.measure) return;
    mixMeasure = b.dataset.measure;
    renderMix();
    syncUrl();
  }));
  // Hovering a fuel lights it in both the bar and the legend. Pointer only:
  // focus moves back to the legend after a pick, and lighting the focused
  // key would read as a pick that "Show all" just cleared.
  function hotFuel(fuel){
    const section = $("#mixSection");
    section.classList.toggle("has-hot", !!fuel);
    section.querySelectorAll("[data-fuel]").forEach(e=>e.classList.toggle("hot", e.dataset.fuel === fuel));
  }
  $("#mixSection").addEventListener("mouseover", (e)=>{
    const t = e.target.closest && e.target.closest("[data-fuel]");
    hotFuel(t ? t.dataset.fuel : null);
  });
  $("#mixSection").addEventListener("mouseleave", ()=>hotFuel(null));

  // ---------- Layer ID bookkeeping ----------
  // Each data layer produces a set of MapLibre layers, registered in
  // `mapLayers` as they are added, so visibility toggles, click queries and
  // interactions all read the same table.
  function layersFor(dataLayerId){
    return Object.keys(mapLayers).filter(id=>mapLayers[id].dataLayerId === dataLayerId);
  }

  function queryableLayers(){
    // Only interactive (non-cluster, non-halo) layers
    return Object.keys(mapLayers).filter(id=>
      ["point","line"].includes(mapLayers[id].role) && map && map.getLayer(id));
  }

  // map.addLayer() plus registration. `src` is the source hover-dim works on
  // (the data source, not the text-only twin); `role` is null for decorative
  // layers (halos, labels) that take no interaction.
  function addLayer(L, spec, role, src){
    map.addLayer(spec);
    mapLayers[spec.id] = { dataLayerId: L.id, src: src || spec.source, role: role || null };
    wireLayer(spec.id);
  }

  // ---------- Build map layers ----------
  // Removes every layer and source this app added (all "lyr-*" / "src-*"),
  // leaving the basemap alone. A source can't be removed while a layer
  // still uses it, so layers go first. Without this, switching country threw
  // on the first addSource and the previous country's data stayed on screen.
  function clearDataLayers(){
    map.getStyle().layers.forEach(l=>{ if(l.id.startsWith("lyr-")) map.removeLayer(l.id); });
    Object.keys(map.getStyle().sources).forEach(id=>{ if(id.startsWith("src-")) map.removeSource(id); });
  }

  function buildMapLayers(countryKey){
    if(!map) return;
    clearDataLayers();
    mapLayers = {};
    if(overview){ buildOverviewLayers(); return; }
    const c = COUNTRIES[countryKey];

    // Each builder call is isolated: if one throws (bad MapLibre
    // expression, missing source, etc.), the rest still render and the
    // error surfaces in the console for the map-debugger agent.
    const safe = (label, fn) => {
      try { fn(); }
      catch(e){ console.error("[MoroccoMap] layer failed:", label, e); }
    };
    const builders = {
      oim:        (L)=>buildOimLayer(L),
      "oim-plants": (L)=>buildOimPlantsLayer(L),
      grid:       (L)=>buildLineLayer(L, layerView(L)),
      power:      (L)=>buildPowerLayer(L, layerView(L)),
      industrial: (L)=>buildIndustrialLayer(L, layerView(L)),
      digital:    (L)=>buildDigitalLayer(L, layerView(L))
    };
    c.layers.filter(L=>!KINDS.includes(L.kind)).forEach(L=>
      console.error("[MoroccoMap] unknown layer kind:", L.id, L.kind));

    KINDS.forEach(kind=>{
      c.layers.filter(L=>L.kind === kind).forEach(L=>safe(L.id, ()=>builders[kind](L)));
      // The country outline sits above the OSM grid, below our own layers.
      if(kind === "oim") safe("boundary", buildBoundaryLayer);
    });

    // Apply visibility from state
    Object.keys(visibility).forEach(id=>applyLayerVisibility(id, visibility[id]));
  }

  // OpenInfraMap vector overlay — full OSM-sourced transmission grid,
  // substations and plants. Free, ODbL, no API key, worldwide: the same
  // layer works for every country. Drawn below all editorial features so
  // our announced/planned overlays stay on top.
  // One OpenInfraMap tile source, shared by the grid and plant layers.
  const OIM_SRC = "src-oim-tiles";
  function ensureOimSource(){
    if(map.getSource(OIM_SRC)) return;
    map.addSource(OIM_SRC, {
      type: "vector",
      tiles: [OIM_TILES],
      minzoom: 0, maxzoom: 17,
      attribution: OIM_ATTR
    });
  }

  function buildOimLayer(L){
    const src = OIM_SRC, p = "lyr-" + L.id;
    ensureOimSource();

    // Lines — styled by voltage. OIM exposes a numeric `voltage` (volts).
    // Non-numeric / multi-voltage tags coerce to 0 and fall into LV.
    const voltExpr = ["coalesce", ["to-number", ["get","voltage"]], 0];
    addLayer(L, {
      id: p + "-line-lv", type:"line", source:src, "source-layer":"power_line",
      filter:["<", voltExpr, 100000],
      minzoom: 8,
      paint:{ "line-color": isDark() ? "rgba(229,228,224,0.22)" : "rgba(50,50,50,0.25)", "line-width":0.6 }
    });
    addLayer(L, {
      id: p + "-line-mv", type:"line", source:src, "source-layer":"power_line",
      filter:["all",[">=",voltExpr,100000],["<",voltExpr,300000]],
      paint:{ "line-color": isDark() ? "rgba(229,228,224,0.55)" : "rgba(50,50,50,0.65)", "line-width":1.0 }
    });
    addLayer(L, {
      id: p + "-line-hv", type:"line", source:src, "source-layer":"power_line",
      filter:[">=", voltExpr, 300000],
      paint:{ "line-color": isDark() ? GRID_COLOR : "#3b3b3f", "line-width":1.8, "line-opacity":0.9 }
    });

    // Substations — polygon at high zoom, points at low zoom
    addLayer(L, {
      id: p + "-substation-poly", type:"fill", source:src, "source-layer":"power_substation",
      minzoom: 10,
      paint:{
        "fill-color": isDark() ? "rgba(229,228,224,0.15)" : "rgba(50,50,50,0.12)",
        "fill-outline-color": isDark() ? "rgba(229,228,224,0.55)" : "rgba(50,50,50,0.5)"
      }
    });
    addLayer(L, {
      id: p + "-substation-pt", type:"circle", source:src, "source-layer":"power_substation_point",
      minzoom: 5,
      paint:{
        "circle-color": isDark() ? "rgba(229,228,224,0.75)" : "rgba(50,50,50,0.7)",
        "circle-radius":["interpolate",["linear"],["zoom"], 5,1.2, 10,3.5],
        "circle-stroke-color": isDark() ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)",
        "circle-stroke-width":0.5
      }
    });
  }

  // OpenStreetMap power plants, live from OpenInfraMap's power_plant_point
  // layer: every plant OSM mappers have traced, in any country. OIM thins it
  // by size at low zoom (all plants from zoom 8; >250 MW from 7, >500 MW
  // from 6), so it can't feed the KPI totals; those come from the curated
  // `power` layer, drawn above this one.
  // Tile fields: name, output (MW), source (first fuel), construction,
  // disused, start_date.
  const OSM_PLANT_SWATCH = "#b8b4a8";
  // OSM `plant:source` values → our fuel_type.
  const OSM_FUEL = { solar:"solar", wind:"wind", hydro:"hydro", coal:"coal",
                     gas:"gas", oil:"oil", diesel:"oil", nuclear:"nuclear",
                     geothermal:"geothermal", biomass:"biomass", biofuel:"biomass",
                     biogas:"biomass", waste:"waste" };
  function buildOimPlantsLayer(L){
    ensureOimSource();
    const fuelExpr = ["match", ["get","source"]];
    Object.entries(OSM_FUEL).forEach(([osm, fuel])=>fuelExpr.push(osm, FUEL_COLOR[fuel]));
    fuelExpr.push(OSM_PLANT_SWATCH);
    const spec = {
      id: "lyr-" + L.id + "-points", type:"circle", source: OIM_SRC, "source-layer":"power_plant_point",
      layout:{ "circle-sort-key": ["-", ["to-number", ["get","output"], 0]] },
      paint:{
        "circle-color": fuelExpr,
        "circle-radius": plantRadiusExpr("output"),
        "circle-opacity":0.75,
        "circle-stroke-color": isDark() ? "rgba(241,239,233,0.8)" : "rgba(24,24,26,0.7)",
        "circle-stroke-width":1
      }
    };
    const filters = [];
    if(fuelFilter){
      const keep = plantFuels(fuelFilter);
      filters.push(["in", ["get","source"], ["literal", Object.keys(OSM_FUEL).filter(k=>keep.includes(OSM_FUEL[k]))]]);
    }
    // OSM tags a plant being built with `construction`, a closed one `disused`.
    const tagged = (k)=>["to-boolean", ["coalesce", ["get", k], false]];
    if(statusView === "service") filters.push(["!", tagged("construction")], ["!", tagged("disused")]);
    if(statusView === "pipeline") filters.push(tagged("construction"));
    if(filters.length) spec.filter = ["all", ...filters];
    addLayer(L, spec, "point");
  }

  // Maps an OpenInfraMap plant's tile fields onto the curated power schema,
  // so the tooltip and popup render it like any other plant.
  function osmPlantProps(p, f){
    const [lng, lat] = f.geometry.coordinates;
    return {
      name: p.name || T.unnamedOsm,
      capacity_mw: typeof p.output === "number" ? Math.round(p.output * 10) / 10 : null,
      fuel_type: (Object.hasOwn(OSM_FUEL, p.source) && OSM_FUEL[p.source]) || p.source || "unknown",
      status: p.construction ? "construction" : p.disused ? "idle" : "operational",
      commissioning_year: p.start_date || null,
      source: T.osmSource,
      source_url: `https://openinframap.org/#14/${lat.toFixed(5)}/${lng.toFixed(5)}`,
      osm: true
    };
  }

  // Country outline from <dataPath>/boundary.geojson, if the country has one.
  // Morocco's is a dissolved single polygon (Morocco + Southern Provinces as
  // one territory — no internal border).
  function buildBoundaryLayer(){
    if(!boundaryData) return;
    addOrReplace("src-boundary", { type:"geojson", data: boundaryData });
    map.addLayer({
      id:"lyr-boundary-fill", type:"fill", source:"src-boundary",
      paint:{
        "fill-color": isDark() ? "rgba(255,255,255,0.03)" : "rgba(0,31,77,0.03)",
        "fill-outline-color":"rgba(0,0,0,0)"
      }
    });
    map.addLayer({
      id:"lyr-boundary-line", type:"line", source:"src-boundary",
      paint:{
        "line-color": isDark() ? "rgba(255,255,255,0.35)" : "rgba(0,31,77,0.45)",
        "line-width":1.0,
        "line-dasharray":[3,2]
      }
    });
  }

  function addOrReplace(id, spec){
    if(map.getSource(id)) map.removeSource(id);
    map.addSource(id, spec);
  }

  function buildLineLayer(L, fc){
    // Each grid layer gets its own source + layer ids, so two line layers
    // never clobber each other's data / visibility toggle (OBJ-map-debugger-5).
    const srcId = "src-" + L.id, p = "lyr-" + L.id;
    addOrReplace(srcId, { type:"geojson", data: fc });

    // Editorial overlay — interconnectors, HVDC corridors, planned/idle
    // strategic links. Rendered bold/colored on top of OIM's grey OSM grid
    // so the strategic story pops.
    // Interconnector color: blue family — distinct from wind's teal (#0D9488)
    const intColor = INTERCONNECTOR_COLOR();
    addLayer(L, { id:p+"-hv", type:"line", source:srcId,
      filter:["all",["==",["get","status"],"operational"],[">=",["get","voltage_kv"],300]],
      paint:{ "line-color": intColor, "line-width":2.6, "line-opacity":0.95 }}, "line");
    addLayer(L, { id:p+"-mv", type:"line", source:srcId,
      filter:["all",["==",["get","status"],"operational"],[">=",["get","voltage_kv"],100],["<",["get","voltage_kv"],300]],
      paint:{ "line-color": intColor, "line-width":1.6, "line-opacity":0.85 }}, "line");
    addLayer(L, { id:p+"-lv", type:"line", source:srcId,
      filter:["all",["==",["get","status"],"operational"],["<",["get","voltage_kv"],100]],
      paint:{ "line-color": intColor, "line-width":1.0, "line-opacity":0.6 }}, "line");
    addLayer(L, { id:p+"-planned", type:"line", source:srcId,
      filter:["==",["get","status"],"planned"],
      paint:{ "line-color":PLANNED_COLOR, "line-width":2.0, "line-opacity":0.95, "line-dasharray":[2,2] }}, "line");
    addLayer(L, { id:p+"-idle", type:"line", source:srcId,
      filter:["==",["get","status"],"idle"],
      paint:{ "line-color":"#8a877c", "line-width":1.6, "line-opacity":0.7, "line-dasharray":[1,2] }}, "line");
  }


  function buildPowerLayer(L, fc){
    const srcId = "src-" + L.id, p = "lyr-" + L.id;

    // Dense national fleets (France, Spain: 1,500+ plants) cluster wider so
    // the bubbles don't tile the whole screen on a phone.
    const dense = fc.features.length > 500;
    // Clusters carry their summed MW, shown instead of a plant count.
    const clusterOpts = { cluster: true, clusterMaxZoom: dense ? 7 : 6, clusterRadius: dense ? 60 : 35,
      clusterProperties: { mw: ["+", ["to-number", ["get","capacity_mw"], 0]] } };
    addOrReplace(srcId, { type:"geojson", data: fc, ...clusterOpts });
    // Same clustering on a text-only twin, so a font failure can't blank the bubbles.
    addOrReplace(srcId + "-text", { type:"geojson", data: fc, ...clusterOpts });

    // Cluster bubbles: amber, or the picked fuel's colour when the mix
    // legend narrows the layer to one fuel.
    const pickedColor = fuelFilter && FUEL_COLOR[fuelFilter];
    addLayer(L, {
      id: p+"-clusters", type:"circle", source:srcId,
      filter:["has","point_count"],
      paint:{
        "circle-color": pickedColor || "rgba(245,158,11,0.85)",
        "circle-opacity": pickedColor ? 0.85 : 1,
        // Same scale as a plant of the summed MW, never smaller than its
        // label ("999 MW") and capped so a national cluster stays on screen.
        "circle-radius": plantRadiusExpr("mw", (r)=>["max", 21, ["min", 56, r]]),
        "circle-stroke-color": isDark() ? "#070D1A" : "#ffffff",
        "circle-stroke-width":1.5
      }
    }, "cluster");
    addLayer(L, {
      id: p+"-cluster-count", type:"symbol", source:srcId + "-text",
      filter:["has","point_count"],
      layout:{
        // Rounded by hand: same text as fmtMW() ("850 MW", "4.2 GW").
        "text-field": CLUSTER_LABEL,
        "text-font":FONT_BOLD,
        "text-size":9.5,
        "text-allow-overlap":true
      },
      paint:{ "text-color": pickedColor && !isLight(pickedColor) ? "#FFFFFF" : "#070D1A" }
    });

    // Halo for announced/construction status
    addLayer(L, {
      id: p+"-halo", type:"circle", source:srcId,
      filter:["all",["!",["has","point_count"]],["in",["get","status"],["literal",["announced","construction"]]]],
      paint:{
        "circle-color":"rgba(245,158,11,0.25)",
        "circle-radius": plantRadiusExpr("capacity_mw", (r)=>["+", r, 4]),
        "circle-blur":0.3
      }
    });

    // Individual plants, colour by fuel, area by capacity. Small plants are
    // drawn last so a large neighbour never hides them.
    addLayer(L, {
      id: p+"-points", type:"circle", source:srcId,
      filter:["!",["has","point_count"]],
      layout:{ "circle-sort-key": ["-", ["to-number", ["get","capacity_mw"], 0]] },
      paint:{
        "circle-color":["match",["get","fuel_type"], ...Object.entries(FUEL_COLOR).flat(), "#888"],
        "circle-radius": plantRadiusExpr("capacity_mw"),
        "circle-stroke-color": POINT_STROKE(),
        "circle-stroke-width":1.5,
        "circle-opacity":[
          "case",
          ["boolean",["feature-state","dim"],false], 0.3,
          0.9
        ]
      }
    }, "point");

    // Labels sit just below each dot, whatever its size.
    addLabelLayer(L, p+"-labels", srcId + "-text", "name", 7, 1.1, ["!",["has","point_count"]], {
      "text-variable-anchor": ["top"],
      "text-radial-offset": plantRadiusExpr("capacity_mw", (r)=>["/", ["+", r, 2], 10.5])
    });
  }

  // Industrial consumers — coloured by the country's sector palette
  function buildIndustrialLayer(L, data){
    const sourceId = "src-" + L.id, p = "lyr-" + L.id;
    addOrReplace(sourceId, { type:"geojson", data, promoteId: "id" });

    addLayer(L, {
      id: p + "-points", type:"circle", source: sourceId,
      paint:{
        "circle-color": sectorColorExpr(),
        "circle-radius":["interpolate",["linear"],["zoom"], 4, 4, 7, 6, 10, 8],
        "circle-stroke-color": POINT_STROKE(),
        "circle-stroke-width":1.5,
        "circle-opacity":[
          "case",
          ["boolean",["feature-state","dim"],false], 0.3,
          1
        ]
      }
    }, "point");
    addOrReplace(sourceId + "-text", { type:"geojson", data });
    addLabelLayer(L, p + "-labels", sourceId + "-text", "name", 7, 1.1);
  }

  // "850 MW", "4.2 GW" (French "4,2 GW"): tenths of a GW, split into the
  // whole and the decimal part so the separator follows the language.
  const CLUSTER_TENTHS = ["round", ["/", ["get","mw"], 100]];
  const CLUSTER_LABEL = ["case", [">=", ["get","mw"], 1000],
    ["concat", ["to-string", ["floor", ["/", CLUSTER_TENTHS, 10]]],
      ["case", ["==", ["%", CLUSTER_TENTHS, 10], 0], "", ["concat", FR ? "," : ".", ["to-string", ["%", CLUSTER_TENTHS, 10]]]],
      " GW"],
    ["concat", ["to-string", ["round", ["get","mw"]]], " MW"]];

  // Relative luminance above ~0.18, where dark text out-contrasts white.
  function isLight(hex){
    const [r, g, b] = [1, 3, 5].map(i=>parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c=>c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18;
  }
  const POINT_STROKE = () => isDark() ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)";

  // Name labels live on a separate text-only source: MapLibre drops every
  // layer of a source whose glyphs fail to load, and points must survive that.
  // `layout` adds or overrides layout properties; a text-radial-offset
  // replaces the fixed text-offset.
  function addLabelLayer(L, id, sourceId, field, minzoom, offset, filter, layout){
    const spec = {
      id, type:"symbol", source: sourceId, minzoom,
      layout:{
        "text-field":["get", field],
        "text-font":FONT_REGULAR,
        "text-size":10.5,
        "text-offset":[0, offset],
        "text-anchor":"top",
        "text-allow-overlap":false
      },
      paint:{
        "text-color": isDark() ? "#EEF2F8" : "#0A1628",
        "text-halo-color": isDark() ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
        "text-halo-width":1.5
      }
    };
    if(filter) spec.filter = filter;
    if(layout){
      if("text-radial-offset" in layout){ delete spec.layout["text-offset"]; delete spec.layout["text-anchor"]; }
      Object.assign(spec.layout, layout);
    }
    addLayer(L, spec);
  }

  function buildDigitalLayer(L, fc){
    const srcId = "src-" + L.id, p = "lyr-" + L.id;
    addOrReplace(srcId, { type:"geojson", data: fc, promoteId: "id" });

    // Halo for announced status (pulsing-style, static render)
    addLayer(L, {
      id: p+"-halo", type:"circle", source: srcId,
      filter:["any",["==",["get","status"],"announced"],["==",["get","status"],"construction"]],
      paint:{
        "circle-color":"rgba(124,58,237,0.22)",
        "circle-radius":13,
        "circle-blur":0.35
      }
    });

    // Regular DCs (non-cable). Radius scales with capacity; planned/announced
    // DCs render at lower opacity with a dashed stroke so the pipeline is
    // visually distinct from energised capacity.
    addLayer(L, {
      id: p+"-points", type:"circle", source: srcId,
      filter:["!=",["get","category"],"cable_landing"],
      paint:{
        "circle-color": providerColorExpr(),
        "circle-radius":[
          "interpolate",["linear"],
          ["coalesce",["get","capacity_estimate_mw"], 3],
          0, 5,
          10, 7,
          40, 11,
          100, 16,
          300, 22
        ],
        "circle-stroke-color":[
          "case",
          ["in",["get","status"],["literal",["announced","construction","planned"]]], "rgba(163,125,240,0.9)",
          POINT_STROKE()
        ],
        "circle-stroke-width":1.5,
        "circle-opacity":[
          "case",
          ["boolean",["feature-state","dim"],false], 0.25,
          ["==",["get","status"],"announced"], 0.38,
          ["==",["get","status"],"planned"],   0.38,
          ["==",["get","status"],"construction"], 0.65,
          0.95
        ]
      }
    }, "point");

    // Cable landings — small teal circle with a contrasting ring. Drawn as
    // a circle rather than a "◆" glyph so it needs no font to render.
    addLayer(L, {
      id: p+"-cables", type:"circle", source: srcId,
      filter:["==",["get","category"],"cable_landing"],
      paint:{
        "circle-color": CABLE_COLOR,
        "circle-radius":["interpolate",["linear"],["zoom"], 4, 4.5, 10, 7],
        "circle-stroke-color": isDark() ? "#070D1A" : "#ffffff",
        "circle-stroke-width":2,
        "circle-opacity":["case",["boolean",["feature-state","dim"],false], 0.3, 1]
      }
    }, "point");

    addOrReplace(srcId + "-text", { type:"geojson", data: fc });
    addLabelLayer(L, p+"-labels", srcId + "-text", "name", 7, 1.2);
  }

  // ---------- Layer interactions (hover dim + tooltip + click) ----------
  // Layer-scoped handlers survive setStyle() and removeLayer(), so each map
  // layer id is wired once, the first time a layer with that id and a role is
  // added; re-wiring on every rebuild stacked duplicate handlers. Handlers
  // read `mapLayers` when they fire, so they always act on the current
  // country's layer of that id, and do nothing once it is gone.
  const wiredLayers = new Set();
  function wireLayer(id){
    if(!mapLayers[id].role || wiredLayers.has(id)) return;
    wiredLayers.add(id);
    const current = ()=>mapLayers[id];

    map.on("mousemove", id, (e)=>{
      const m = current(); const f = e.features[0];
      if(!m || !f) return;
      map.getCanvas().style.cursor = "pointer";
      if(m.role === "point"){
        setHoverDim(m.src, m.dataLayerId, f.id);
        showPointTooltip(m.dataLayerId, f, e.point);
      } else if(m.role === "line"){
        showLineTooltip(f, e.point);
      } else if(m.role === "cluster"){
        showClusterTooltip(f, e.point);
      }
    });
    map.on("mouseleave", id, ()=>{
      if(!current()) return;
      map.getCanvas().style.cursor = "";
      clearHoverDim();
      hideTooltip();
    });
    map.on("click", id, (e)=>{
      const m = current(); const f = e.features[0];
      if(!m || !f) return;
      if(m.role === "cluster"){
        // Cluster click → zoom in (MapLibre 4: getClusterExpansionZoom returns a promise)
        map.getSource(m.src).getClusterExpansionZoom(f.properties.cluster_id)
          .then(zoom=>map.easeTo({ center: f.geometry.coordinates, zoom }))
          .catch(()=>{});
        return;
      }
      e.originalEvent.stopPropagation();
      if(m.role === "point"){
        openPointPopup(m.dataLayerId, f);
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 7), duration: 600 });
      } else if(m.role === "line"){
        openLinePopup(m.dataLayerId, f);
      }
    });
  }

  // ---------- Hover dim: set `dim=true` on all OTHER features in a layer ----------
  function setDim(sourceId, dataLayerId, keepId, dim){
    const fc = layerData[dataLayerId];
    if(!fc || !map.getSource(sourceId)) return;   // live tiles, or a removed source
    fc.features.forEach(f=>{
      if(f.id != null && f.id !== keepId) map.setFeatureState({ source: sourceId, id: f.id }, { dim });
    });
  }
  function setHoverDim(sourceId, dataLayerId, keepId){
    const h = hoveredLayer;
    if(h && h.sourceId === sourceId && h.keepId === keepId) return;
    clearHoverDim();
    setDim(sourceId, dataLayerId, keepId, true);
    hoveredLayer = { sourceId, dataLayerId, keepId };
  }
  function clearHoverDim(){
    if(!hoveredLayer) return;
    const { sourceId, dataLayerId } = hoveredLayer;
    setDim(sourceId, dataLayerId, null, false);
    hoveredLayer = null;
  }

  function applyLayerVisibility(dataLayerId, on){
    if(!map) return;
    const ids = layersFor(dataLayerId);
    ids.forEach(id=>{
      if(map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    });
  }

  // ---------- Tooltip ----------
  function showPointTooltip(dataLayerId, f, point){
    let p = f.properties || {};
    let kind = layerKind(dataLayerId);
    if(kind === "oim-plants"){ p = osmPlantProps(p, f); kind = "power"; }
    let metric = "", dot = "";
    if(kind === "power")           metric = `${fmtCap(p.capacity_mw)} · ${word(FUEL_WORD, p.fuel_type) || ""}`;
    else if(kind === "industrial") metric = `${word(SECTOR_WORD, p.sector) || ""} · ${T.estDemand} ${fmtCap(p.estimated_demand_mw)}`;
    else if(kind === "digital"){
      if(p.category === "cable_landing"){
        metric = [T.cableLanding, p.operator].filter(Boolean).join(" · ");
        dot = CABLE_COLOR;
      } else {
        const prov = palette().providers.find(x => x.key === p.operator);
        metric = [prov ? prov.short : p.operator,
                  p.capacity_estimate_mw != null ? fmtCap(p.capacity_estimate_mw) : "",
                  word(STATUS_WORD_ALL, p.status)].filter(Boolean).join(" · ");
        dot = prov ? prov.color : DIGITAL_COLOR;
      }
    }
    tooltip.innerHTML = `
      <div class="tt-name">${dot ? `<span class="tt-dot" data-bg="${escapeHtml(dot)}"></span>` : ""}${escapeHtml(p.name)}</div>
      <div class="tt-metric">${escapeHtml(metric)}</div>
      <div class="tt-meta">
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>` : escapeHtml(p.source || "—")}
        ${p.commissioning_year || p.year ? " · " + escapeHtml(p.commissioning_year || p.year) : ""}
      </div>`;
    paint(tooltip);
    positionTooltip(point);
  }
  function showLineTooltip(f, point){
    const p = f.properties || {};
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(p.name)}</div>
      <div class="tt-metric">${escapeHtml(p.voltage_kv)} kV · ${escapeHtml(word(STATUS_WORD_ALL, p.status) || "")}</div>
      <div class="tt-meta">${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>` : escapeHtml(p.source || "—")}</div>`;
    positionTooltip(point);
  }
  function showClusterTooltip(f, point){
    const p = f.properties || {};
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(T.clusterTip(nfmt(num(p.point_count) || 0), fmtMW(num(p.mw) || 0)))}</div>
      <div class="tt-metric">${T.clusterHint}</div>`;
    positionTooltip(point);
  }
  function positionTooltip(point){
    const rect = $("#map").getBoundingClientRect();
    tooltip.style.left = (rect.left + point.x) + "px";
    tooltip.style.top  = (rect.top  + point.y) + "px";
    tooltip.style.display = "block";
  }
  function hideTooltip(){ tooltip.style.display = "none"; }

  // ---------- Popup ----------
  function openPointPopup(dataLayerId, f){
    let p = f.properties || {};
    // OSM plants have no stable id of ours: the link keeps the view only.
    selected = layerKind(dataLayerId) !== "oim-plants" && p.id != null ? { layer: dataLayerId, id: String(p.id) } : null;
    let kind = layerKind(dataLayerId);
    if(kind === "oim-plants"){ p = osmPlantProps(p, f); kind = "power"; }
    const badgeClass = kind === "power" ? "power" : kind === "industrial" ? "industrial" : kind === "digital" ? "digital" : "grid";
    const badgeLabel = kind === "power" ? (p.osm ? T.badgeOsm : T.badgeGen)
                     : kind === "industrial" ? T.badgeIndustry
                     : kind === "digital" ? (p.category === "cable_landing" ? T.badgeCable : T.badgeDC)
                     : T.badgeInfra;

    let stats = "";
    if(kind === "power"){
      stats = `
        <div class="cell"><div class="k">${T.capacity}</div><div class="v">${fmtCap(p.capacity_mw)}</div></div>
        <div class="cell"><div class="k">${T.fuel}</div><div class="v cap">${escapeHtml(word(FUEL_WORD, p.fuel_type))}</div></div>
        <div class="cell"><div class="k">${T.technology}</div><div class="v sm">${escapeHtml(p.tech || "—")}</div></div>
        <div class="cell"><div class="k">${p.status==="operational" ? T.commissioned : T.targetYear}</div><div class="v">${escapeHtml(p.commissioning_year || "—")}</div></div>`;
    } else if(kind === "industrial"){
      stats = `
        <div class="cell"><div class="k">${T.sector}</div><div class="v sm">${escapeHtml(word(SECTOR_WORD, p.sector))}</div></div>
        <div class="cell"><div class="k">${T.estDemandK}</div><div class="v">${fmtCap(p.estimated_demand_mw)}</div></div>
        <div class="cell"><div class="k">${T.gridConnection}</div><div class="v xs">${escapeHtml(p.grid_connection || "—")}</div></div>
        <div class="cell"><div class="k">${T.precision}</div><div class="v cap">${escapeHtml(word(PRECISION_WORD, p.precision) || "—")}</div></div>`;
    } else if(kind === "digital"){
      stats = `
        <div class="cell"><div class="k">${T.operator}</div><div class="v sm">${escapeHtml(p.operator || "—")}</div></div>
        <div class="cell"><div class="k">${T.capacity}</div><div class="v">${p.capacity_estimate_mw!=null ? fmtCap(p.capacity_estimate_mw) : "—"}</div></div>
        <div class="cell"><div class="k">${T.investment}</div><div class="v">${fmtInvestment(p.investment_usd)}</div></div>
        <div class="cell"><div class="k">${p.status==="operational" ? T.energised : T.targetYear}</div><div class="v">${escapeHtml(p.year || "—")}</div></div>`;
    }

    const [lng, lat] = f.geometry.coordinates;
    const deg = (v)=>nfmt(Math.abs(v), 2, 2) + (FR ? "° " : "°");
    const coords = `${deg(lat)}${lat>=0?"N":"S"}, ${deg(lng)}${lng>=0?"E":T.west}`;

    const dotColor = badgeClass==='power'      ? (FUEL_COLOR[p.fuel_type] || FUEL_COLOR.solar)
                   : badgeClass==='industrial' ? INDUSTRIAL_COLOR
                   : badgeClass==='digital'    ? (p.category==='cable_landing' ? CABLE_COLOR : DIGITAL_COLOR)
                   : GRID_COLOR;

    $("#popupBadge").innerHTML = `<span class="badge ${badgeClass}"><span class="dot" data-bg="${escapeHtml(dotColor)}"></span>${badgeLabel}</span>`;
    paint($("#popupBadge"));
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${p.region ? escapeHtml(p.region) + " · " : ""}${coords}</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(word(STATUS_WORD_ALL, p.status || "operational"))}</span>
      <div class="stat-grid">${stats}</div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}${p.vintage ? " · " + escapeHtml(p.vintage) : ""}</span>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>${T.rawData}</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        ${p.osm
          // OSM data is fixed at the source, where every map using it benefits.
          ? `<a href="${escapeHtml(safeUrl(p.source_url))}" target="_blank" rel="noopener">${T.viewOim}</a>
             <a href="https://www.openstreetmap.org/#map=17/${f.geometry.coordinates[1].toFixed(5)}/${f.geometry.coordinates[0].toFixed(5)}" target="_blank" rel="noopener">${T.fixOsm}</a>`
          : `<a href="${escapeHtml(issueUrl(T.issueFeature(countryLabel(COUNTRIES[currentCountry]), p.name), T.issueBody(p.id || p.name)))}" target="_blank" rel="noopener">${T.reportError}</a>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${T.primarySource}</a>` : ""}`}
        ${selected ? `<button type="button" class="pop-share">${T.copyLink}</button>` : ""}
      </div>`;
    wirePopupShare();
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
    syncUrl();
  }

  function openLinePopup(dataLayerId, f){
    const p = f.properties || {};
    selected = p.id != null ? { layer: dataLayerId, id: String(p.id) } : null;
    $("#popupBadge").innerHTML = `<span class="badge grid"><span class="dot" data-bg="${escapeHtml(GRID_COLOR)}"></span>${T.badgeLine}</span>`;
    paint($("#popupBadge"));
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${escapeHtml(p.voltage_kv)} kV</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(word(STATUS_WORD_ALL, p.status || "operational"))}</span>
      <div class="stat-grid">
        <div class="cell"><div class="k">${T.voltage}</div><div class="v">${escapeHtml(p.voltage_kv)} kV</div></div>
        <div class="cell"><div class="k">${T.status}</div><div class="v cap">${escapeHtml(word(STATUS_WORD_ALL, p.status))}</div></div>
        <div class="cell"><div class="k">${T.precision}</div><div class="v cap">${escapeHtml(word(PRECISION_WORD, p.precision || "approximate"))}</div></div>
        <div class="cell"><div class="k">${T.kind}</div><div class="v">${p.kind === "hvdc_planned" ? T.hvdcPlanned : T.ac}</div></div>
      </div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}</span>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>${T.rawData}</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        <a href="${escapeHtml(issueUrl(T.issueFeature(countryLabel(COUNTRIES[currentCountry]), p.name)))}" target="_blank" rel="noopener">${T.reportError}</a>
        ${selected ? `<button type="button" class="pop-share">${T.copyLink}</button>` : ""}
      </div>`;
    wirePopupShare();
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
    syncUrl();
  }

  function closePopup(){
    const wasOpen = popup.classList.contains("open");
    popup.classList.remove("open");
    popup.setAttribute("aria-hidden","true");
    selected = null;
    if(wasOpen) syncUrl();
  }
  function wirePopupShare(){
    const b = popup.querySelector(".pop-share");
    if(b) b.addEventListener("click", shareView);
  }

  // ---------- Shareable link ----------
  // The view lives in the URL hash, so a link reopens the same map:
  //   #country=france&map=7.20/45.7600/4.8400&status=pipeline&fuel=wind
  //    &measure=capacity&layers=power-plants,oim-grid&feature=power-plants:ppm-fr-2265
  // Defaults are left out. Written with replaceState (no history entry per
  // pan); a pasted or edited hash is applied on hashchange.
  let urlReady = false;      // false until a shared link has been applied
  const LINK_SAFE = (v)=>encodeURIComponent(v).replace(/%2C/g, ",").replace(/%2F/g, "/").replace(/%3A/g, ":");

  function readLink(){
    const q = new URLSearchParams(location.hash.replace(/^#/, ""));
    const link = { country: q.get("country"), status: q.get("status"), fuel: q.get("fuel"),
                   measure: q.get("measure"), layers: null, view: null, feature: null,
                   overview: q.get("view") === "overview", metric: q.get("metric") };
    const v = (q.get("map") || "").split("/").map(Number);
    if(v.length === 3 && v.every(Number.isFinite) && Math.abs(v[1]) <= 90 && Math.abs(v[2]) <= 180)
      link.view = { zoom: Math.min(Math.max(v[0], 1), 18), center: [v[2], v[1]] };
    if(q.has("layers")) link.layers = q.get("layers").split(",").filter(Boolean);
    const f = q.get("feature");
    if(f && f.includes(":")){ const i = f.indexOf(":"); link.feature = { layer: f.slice(0, i), id: f.slice(i + 1) }; }
    return link;
  }

  // Filters and layer choices from a link, for the country now loaded.
  // Unknown values fall back to the defaults.
  function applyLinkState(link){
    statusView = STATUS_VIEWS[link.status] ? link.status : "all";
    mixMeasure = link.measure === "capacity" ? "capacity" : "generation";
    fuelFilter = link.fuel && mixFuel(link.fuel) ? link.fuel : null;
    if(link.layers) COUNTRIES[currentCountry].layers.forEach(L=>{ visibility[L.id] = link.layers.includes(L.id); });
  }

  function writeLink(){
    const c = COUNTRIES[currentCountry];
    const mapPart = ()=>{ const ctr = map.getCenter(); return ["map", `${map.getZoom().toFixed(2)}/${ctr.lat.toFixed(4)}/${ctr.lng.toFixed(4)}`]; };
    // #view=overview&map=…&metric=co2
    if(overview){
      const parts = [["view", "overview"]];
      if(map) parts.push(mapPart());
      if(overviewMetric !== "renewables") parts.push(["metric", overviewMetric]);
      return "#" + parts.map(([k, v])=>`${k}=${LINK_SAFE(v)}`).join("&");
    }
    const parts = [["country", currentCountry]];
    if(map) parts.push(mapPart());
    if(statusView !== "all") parts.push(["status", statusView]);
    if(fuelFilter) parts.push(["fuel", fuelFilter]);
    if(mixMeasure !== "generation") parts.push(["measure", mixMeasure]);
    if(c.layers.some(L=>(visibility[L.id] !== false) !== (L.visible !== false)))
      parts.push(["layers", c.layers.filter(L=>visibility[L.id] !== false).map(L=>L.id).join(",")]);
    if(selected) parts.push(["feature", `${selected.layer}:${selected.id}`]);
    return "#" + parts.map(([k, v])=>`${k}=${LINK_SAFE(v)}`).join("&");
  }
  function syncUrl(force){
    if(!urlReady && !force) return;
    const hash = writeLink();
    if(hash !== location.hash){
      try{ history.replaceState(null, "", hash); } catch(e){ /* sandboxed frame: the link stays as it was */ }
    }
    syncLangLink();
  }
  // The other language's page opens on the same view: fr/#country=… ↔ ../#country=…
  const langLink = $("#langLink");
  function syncLangLink(){ if(langLink) langLink.href = langLink.dataset.path + location.hash; }

  // Opens the popup of a linked feature; `fly` centres the map on it when the
  // link carried no view of its own.
  // `smooth` animates the move (search); a link jumps. Returns false when
  // the feature isn't in the loaded data.
  function linkedFeature(ref){
    const L = layerConfig(ref.layer);
    const fc = layerData[ref.layer];
    const f = L && L.file && fc && fc.features.find(x=>String(x.properties.id) === ref.id);
    return f ? { L, f } : null;
  }
  function openLinkedFeature(ref, fly, smooth){
    const hit = linkedFeature(ref);
    if(!hit) return false;
    const { L, f } = hit;
    if(L.kind === "grid"){
      openLinePopup(L.id, f);
      if(fly){
        const pts = (f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat());
        const lng = pts.map(p=>p[0]), lat = pts.map(p=>p[1]);
        map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 60, duration: smooth ? 1200 : 0 });
      }
    } else {
      openPointPopup(L.id, f);
      const view = { center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 8) };
      if(fly) smooth ? map.flyTo({ ...view, speed: 1.2, curve: 1.4 }) : map.jumpTo(view);
    }
    return true;
  }

  // Makes a feature visible before going to it: its layer on, and a fuel or
  // status filter that hides it lifted. Returns whether anything changed.
  function revealFeature(ref){
    const hit = linkedFeature(ref);
    if(!hit) return false;
    const { L, f } = hit;
    let changed = false;
    if(visibility[L.id] === false){ visibility[L.id] = true; changed = true; }
    if(fuelFilter && L.kind === "power" && !plantFuels(fuelFilter).includes(f.properties.fuel_type)){ fuelFilter = null; changed = true; }
    const statuses = STATUS_VIEWS[statusView].statuses;
    if(statuses && !statuses.includes(f.properties.status)){ statusView = "all"; changed = true; }
    return changed;
  }

  // Share: the system sheet on phones, the clipboard elsewhere.
  const toast = $("#toast");
  let toastTimer = 0;
  function showToast(text){
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ toast.hidden = true; }, 2600);
  }
  async function shareView(){
    syncUrl(true);
    const url = location.href;
    if(navigator.share && matchMedia("(hover: none)").matches){
      try{ await navigator.share({ title: document.title, url }); return; }
      catch(e){ if(e && e.name === "AbortError") return; }
    }
    try{ await navigator.clipboard.writeText(url); showToast(T.linkCopied); }
    catch(e){ showToast(T.copyFromBar); }
  }
  $("#shareBtn").addEventListener("click", shareView);

  // A link pasted into this tab, or an edited hash.
  window.addEventListener("hashchange", ()=>{
    syncLangLink();
    if(location.hash === writeLink()) return;
    const link = readLink();
    if(link.overview){
      if(!overview){ enterOverview(link); return; }
      overviewMetric = OVERVIEW_METRICS[link.metric] ? link.metric : "renewables";
      renderOverview();
      if(map && mapReady){ buildMapLayers(currentCountry); if(link.view) map.jumpTo(link.view); }
      return;
    }
    if(overview){ switchCountry(ENABLED.includes(link.country) ? link.country : currentCountry, link); return; }
    if(ENABLED.includes(link.country) && link.country !== currentCountry){ switchCountry(link.country, link); return; }
    closePopup();
    applyLinkState(link);
    renderPanel(currentCountry);
    if(map && mapReady && dataReady){
      hoveredLayer = null;
      buildMapLayers(currentCountry);
      if(link.view) map.jumpTo(link.view);
      if(link.feature) openLinkedFeature(link.feature, !link.view);
    }
  });
  $("#popupClose").addEventListener("click", closePopup);
  document.addEventListener("keydown", (e)=>{
    // "/" jumps to the search box, unless the user is typing somewhere.
    if(e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey &&
       !/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "")){
      e.preventDefault();
      searchInput.focus();
      return;
    }
    if(e.key !== "Escape") return;
    if(!methModal.classList.contains("hidden")) methModal.classList.add("hidden");
    else closePopup();
  });

  // ---------- Country switch ----------
  // ---------- Search ----------
  // Names (and operator, sector, region, fuel) of every mapped asset in every
  // country, plus country names. The other countries' files load on the
  // first keystroke, not on page load. OSM plants are live tiles: not indexed.
  const searchInput = $("#searchInput"), searchResults = $("#searchResults");
  const norm = (v)=>String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const SEARCH_MAX = 8;
  // Only statuses worth flagging in a result line: operating is the default.
  const STATUS_WORD = FR
    ? { construction:"en construction", announced:"annoncé", planned:"planifié", idle:"à l'arrêt" }
    : { construction:"under construction", announced:"announced", planned:"planned", idle:"idle" };

  function searchEntries(countryKey, data){
    const c = COUNTRIES[countryKey];
    return c.layers.filter(L=>L.file && data[L.id]).flatMap(L=>data[L.id].features.map(f=>{
      const p = f.properties || {};
      if(p.id == null || !p.name) return null;
      const mw = num(p.capacity_mw) ?? num(p.capacity_estimate_mw) ?? num(p.estimated_demand_mw);
      const what = L.kind === "power" ? [T.powerPlant, word(FUEL_WORD, p.fuel_type)]
        : L.kind === "industrial" ? [word(SECTOR_WORD, p.sector) || T.industry]
        : L.kind === "digital" ? [p.category === "cable_landing" ? T.cableShort : T.dataCentre, p.operator]
        : [num(p.voltage_kv) != null ? `${T.line} · ${p.voltage_kv} kV` : T.line];
      // Industry carries an estimated demand, not a capacity.
      const size = mw == null || L.kind === "grid" ? "" : L.kind === "industrial" ? T.demand(fmtMW(mw)) : fmtMW(mw);
      const meta = [...what, size, STATUS_WORD[p.status], countryLabel(c)].filter(Boolean).join(" · ");
      const color = L.kind === "power" ? FUEL_COLOR[p.fuel_type] || "#888"
        : L.kind === "industrial" ? INDUSTRIAL_COLOR
        : L.kind === "digital" ? (p.category === "cable_landing" ? CABLE_COLOR : DIGITAL_COLOR)
        : INTERCONNECTOR_COLOR();
      return { country: countryKey, layer: L.id, id: String(p.id), name: String(p.name), meta, color, mw: mw || 0,
               nameN: norm(p.name), hay: norm([p.name, p.operator, p.sector, word(SECTOR_WORD, p.sector), p.region,
                                               p.fuel_type, word(FUEL_WORD, p.fuel_type)].filter(Boolean).join(" ")) };
    })).filter(Boolean);
  }
  async function loadSearchEntries(key){
    const c = COUNTRIES[key], data = {};
    await Promise.all(c.layers.filter(L=>L.file).map(async L=>{
      try{ const r = await fetch(dataUrl(c, L.file)); if(r.ok) data[L.id] = await r.json(); }
      catch(e){ /* that layer isn't searchable this time */ }
    }));
    return searchEntries(key, data);
  }
  let allEntries = null, allEntriesLoading = null;
  function ensureSearchIndex(){
    if(!allEntriesLoading){
      allEntriesLoading = Promise.all(ENABLED.map(loadSearchEntries)).then(lists=>{
        allEntries = lists.flat();
        if(searchInput.value.trim()) runSearch();
      });
    }
  }

  // Every word must match; name starts first, the current country next,
  // then the larger asset.
  function rankEntries(entries, q){
    const words = q.split(/\s+/).filter(Boolean);
    return entries.map(e=>{
      if(!words.every(w=>e.hay.includes(w))) return null;
      const score = (e.nameN.startsWith(q) ? 100 : e.nameN.includes(" " + q) ? 60 : e.nameN.includes(q) ? 40 : 10)
        + (e.country === currentCountry ? 30 : 0) + Math.min(20, 5 * Math.log10(1 + e.mw));
      return { e, score };
    }).filter(Boolean).sort((a, b)=>b.score - a.score).slice(0, SEARCH_MAX).map(x=>x.e);
  }

  let searchOptions = [], activeOption = -1;
  function runSearch(){
    const q = norm(searchInput.value.trim());
    if(q.length < 2){ closeResults(); return; }
    ensureSearchIndex();
    // Both names match ("spain" on the French page too); the page's is shown.
    const countries = ENABLED.filter(k=>norm(COUNTRIES[k].label + " " + (COUNTRIES[k].labelFr || "")).includes(q))
      .map(k=>({ country: k, isCountry: true, name: countryLabel(COUNTRIES[k]), meta: k === currentCountry ? T.currentCountry : T.goCountry }));
    const pool = allEntries || searchEntries(currentCountry, layerData);
    searchOptions = [...countries, ...rankEntries(pool, q)].slice(0, SEARCH_MAX);
    activeOption = searchOptions.length ? 0 : -1;
    renderResults(q, !allEntries);
  }

  // Name with the match marked, as DOM nodes.
  function markedName(name, q){
    const span = el("span", "so-name");
    const n = norm(name), i = n.indexOf(q);
    // Positions only line up when folding accents kept the length.
    if(i < 0 || n.length !== name.length){ span.textContent = name; return span; }
    span.append(document.createTextNode(name.slice(0, i)), el("mark", null, name.slice(i, i + q.length)),
                document.createTextNode(name.slice(i + q.length)));
    return span;
  }

  function renderResults(q, partial){
    searchResults.replaceChildren();
    searchOptions.forEach((o, i)=>{
      const li = el("li", "search-opt" + (o.isCountry ? " is-country" : ""));
      li.id = "search-opt-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeOption));
      const dot = el("span", "so-dot");
      if(o.isCountry) dot.textContent = "→"; else dot.style.background = o.color;
      const text = el("span", "so-text");
      text.append(markedName(o.name, q), el("span", "so-meta", o.meta));
      li.append(dot, text);
      li.addEventListener("mousedown", (e)=>e.preventDefault());   // keep focus in the box
      li.addEventListener("click", ()=>chooseResult(o));
      searchResults.appendChild(li);
    });
    if(!searchOptions.length || partial){
      searchResults.appendChild(el("li", "search-note", partial
        ? T.searching
        : T.noMatch));
    }
    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    searchInput.setAttribute("aria-activedescendant", activeOption >= 0 ? "search-opt-" + activeOption : "");
  }
  function closeResults(){
    searchResults.hidden = true;
    searchResults.replaceChildren();
    searchOptions = []; activeOption = -1;
    searchInput.setAttribute("aria-expanded", "false");
    searchInput.removeAttribute("aria-activedescendant");
  }
  function moveActive(step){
    if(!searchOptions.length) return;
    activeOption = (activeOption + step + searchOptions.length) % searchOptions.length;
    searchResults.querySelectorAll(".search-opt").forEach((li, i)=>li.setAttribute("aria-selected", String(i === activeOption)));
    searchInput.setAttribute("aria-activedescendant", "search-opt-" + activeOption);
    const li = $("#search-opt-" + activeOption);
    if(li) li.scrollIntoView({ block: "nearest" });
  }

  // Goes to a result: the country, or the asset with its popup, lifting any
  // filter that would hide it.
  async function chooseResult(o){
    closeResults();
    if(o.isCountry){
      searchInput.value = "";
      if(o.country !== currentCountry || overview) await switchCountry(o.country, null);
      return;
    }
    searchInput.value = o.name;
    const ref = { layer: o.layer, id: o.id };
    if(o.country !== currentCountry || overview){
      await switchCountry(o.country, { status: statusView, measure: mixMeasure, fuel: null, layers: null,
                                       view: null, feature: ref, reveal: true, smooth: true });
      return;
    }
    if(revealFeature(ref)){
      renderPanel(currentCountry);
      if(map && mapReady && dataReady){ hoveredLayer = null; buildMapLayers(currentCountry); }
    }
    if(map && mapReady) openLinkedFeature(ref, true, true);
  }

  let searchTimer = 0;
  searchInput.addEventListener("input", ()=>{ clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 80); });
  searchInput.addEventListener("focus", ()=>{ ensureSearchIndex(); if(searchInput.value.trim()) runSearch(); });
  searchInput.addEventListener("blur", ()=>setTimeout(closeResults, 120));
  searchInput.addEventListener("keydown", (e)=>{
    if(e.key === "ArrowDown"){ e.preventDefault(); if(searchResults.hidden) runSearch(); else moveActive(1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); moveActive(-1); }
    else if(e.key === "Enter"){ if(activeOption >= 0){ e.preventDefault(); chooseResult(searchOptions[activeOption]); } }
    else if(e.key === "Escape"){
      // Clear the box first; the page's own Escape (close popup) comes next time.
      if(!searchResults.hidden || searchInput.value){ e.stopPropagation(); searchInput.value = ""; closeResults(); }
    }
  });

  // ---------- Overview: every country at once ----------
  // "All countries" in the menu: each country's outline filled by one figure
  // of its national mix (renewables share of generation, or CO₂ intensity),
  // and the panel ranks the countries with their generation bars. A click on
  // a country, on the map or in the list, opens it.
  const OVERVIEW_KEY = "overview";          // its value in the country menu
  let overview = false;
  let overviewMetric = "renewables";
  const OVERVIEW_METRICS = {
    renewables: { get: (m)=>m.renewables_pct_generation, max: 100, desc: true, fmt: (v)=>fmtShare(v) },
    co2:        { get: (m)=>m.co2_intensity_g_per_kwh,   max: 800, desc: false, fmt: (v)=>nfmt(v) + " g/kWh" }
  };
  // Sequential blue (the dataviz reference ramp, steps 100 → 700). Zero
  // recedes into the map: palest on the light basemap, darkest on the dark
  // one, so "more" always stands out.
  const SEQ_BLUE = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
  const seqRamp = ()=>isDark() ? SEQ_BLUE.slice().reverse() : SEQ_BLUE;
  const hexRgb = (h)=>[1, 3, 5].map(i=>parseInt(h.slice(i, i + 2), 16));
  // The fill's colour for a value, as the map interpolates it (linear RGB).
  function rampColor(v, max){
    const r = seqRamp(), t = Math.max(0, Math.min(1, v / max)) * (r.length - 1);
    const i = Math.min(r.length - 2, Math.floor(t)), f = t - i, a = hexRgb(r[i]), b = hexRgb(r[i + 1]);
    return `rgb(${a.map((x, k)=>Math.round(x + (b[k] - x) * f)).join(",")})`;
  }
  // Every country with data, framed together (Spain's Canaries to Ethiopia).
  const OVERVIEW_BOUNDS = ENABLED.map(k=>COUNTRIES[k].bounds).filter(Boolean).reduce((b, c)=>[
    [Math.min(b[0][0], c[0][0]), Math.min(b[0][1], c[0][1])], [Math.max(b[1][0], c[1][0]), Math.max(b[1][1], c[1][1])]
  ]);

  const ovOption = document.createElement("option");
  ovOption.value = OVERVIEW_KEY; ovOption.textContent = T.allCountries;
  const ovRule = document.createElement("option");
  ovRule.disabled = true; ovRule.textContent = "──────────";
  countrySelect.insertBefore(ovRule, countrySelect.firstChild);
  countrySelect.insertBefore(ovOption, ovRule);

  // [{ key, mix, boundary }] for every enabled country, loaded on first use.
  let overviewData = null, overviewLoading = null;
  function loadOverviewData(){
    if(!overviewLoading){
      overviewLoading = Promise.all(ENABLED.map(async key=>{
        const c = COUNTRIES[key];
        const get = async (file)=>{
          try{ const r = await fetch(dataUrl(c, file)); return r.ok ? await r.json() : null; }
          catch(e){ return null; }
        };
        const [mix, boundary] = await Promise.all([c.mix ? get(c.mix) : null, get("boundary.geojson")]);
        return { key, mix, boundary };
      })).then(list=>{ overviewData = list; return list; });
    }
    return overviewLoading;
  }
  const overviewIndex = (key)=>overviewData ? overviewData.findIndex(d=>d.key === key) : -1;
  const overviewValue = (d)=>d.mix ? num(OVERVIEW_METRICS[overviewMetric].get(d.mix)) : null;

  // One feature per country (its outline's polygons as one MultiPolygon, id
  // = its index, for the hover state) and one label point at its centre.
  function buildOverviewLayers(){
    if(!overviewData) return;
    overviewHover = null;
    const m = OVERVIEW_METRICS[overviewMetric];
    const shapes = [], labels = [];
    overviewData.forEach((d, i)=>{
      const c = COUNTRIES[d.key], v = overviewValue(d);
      const polys = ((d.boundary && d.boundary.features) || []).flatMap(f=>
        !f.geometry ? [] : f.geometry.type === "Polygon" ? [f.geometry.coordinates]
        : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : []);
      if(polys.length) shapes.push({ type:"Feature", id: i, properties: { key: d.key, value: v == null ? 0 : v, has: v != null },
                                     geometry: { type:"MultiPolygon", coordinates: polys } });
      labels.push({ type:"Feature", properties: { text: v == null ? countryLabel(c) : `${countryLabel(c)}\n${m.fmt(v)}` },
                    geometry: { type:"Point", coordinates: c.center } });
    });
    addOrReplace("src-overview", { type:"geojson", data: { type:"FeatureCollection", features: shapes } });
    addOrReplace("src-overview-labels", { type:"geojson", data: { type:"FeatureCollection", features: labels } });
    const r = seqRamp(), hot = ["boolean", ["feature-state", "hover"], false];
    map.addLayer({ id:"lyr-overview-fill", type:"fill", source:"src-overview", paint:{
      "fill-color": ["case", ["get", "has"],
        ["interpolate", ["linear"], ["get", "value"], 0, r[0], m.max / 4, r[1], m.max / 2, r[2], m.max * 3 / 4, r[3], m.max, r[4]],
        isDark() ? "#2a3446" : "#d9dde3"],
      "fill-opacity": ["case", hot, 0.95, 0.8] } });
    map.addLayer({ id:"lyr-overview-line", type:"line", source:"src-overview", paint:{
      "line-color": ["case", hot, isDark() ? "#22D3EE" : "#0E7490", isDark() ? "rgba(255,255,255,0.45)" : "rgba(0,31,77,0.45)"],
      "line-width": ["case", hot, 2.5, 0.8] } });
    map.addLayer({ id:"lyr-overview-labels", type:"symbol", source:"src-overview-labels",
      layout:{ "text-field":["get", "text"], "text-font": FONT_BOLD, "text-size": 11.5, "text-line-height": 1.15 },
      paint:{ "text-color": isDark() ? "#EEF2F8" : "#0A1628",
              "text-halo-color": isDark() ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)", "text-halo-width": 1.5 } });
    wireOverview();
  }

  // A country lit on the map and in the list together.
  let overviewHover = null;
  function setOverviewHover(id){
    if(overviewHover === id) return;
    const src = map && map.getSource("src-overview");
    if(src && overviewHover != null) map.setFeatureState({ source:"src-overview", id: overviewHover }, { hover: false });
    overviewHover = id;
    if(src && id != null) map.setFeatureState({ source:"src-overview", id }, { hover: true });
    document.querySelectorAll("#overviewList .ov-row").forEach(row=>
      row.classList.toggle("hot", id != null && overviewIndex(row.dataset.key) === id));
  }

  function showOverviewTooltip(key, point){
    const d = overviewData[overviewIndex(key)], m = d && d.mix;
    const top = m ? m.fuels.slice().sort((a, b)=>b.generation_pct - a.generation_pct).slice(0, 3)
      .map(f=>`${fuelLabel(f)} ${fmtShare(f.generation_pct)}`).join(" · ") : "";
    const lines = !m ? [T.noData] : [
      `${T.renewables}${COLON} ${fmtShare(m.renewables_pct_generation)} ${T.ofGen}`,
      m.co2_intensity_g_per_kwh != null ? `${T.co2}${COLON} ${nfmt(m.co2_intensity_g_per_kwh)} g/kWh` : ""
    ].filter(Boolean);
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(countryLabel(COUNTRIES[key]))}${m ? " · " + escapeHtml(m.year) : ""}</div>
      <div class="tt-metric">${lines.map(escapeHtml).join("<br>")}</div>
      ${top ? `<div class="tt-meta">${escapeHtml(top)}</div>` : ""}
      <div class="tt-meta">${escapeHtml(T.clickToOpen)}</div>`;
    positionTooltip(point);
  }

  // Layer-scoped handlers outlive the layers' removal: wired once.
  let overviewWired = false;
  function wireOverview(){
    if(overviewWired) return;
    overviewWired = true;
    map.on("mousemove", "lyr-overview-fill", (e)=>{
      const f = e.features[0];
      if(!overview || !f) return;
      map.getCanvas().style.cursor = "pointer";
      setOverviewHover(f.id);
      showOverviewTooltip(f.properties.key, e.point);
    });
    map.on("mouseleave", "lyr-overview-fill", ()=>{
      if(!overview) return;
      map.getCanvas().style.cursor = "";
      setOverviewHover(null);
      hideTooltip();
    });
    map.on("click", "lyr-overview-fill", (e)=>{
      const f = e.features[0];
      if(overview && f){ hideTooltip(); map.getCanvas().style.cursor = ""; switchCountry(f.properties.key, null); }
    });
  }

  // The panel: metric, colour key, countries ranked with their generation mix.
  function renderOverview(){
    const section = $("#overviewSection");
    section.hidden = !overview;
    layout.classList.toggle("is-overview", overview);
    if(!overview || !overviewData) return;
    const m = OVERVIEW_METRICS[overviewMetric];
    section.querySelectorAll(".seg-btn").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.metric === overviewMetric)));

    const legend = $("#overviewLegend");
    legend.replaceChildren();
    const bar = el("span", "ov-legend-bar");
    bar.style.background = `linear-gradient(to right, ${seqRamp().join(", ")})`;
    const scale = el("span", "ov-legend-scale");
    // fmtShare writes a zero share as "—"; the scale's ends are numbers.
    const end = (v)=>overviewMetric === "co2" ? m.fmt(v) : nfmt(v) + PCT;
    scale.append(el("span", null, end(0)), el("span", null, end(m.max)));
    legend.append(el("span", "ov-legend-title", overviewMetric === "co2" ? T.legendCo2 : T.legendRenew), bar, scale);

    const list = $("#overviewList");
    list.replaceChildren();
    overviewData.map(d=>({ d, v: overviewValue(d) }))
      .sort((a, b)=>(a.v == null) - (b.v == null) || (m.desc ? b.v - a.v : a.v - b.v))
      .forEach(({ d, v })=>{
        const name = countryLabel(COUNTRIES[d.key]);
        const btn = el("button", "ov-row");
        btn.type = "button";
        btn.dataset.key = d.key;
        btn.title = T.openCountry(name);
        const sw = el("span", "ov-swatch");
        sw.style.background = v == null ? (isDark() ? "#2a3446" : "#d9dde3") : rampColor(v, m.max);
        const head = el("span", "ov-head");
        head.append(sw, el("span", "ov-name", name), el("span", "ov-val", v == null ? "—" : m.fmt(v)));
        const mini = el("span", "ov-bar");
        mini.setAttribute("aria-hidden", "true");
        (d.mix ? d.mix.fuels : []).filter(f=>f.generation_pct > 0).forEach(f=>{
          const seg = el("span");
          seg.style.flexGrow = String(f.generation_pct);
          seg.style.background = FUEL_COLOR[f.fuel] || "#888";
          mini.appendChild(seg);
        });
        btn.append(head, mini);
        btn.addEventListener("click", ()=>switchCountry(d.key, null));
        btn.addEventListener("mouseenter", ()=>setOverviewHover(overviewIndex(d.key)));
        btn.addEventListener("mouseleave", ()=>setOverviewHover(null));
        const li = el("li");
        li.appendChild(btn);
        list.appendChild(li);
      });

    const years = overviewData.filter(d=>d.mix).map(d=>d.mix.year);
    const lo = Math.min(...years), hi = Math.max(...years);
    $("#overviewNote").textContent = T.overviewNote(lo === hi ? String(lo) : `${lo}–${hi}`);
  }

  // `link`: a shared link to the overview (its metric and view), if any.
  async function enterOverview(link){
    overview = true;
    if(link && OVERVIEW_METRICS[link.metric]) overviewMetric = link.metric;
    countrySelect.value = OVERVIEW_KEY;
    closePopup();
    hideTooltip();
    hoveredLayer = null;
    layout.classList.add("is-overview");
    document.title = T.docTitleOverview;
    await loadOverviewData();
    if(!overview) return;                  // a country was picked meanwhile
    renderOverview();
    if(map && mapReady){
      buildMapLayers(currentCountry);       // draws the overview while it is on
      // The panel has just changed height (phones stack it above the map):
      // measure the map again, or the frame is computed for the old size.
      map.resize();
      if(link && link.view) map.jumpTo(link.view);
      else map.fitBounds(OVERVIEW_BOUNDS, { padding: 24, duration: link ? 0 : 900 });
    }
    syncUrl();
  }
  function leaveOverview(){
    if(!overview) return;
    setOverviewHover(null);
    overview = false;
    layout.classList.remove("is-overview");
    $("#overviewSection").hidden = true;
  }
  $("#overviewSection").querySelectorAll(".seg-btn").forEach(b=>b.addEventListener("click", ()=>{
    if(overviewMetric === b.dataset.metric) return;
    overviewMetric = b.dataset.metric;
    renderOverview();
    if(map && mapReady) buildMapLayers(currentCountry);
    syncUrl();
  }));

  // `link`: the shared link being applied, if the switch comes from one.
  async function switchCountry(key, link){
    if(!ENABLED.includes(key)) return;
    leaveOverview();
    currentCountry = key;
    countrySelect.value = key;
    const c = COUNTRIES[key];
    closePopup();
    hideTooltip();
    hoveredLayer = null;
    fuelFilter = null;
    if(!(await loadAllData(key))) return; // superseded by a later switch
    if(overview) return;                  // the overview was picked meanwhile
    if(link) applyLinkState(link);
    if(link && link.reveal && link.feature) revealFeature(link.feature);
    renderPanel(key);
    if(map && mapReady){
      if(link && link.view) map.jumpTo(link.view);
      buildMapLayers(key);
      const opened = !!(link && link.feature) && openLinkedFeature(link.feature, !link.view, link.smooth);
      if(!opened && !(link && link.view)) map.flyTo({ center: c.center, zoom: c.zoom, speed: 0.8, curve: 1.4 });
    } else if(link){
      pendingFeature = link.feature;
    }
    syncUrl();
  }
  countrySelect.addEventListener("change", (e)=>{
    if(e.target.value === OVERVIEW_KEY) enterOverview(null);
    else switchCountry(e.target.value, null);
  });

  boot();
})();
