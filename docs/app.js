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
    'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ' +
    OIM_ATTR + ' · <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>';
  const COUNTRIES = window.COUNTRIES || {};
  const ENABLED   = (window.COUNTRIES_ENABLED || ["morocco"]).filter(k=>COUNTRIES[k]);
  const REPO_URL  = "https://github.com/redatahiri37/morocco-energy-digital-map";

  const FUEL_COLOR = {
    solar:"#F59E0B", wind:"#0D9488", hydro:"#3B82F6",
    coal:"#8B7F72",  gas:"#C77B3A", oil:"#A55A2A",
    nuclear:"#DB2777", geothermal:"#DC2626", biomass:"#65A30D", waste:"#78716C"
  };
  // Counted in the "Renewables share" KPI.
  const RENEWABLE_FUELS = ["solar", "wind", "hydro", "geothermal", "biomass"];
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
  });

  // ---------- Country selector ----------
  const countrySelect = $("#countrySelect");
  ENABLED.forEach(key=>{
    const o = document.createElement("option");
    o.value = key; o.textContent = COUNTRIES[key].label;
    countrySelect.appendChild(o);
  });
  Object.keys(COUNTRIES).filter(k=>!ENABLED.includes(k)).forEach(key=>{
    const o = document.createElement("option");
    o.value = key; o.textContent = COUNTRIES[key].label + " (soon)";
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
        el.innerHTML = '<summary class="maplibregl-ctrl-attrib-button" title="Toggle attribution" aria-label="Toggle attribution"></summary>' +
          '<div class="maplibregl-ctrl-attrib-inner">' + ATTRIBUTION + '</div>';
        el.firstChild.addEventListener("click", (e)=>{ e.preventDefault(); el.classList.toggle("maplibregl-compact-show"); });
        return el;
      },
      onRemove(){ el.remove(); }
    };
  }
  // Values below go into innerHTML: anything that is not a finite number
  // (a string slipped into the data) renders as "—", never as markup.
  function fmtInvestment(v){
    v = num(v);
    if(v == null) return "—";
    if(v >= 1e9) return "$" + (v/1e9).toFixed(1).replace(/\.0$/,"") + "B";
    if(v >= 1e6) return "$" + Math.round(v/1e6) + "M";
    return "$" + v.toLocaleString();
  }
  function fmtCap(mw){ mw = num(mw); return mw == null ? "—" : mw.toLocaleString() + " MW"; }
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
  function tryBuild(){
    if(!(dataReady && mapReady)) return;
    buildMapLayers(currentCountry);
    if(pendingSite && pendingSite.country === currentCountry){
      const p = pendingSite; pendingSite = null;
      runSiteDiagnostic(p.lng, p.lat);
    }
  }

  function boot(){
    const initialCountry = pendingSite ? pendingSite.country
      : ENABLED.includes(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : ENABLED[0];
    countrySelect.value = initialCountry;
    currentCountry = initialCountry;
    loadAllData(initialCountry).then(committed=>{
      if(committed) renderPanel(initialCountry);
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
        center: c.center, zoom: c.zoom,
        attributionControl: false
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass:false }), "bottom-right");
      map.addControl(staticAttribution(), "bottom-left");

      map.on("load", ()=>{ mapReady = true; tryBuild(); });
      map.on("click", (e)=>{
        if(siteMode){ runSiteDiagnostic(e.lngLat.lng, e.lngLat.lat); return; }
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
    renderLayerList(countryKey);
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
    let boundary = null;
    try{
      const r = await fetch(c.dataPath + "boundary.geojson" + ASSET_V);
      if(r.ok) boundary = await r.json();
    } catch(e){ /* no boundary for this country */ }

    const promises = c.layers.map(async (L, idx)=>{
      vis[L.id] = L.visible !== false;
      if(!L.file) return; // OIM or other virtual layers — no fetch needed
      try{
        const res = await fetch(c.dataPath + L.file + ASSET_V);
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
      row.title = `${L.source} · updated ${L.updated}`;
      row.innerHTML = `
        <input type="checkbox" ${visibility[L.id]!==false?"checked":""}>
        <span class="check"></span>
        ${swatch}
        <span class="layer-name">${escapeHtml(L.title)}</span>
        <span class="layer-count">${LIVE_KINDS.includes(kind) ? "live" : fc.features.length}</span>
      `;
      paint(row);
      row.querySelector("input").addEventListener("change", (e)=>{
        const on = e.target.checked;
        visibility[L.id] = on;
        row.classList.toggle("muted", !on);
        applyLayerVisibility(L.id, on);
      });
      if(visibility[L.id] === false) row.classList.add("muted");
      host.appendChild(row);
    });
  }

  // All features of every layer of a kind, for this country.
  function featuresOfKind(countryKey, kind){
    return COUNTRIES[countryKey].layers.filter(L=>L.kind === kind)
      .flatMap(L=>(layerData[L.id] || { features:[] }).features);
  }

  function renderKPIs(countryKey){
    const host = $("#kpiGrid");
    const c = COUNTRIES[countryKey];
    const snap = $("#snapshotSource");
    if(snap) snap.textContent = c.snapshotSource ? "source: " + c.snapshotSource : "";
    const fcPower = { features: featuresOfKind(countryKey, "power") };
    const fcDC    = { features: featuresOfKind(countryKey, "digital") };
    const totalMW = fcPower.features.reduce((s,f)=>s + (num(f.properties.capacity_mw) || 0), 0);
    const renewMW = fcPower.features.filter(f=>RENEWABLE_FUELS.includes(f.properties.fuel_type))
                    .reduce((s,f)=>s + (num(f.properties.capacity_mw) || 0), 0);
    const renewShare = totalMW ? Math.round(100 * renewMW / totalMW) : 0;
    const dcMW = fcDC.features.reduce((s,f)=>s + (num(f.properties.capacity_estimate_mw) || 0), 0);
    const dcInvest = fcDC.features.reduce((s,f)=>s + (num(f.properties.investment_usd) || 0), 0);
    // A country with no layer of a kind shows "—", not a zero that reads as a finding.
    const hasPower = fcPower.features.length > 0, hasDC = fcDC.features.length > 0;
    // Registries such as PeeringDB list sites without MW or investment
    // figures: show the site count and "—" rather than 0.0 GW / $0.
    const hasDCmw = fcDC.features.some(f=>f.properties.capacity_estimate_mw != null);
    const hasDCinv = fcDC.features.some(f=>f.properties.investment_usd != null);
    const NA = "—";
    host.innerHTML = `
      <div class="kpi"><div class="k">Tracked capacity</div>
        <div class="v">${hasPower ? `${(totalMW/1000).toFixed(1)}<small> GW</small>` : NA}</div></div>
      <div class="kpi"><div class="k">Renewables share*</div>
        <div class="v">${hasPower ? `${renewShare}<small>%</small>` : NA}</div></div>
      <div class="kpi"><div class="k">${hasDC && !hasDCmw ? "Data centres" : "DC pipeline"}</div>
        <div class="v">${!hasDC ? NA : hasDCmw ? `${(dcMW/1000).toFixed(1)}<small> GW</small>`
                                               : `${fcDC.features.length}<small> sites</small>`}</div></div>
      <div class="kpi"><div class="k">DC investment</div>
        <div class="v">${hasDCinv ? fmtInvestment(dcInvest) : NA}</div></div>
    `;
  }

  // Country name wherever the page names one: tab title, brand line,
  // methodology intro, the data path it cites, and the report-an-error link.
  function renderCountryText(countryKey){
    const c = COUNTRIES[countryKey];
    document.title = `Wattu Energy — ${c.label} infrastructure map`;
    document.querySelectorAll("[data-country-label]").forEach(el=>{ el.textContent = c.label; });
    document.querySelectorAll("[data-country-credits]").forEach(el=>{ el.textContent = c.credits ? `Data: ${c.credits} · ` : ""; });
    document.querySelectorAll("[data-country-path]").forEach(el=>{ el.textContent = "/docs/" + c.dataPath.replace(/^\.\//, ""); });
    if(reportErrorFooter) reportErrorFooter.href = issueUrl(`${c.label} map — data correction`);
  }

  function renderMethodologySources(countryKey){
    const c = COUNTRIES[countryKey];
    renderCountryText(countryKey);
    const host = $("#methodologySources");
    if(!host) return;
    host.innerHTML = c.layers.map(L=>
      `<li><strong>${escapeHtml(L.title)}:</strong> ${escapeHtml(L.source)} — <a href="${escapeHtml(L.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(L.sourceUrl)}</a> <span class="micro">(updated ${escapeHtml(L.updated)})</span></li>`
    ).join("") + (c.boundary ? `<li><strong>Boundary:</strong> ${escapeHtml(c.boundary.source)} — <a href="${escapeHtml(c.boundary.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(c.boundary.sourceUrl)}</a>${c.boundary.note ? ` <span class="micro">(${escapeHtml(c.boundary.note)})</span>` : ""}</li>` : "") +
    `<li><strong>Basemap:</strong> MapLibre GL + <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL) — public, no token required.</li>`;
  }

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
      grid:       (L)=>buildLineLayer(L, layerData[L.id] || { features:[] }),
      power:      (L)=>buildPowerLayer(L, layerData[L.id] || { features:[] }),
      industrial: (L)=>buildIndustrialLayer(L, layerData[L.id] || { features:[] }),
      digital:    (L)=>buildDigitalLayer(L, layerData[L.id] || { features:[] })
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
    if(site) safe("site", drawSiteOverlay);  // style reloads (theme) drop it
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
    addLayer(L, {
      id: "lyr-" + L.id + "-points", type:"circle", source: OIM_SRC, "source-layer":"power_plant_point",
      paint:{
        "circle-color": fuelExpr,
        "circle-radius":["interpolate",["linear"],["coalesce",["get","output"],0], 0,3.5, 50,5, 300,8, 1000,11],
        "circle-opacity":0.75,
        "circle-stroke-color": isDark() ? "rgba(241,239,233,0.8)" : "rgba(24,24,26,0.7)",
        "circle-stroke-width":1
      }
    }, "point");
  }

  // Maps an OpenInfraMap plant's tile fields onto the curated power schema,
  // so the tooltip and popup render it like any other plant.
  function osmPlantProps(p, f){
    const [lng, lat] = f.geometry.coordinates;
    return {
      name: p.name || "Unnamed plant (OSM)",
      capacity_mw: typeof p.output === "number" ? Math.round(p.output * 10) / 10 : null,
      fuel_type: (Object.hasOwn(OSM_FUEL, p.source) && OSM_FUEL[p.source]) || p.source || "unknown",
      status: p.construction ? "construction" : p.disused ? "idle" : "operational",
      commissioning_year: p.start_date || null,
      source: "OpenStreetMap contributors via OpenInfraMap",
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
    const clusterOpts = { cluster: true, clusterMaxZoom: dense ? 7 : 6, clusterRadius: dense ? 60 : 35 };
    addOrReplace(srcId, { type:"geojson", data: fc, ...clusterOpts });
    // Same clustering on a text-only twin, so a font failure can't blank the bubbles.
    addOrReplace(srcId + "-text", { type:"geojson", data: fc, ...clusterOpts });

    // Cluster bubbles
    addLayer(L, {
      id: p+"-clusters", type:"circle", source:srcId,
      filter:["has","point_count"],
      paint:{
        "circle-color":"rgba(245,158,11,0.85)",
        "circle-radius":["step",["get","point_count"], 14, 3, 18, 6, 22, 50, 26, 200, 31],
        "circle-stroke-color": isDark() ? "#070D1A" : "#ffffff",
        "circle-stroke-width":1.5
      }
    }, "cluster");
    addLayer(L, {
      id: p+"-cluster-count", type:"symbol", source:srcId + "-text",
      filter:["has","point_count"],
      layout:{
        "text-field":["get","point_count_abbreviated"],
        "text-font":FONT_BOLD,
        "text-size":11,
        "text-allow-overlap":true
      },
      paint:{ "text-color":"#070D1A" }
    });

    // Halo for announced/construction status
    addLayer(L, {
      id: p+"-halo", type:"circle", source:srcId,
      filter:["all",["!",["has","point_count"]],["in",["get","status"],["literal",["announced","construction"]]]],
      paint:{
        "circle-color":"rgba(245,158,11,0.25)",
        "circle-radius":11,
        "circle-blur":0.3
      }
    });

    // Individual plants, color by fuel
    addLayer(L, {
      id: p+"-points", type:"circle", source:srcId,
      filter:["!",["has","point_count"]],
      paint:{
        "circle-color":["match",["get","fuel_type"], ...Object.entries(FUEL_COLOR).flat(), "#888"],
        "circle-radius":[
          "interpolate",["linear"],["zoom"],
          4, 4,
          7, 6,
          10, 8
        ],
        "circle-stroke-color": POINT_STROKE(),
        "circle-stroke-width":1.5,
        "circle-opacity":[
          "case",
          ["boolean",["feature-state","dim"],false], 0.3,
          1
        ]
      }
    }, "point");

    addLabelLayer(L, p+"-labels", srcId + "-text", "name", 7, 1.1, ["!",["has","point_count"]]);
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

  const POINT_STROKE = () => isDark() ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.9)";

  // Name labels live on a separate text-only source: MapLibre drops every
  // layer of a source whose glyphs fail to load, and points must survive that.
  function addLabelLayer(L, id, sourceId, field, minzoom, offset, filter){
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
      if(!m || !f || siteMode) return;  // site check: the map-level handler takes the click
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
        openLinePopup(f);
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
    if(kind === "power")           metric = `${fmtCap(p.capacity_mw)} · ${p.fuel_type || ""}`;
    else if(kind === "industrial") metric = `${p.sector || ""} · est. ${fmtCap(p.estimated_demand_mw)}`;
    else if(kind === "digital"){
      if(p.category === "cable_landing"){
        metric = ["Submarine cable landing", p.operator].filter(Boolean).join(" · ");
        dot = CABLE_COLOR;
      } else {
        const prov = palette().providers.find(x => x.key === p.operator);
        metric = [prov ? prov.short : p.operator,
                  p.capacity_estimate_mw != null ? fmtCap(p.capacity_estimate_mw) : "",
                  p.status].filter(Boolean).join(" · ");
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
      <div class="tt-metric">${escapeHtml(p.voltage_kv)} kV · ${escapeHtml(p.status || "")}</div>
      <div class="tt-meta">${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>` : escapeHtml(p.source || "—")}</div>`;
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
    clearSite();
    let p = f.properties || {};
    let kind = layerKind(dataLayerId);
    if(kind === "oim-plants"){ p = osmPlantProps(p, f); kind = "power"; }
    const badgeClass = kind === "power" ? "power" : kind === "industrial" ? "industrial" : kind === "digital" ? "digital" : "grid";
    const badgeLabel = kind === "power" ? (p.osm ? "Generation · OpenStreetMap" : "Generation")
                     : kind === "industrial" ? "Industrial consumer"
                     : kind === "digital" ? (p.category === "cable_landing" ? "Submarine cable" : "Data center")
                     : "Infrastructure";

    let stats = "";
    if(kind === "power"){
      stats = `
        <div class="cell"><div class="k">Capacity</div><div class="v">${fmtCap(p.capacity_mw)}</div></div>
        <div class="cell"><div class="k">Fuel</div><div class="v cap">${escapeHtml(p.fuel_type)}</div></div>
        <div class="cell"><div class="k">Technology</div><div class="v sm">${escapeHtml(p.tech || "—")}</div></div>
        <div class="cell"><div class="k">${p.status==="operational"?"Commissioned":"Target year"}</div><div class="v">${escapeHtml(p.commissioning_year || "—")}</div></div>`;
    } else if(kind === "industrial"){
      stats = `
        <div class="cell"><div class="k">Sector</div><div class="v sm">${escapeHtml(p.sector)}</div></div>
        <div class="cell"><div class="k">Est. demand</div><div class="v">${fmtCap(p.estimated_demand_mw)}</div></div>
        <div class="cell"><div class="k">Grid connection</div><div class="v xs">${escapeHtml(p.grid_connection || "—")}</div></div>
        <div class="cell"><div class="k">Precision</div><div class="v cap">${escapeHtml(p.precision || "—")}</div></div>`;
    } else if(kind === "digital"){
      stats = `
        <div class="cell"><div class="k">Operator</div><div class="v sm">${escapeHtml(p.operator || "—")}</div></div>
        <div class="cell"><div class="k">Capacity</div><div class="v">${p.capacity_estimate_mw!=null ? fmtCap(p.capacity_estimate_mw) : "—"}</div></div>
        <div class="cell"><div class="k">Investment</div><div class="v">${fmtInvestment(p.investment_usd)}</div></div>
        <div class="cell"><div class="k">${p.status==="operational"?"Energised":"Target year"}</div><div class="v">${escapeHtml(p.year || "—")}</div></div>`;
    }

    const [lng, lat] = f.geometry.coordinates;
    const coords = `${Math.abs(lat).toFixed(2)}°${lat>=0?"N":"S"}, ${Math.abs(lng).toFixed(2)}°${lng>=0?"E":"W"}`;

    const dotColor = badgeClass==='power'      ? (FUEL_COLOR[p.fuel_type] || FUEL_COLOR.solar)
                   : badgeClass==='industrial' ? INDUSTRIAL_COLOR
                   : badgeClass==='digital'    ? (p.category==='cable_landing' ? CABLE_COLOR : DIGITAL_COLOR)
                   : GRID_COLOR;

    $("#popupBadge").innerHTML = `<span class="badge ${badgeClass}"><span class="dot" data-bg="${escapeHtml(dotColor)}"></span>${badgeLabel}</span>`;
    paint($("#popupBadge"));
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${p.region ? escapeHtml(p.region) + " · " : ""}${coords}</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">${stats}</div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}${p.vintage ? " · " + escapeHtml(p.vintage) : ""}</span>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>Raw data</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        ${p.osm
          // OSM data is fixed at the source, where every map using it benefits.
          ? `<a href="${escapeHtml(safeUrl(p.source_url))}" target="_blank" rel="noopener">View on OpenInfraMap ↗</a>
             <a href="https://www.openstreetmap.org/#map=17/${f.geometry.coordinates[1].toFixed(5)}/${f.geometry.coordinates[0].toFixed(5)}" target="_blank" rel="noopener">Fix on OpenStreetMap ↗</a>`
          : `<a href="${escapeHtml(issueUrl(`${COUNTRIES[currentCountry].label} map — correction: ${p.name}`, `Feature id: ${p.id || p.name}\n\nSuggested correction:\n`))}" target="_blank" rel="noopener">Report an error</a>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Primary source ↗</a>` : ""}`}
      </div>`;
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function openLinePopup(f){
    clearSite();
    const p = f.properties || {};
    $("#popupBadge").innerHTML = `<span class="badge grid"><span class="dot" data-bg="${escapeHtml(GRID_COLOR)}"></span>Transmission line</span>`;
    paint($("#popupBadge"));
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${escapeHtml(p.voltage_kv)} kV</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">
        <div class="cell"><div class="k">Voltage</div><div class="v">${escapeHtml(p.voltage_kv)} kV</div></div>
        <div class="cell"><div class="k">Status</div><div class="v cap">${escapeHtml(p.status)}</div></div>
        <div class="cell"><div class="k">Precision</div><div class="v cap">${escapeHtml(p.precision || "approximate")}</div></div>
        <div class="cell"><div class="k">Kind</div><div class="v">${p.kind === "hvdc_planned" ? "HVDC (planned)" : "AC"}</div></div>
      </div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}</span>
        ${safeUrl(p.source_url) ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>Raw data</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        <a href="${escapeHtml(issueUrl(`${COUNTRIES[currentCountry].label} map — correction: ${p.name}`))}" target="_blank" rel="noopener">Report an error</a>
      </div>`;
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function closePopup(){
    clearSite();
    popup.classList.remove("open");
    popup.setAttribute("aria-hidden","true");
  }
  $("#popupClose").addEventListener("click", closePopup);
  document.addEventListener("keydown", (e)=>{
    if(e.key !== "Escape") return;
    if(!methModal.classList.contains("hidden")) methModal.classList.add("hidden");
    else if(siteMode) setSiteMode(false);
    else closePopup();
  });

  // ---------- Site diagnostic ----------
  // "Site check" mode: click anywhere and get a screening read-out for a
  // data-centre site — distance to the HV grid, generation and large loads
  // within 50 km, connectivity, solar resource, and a 1–5 score. It is built
  // from the map's own data plus PVGIS: a first filter, not a grid-connection
  // study. Weights and thresholds live here and in ASSUMPTIONS.md §11.
  const SITE_RADIUS_KM = 50;
  const SITE_ZOOM      = 8.5;   // OIM tiles carry HV lines and substations here
  const PVGIS_URL      = "https://solar-pvgis.redatahiri.workers.dev/pvcalc";
  const SITE_CRITERIA = [
    // key, label, weight, thresholds, direction ("below": smaller is better)
    { key:"grid",         label:"Grid access",       weight:0.35, steps:[5, 15, 30, 60],          dir:"below", unit:"km to ≥225 kV line" },
    { key:"generation",   label:"Generation nearby", weight:0.20, steps:[1000, 500, 200, 50],      dir:"above", unit:"MW operating within 50 km" },
    { key:"connectivity", label:"Connectivity",      weight:0.25, steps:null,                      dir:null,    unit:"cable landing ≤25/75/150/300 km · DC ≤10/30/75/150 km" },
    { key:"solar",        label:"Solar resource",    weight:0.20, steps:[1900, 1700, 1500, 1300], dir:"above", unit:"kWh/kWp/yr (PVGIS)" }
  ];
  const CABLE_STEPS = [25, 75, 150, 300], DC_STEPS = [10, 30, 75, 150];
  const SITE_COLOR = () => isDark() ? "#22D3EE" : "#0E7490";

  let siteMode  = false;
  let site      = null;   // { lng, lat, seq, ref, oim, solar, ... } for the open diagnostic
  let siteSeq   = 0;
  const siteGridCache = {};  // country → Promise<FeatureCollection|null>
  const solarCache    = {};  // "lat,lng" (2 dp) → Promise<{ yield, irr }>

  // 5 at or past the first step, 1 past the last.
  function stepScore(v, steps, dir){
    if(v == null) return null;
    for(let i = 0; i < steps.length; i++){
      if(dir === "below" ? v <= steps[i] : v >= steps[i]) return 5 - i;
    }
    return 1;
  }
  function fmtKm(km){
    if(km == null) return "—";
    if(km < 1) return "<1 km";
    return (km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()) + " km";
  }
  function fmtCoord(lat, lng){
    return `${Math.abs(lat).toFixed(4)}°${lat>=0?"N":"S"}, ${Math.abs(lng).toFixed(4)}°${lng>=0?"E":"W"}`;
  }
  // Voltage from any of: 225, "225", "225000", "400000;225000" → kV.
  function toKv(v){
    const n = parseFloat(String(v == null ? "" : v).split(/[;,]/)[0]);
    if(!Number.isFinite(n) || n <= 0) return null;
    return n > 2000 ? n / 1000 : n;
  }

  // Local flat projection around the site, in km. Good to well under 1 %
  // over the few hundred km this works at.
  function projector(lng0, lat0){
    const kx = 111.320 * Math.cos(lat0 * Math.PI / 180), ky = 110.574;
    return {
      to:   ([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky],
      from: ([x, y])     => [lng0 + x / kx, lat0 + y / ky]
    };
  }
  function lineParts(g){
    if(!g) return [];
    if(g.type === "LineString") return [g.coordinates];
    if(g.type === "MultiLineString") return g.coordinates;
    return [];
  }
  // Representative point: the point itself, or a polygon's vertex mean.
  function pointOf(g){
    if(!g) return null;
    if(g.type === "Point") return g.coordinates;
    const ring = g.type === "Polygon" ? g.coordinates[0]
               : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
    if(!ring || !ring.length) return null;
    const s = ring.reduce((a, c)=>[a[0] + c[0], a[1] + c[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  }
  // Nearest point on any line: { km, at:[lng,lat], f }.
  function nearestOnLines(features, s, keep){
    const P = projector(s.lng, s.lat);
    let best = null;
    features.forEach(f=>{
      if(keep && !keep(f)) return;
      lineParts(f.geometry).forEach(part=>{
        for(let i = 1; i < part.length; i++){
          const a = P.to(part[i-1]), b = P.to(part[i]);
          const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx*dx + dy*dy;
          const t = len2 ? Math.max(0, Math.min(1, -(a[0]*dx + a[1]*dy) / len2)) : 0;
          const q = [a[0] + t*dx, a[1] + t*dy], km = Math.hypot(q[0], q[1]);
          if(!best || km < best.km) best = { km, at: P.from(q), f };
        }
      });
    });
    return best;
  }
  // Every point feature with its distance, nearest first.
  function byDistance(features, s, keep){
    const P = projector(s.lng, s.lat);
    return features.filter(f=>!keep || keep(f)).map(f=>{
      const c = pointOf(f.geometry);
      if(!c) return null;
      const q = P.to(c);
      return { f, km: Math.hypot(q[0], q[1]), at: c };
    }).filter(Boolean).sort((a, b)=>a.km - b.km);
  }
  function inRing([x, y], ring){
    let inside = false;
    for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // True when the country has no outline file: nothing to test against.
  function inCountry(lng, lat){
    if(!boundaryData) return true;
    return boundaryData.features.some(f=>{
      const g = f.geometry || {};
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      return polys.some(p=>inRing([lng, lat], p[0]) && !p.slice(1).some(h=>inRing([lng, lat], h)));
    });
  }
  function circle(lng, lat, km, n){
    const P = projector(lng, lat), ring = [];
    for(let i = 0; i <= n; i++){
      const a = 2 * Math.PI * i / n;
      ring.push(P.from([km * Math.cos(a), km * Math.sin(a)]));
    }
    return ring;
  }

  // Optional per-country reference grid (countries.config.js → siteGrid):
  // a national line file read only by the diagnostic, fetched on first use.
  function loadSiteGrid(countryKey){
    const c = COUNTRIES[countryKey];
    if(!c.siteGrid) return Promise.resolve(null);
    if(!siteGridCache[countryKey]){
      siteGridCache[countryKey] = fetch(c.dataPath + c.siteGrid.file + ASSET_V)
        .then(r=>r.ok ? r.json() : null)
        .catch(()=>null)
        .then(fc=>{ if(!fc) delete siteGridCache[countryKey]; return fc; });
    }
    return siteGridCache[countryKey];
  }

  // Specific yield of 1 kWp fixed, south-facing, tilt ≈ latitude, 14 % losses.
  function fetchSolar(lat, lng){
    const key = lat.toFixed(2) + "," + lng.toFixed(2);
    if(!solarCache[key]){
      const q = new URLSearchParams({
        lat: lat.toFixed(4), lon: lng.toFixed(4), peakpower: "1", loss: "14",
        angle: String(Math.min(45, Math.round(Math.abs(lat)))), aspect: lat >= 0 ? "0" : "180",
        mountingplace: "free", outputformat: "json"
      });
      solarCache[key] = fetch(PVGIS_URL + "?" + q)
        .then(r=>r.json().catch(()=>({})).then(j=>{
          if(!r.ok) throw new Error(j.error || ("HTTP " + r.status));
          const t = j.outputs && j.outputs.totals && j.outputs.totals.fixed;
          if(!t || num(t.E_y) == null) throw new Error("unexpected PVGIS response");
          return { yield: t.E_y, irr: num(t["H(i)_y"]) };
        }))
        .catch(e=>{ delete solarCache[key]; throw e; });
    }
    return solarCache[key];
  }

  // Everything computed from the curated layers and the reference grid.
  function analyseStatic(s, refGrid){
    const r = {};
    if(refGrid){
      const existing = refGrid.features.filter(f=>f.properties.status !== "planned");
      r.ref225 = nearestOnLines(existing, s, f=>(toKv(f.properties.voltage_kv) || 0) >= 220);
      r.ref400 = nearestOnLines(existing, s, f=>(toKv(f.properties.voltage_kv) || 0) >= 380);
    }
    const planned = (refGrid ? refGrid.features : []).concat(featuresOfKind(currentCountry, "grid"))
      .filter(f=>f.properties.status === "planned");
    r.planned = nearestOnLines(planned, s);

    const near = (kind, keep)=>byDistance(featuresOfKind(currentCountry, kind), s, keep)
      .filter(x=>x.km <= SITE_RADIUS_KM);
    const plants = near("power");
    const op = plants.filter(x=>x.f.properties.status === "operational");
    const sumMw = (xs, field)=>xs.reduce((t, x)=>t + (num(x.f.properties[field]) || 0), 0);
    r.gen = {
      mw: sumMw(op, "capacity_mw"),
      renewMw: sumMw(op.filter(x=>RENEWABLE_FUELS.includes(x.f.properties.fuel_type)), "capacity_mw"),
      pipelineMw: sumMw(plants.filter(x=>x.f.properties.status !== "operational" && x.f.properties.status !== "idle"), "capacity_mw"),
      top: op.slice().sort((a, b)=>(num(b.f.properties.capacity_mw) || 0) - (num(a.f.properties.capacity_mw) || 0)).slice(0, 3),
      hasLayer: featuresOfKind(currentCountry, "power").length > 0
    };
    const loads = near("industrial");
    r.loads = { mw: sumMw(loads, "estimated_demand_mw"), list: loads.slice(0, 3) };

    const digital = featuresOfKind(currentCountry, "digital");
    const isCable = (f)=>f.properties.category === "cable_landing";
    r.cable = byDistance(digital, s, isCable)[0] || null;
    r.hasCables = digital.some(isCable);
    const dcs = byDistance(digital, s, f=>!isCable(f));
    r.dc = dcs.find(x=>x.f.properties.status === "operational") || null;
    const dcNear = dcs.filter(x=>x.km <= SITE_RADIUS_KM);
    r.dcNear = { count: dcNear.length, mw: sumMw(dcNear, "capacity_estimate_mw") };
    r.hasDCs = dcs.length > 0;
    return r;
  }

  // Live OSM grid from the OpenInfraMap tiles currently loaded. Only covers
  // what the viewport has fetched, so the search radius is reported.
  function analyseOim(s){
    if(!map || !map.getSource(OIM_SRC)) return { off: true };
    const gridLayer = ((COUNTRIES[currentCountry] || {}).layers || []).find(L=>L.kind === "oim");
    if(gridLayer && visibility[gridLayer.id] === false) return { off: true };
    const lines = map.querySourceFeatures(OIM_SRC, { sourceLayer: "power_line" });
    const subs  = map.querySourceFeatures(OIM_SRC, { sourceLayer: "power_substation_point" })
      .concat(map.querySourceFeatures(OIM_SRC, { sourceLayer: "power_substation" }));
    // Nothing at all came back: the tiles failed, not an empty grid.
    if(!lines.length && !subs.length) return { unavailable: true };
    const b = map.getBounds(), P = projector(s.lng, s.lat);
    const edge = [
      Math.abs(P.to([b.getWest(), s.lat])[0]), Math.abs(P.to([b.getEast(), s.lat])[0]),
      Math.abs(P.to([s.lng, b.getSouth()])[1]), Math.abs(P.to([s.lng, b.getNorth()])[1])
    ];
    const reach = Math.min(...edge);
    const within = (x)=>x && x.km <= reach ? x : null;
    const hvSubs = byDistance(subs, s, f=>(toKv(f.properties.voltage) || 0) >= 60);
    return {
      reach,
      hv: within(nearestOnLines(lines, s, f=>(toKv(f.properties.voltage) || 0) >= 200)),
      sub: within(hvSubs[0] || null),
      sub225: within(byDistance(subs, s, f=>(toKv(f.properties.voltage) || 0) >= 200)[0] || null)
    };
  }

  function siteScores(s){
    const sc = {}, st = s.stat || {};
    const gridKm = [st.ref225, s.oim && s.oim.hv].filter(Boolean).map(x=>x.km);
    sc.grid = gridKm.length ? stepScore(Math.min(...gridKm), SITE_CRITERIA[0].steps, "below") : null;
    sc.generation = st.gen && st.gen.hasLayer ? stepScore(st.gen.mw, SITE_CRITERIA[1].steps, "above") : null;
    const conn = [
      st.hasCables ? stepScore(st.cable ? st.cable.km : null, CABLE_STEPS, "below") : null,
      st.hasDCs    ? (st.dc ? stepScore(st.dc.km, DC_STEPS, "below") : 1) : null
    ].filter(v=>v != null);
    sc.connectivity = conn.length ? conn.reduce((a, b)=>a + b, 0) / conn.length : null;
    sc.solar = s.solar && s.solar.ok ? stepScore(s.solar.yield, SITE_CRITERIA[3].steps, "above") : null;
    // Weighted mean over the criteria we could score; no grid, no verdict.
    let w = 0, t = 0;
    SITE_CRITERIA.forEach(c=>{ if(sc[c.key] != null){ w += c.weight; t += c.weight * sc[c.key]; } });
    sc.overall = sc.grid != null && w ? t / w : null;
    sc.coverage = w;
    return sc;
  }
  function verdict(v){
    return v == null ? "Not scored" : v >= 4 ? "Strong" : v >= 3 ? "Workable" : v >= 2 ? "Constrained" : "Weak";
  }

  // ---- overlay: 50 km ring, site pin, dashed links to the nearest grid ----
  function drawSiteOverlay(){
    if(!map || !site || !map.isStyleLoaded()) return;
    const feats = [{ type:"Feature", properties:{ role:"ring" },
      geometry:{ type:"Polygon", coordinates:[circle(site.lng, site.lat, SITE_RADIUS_KM, 72)] } }];
    const link = (x, role)=>{
      if(!x) return;
      feats.push({ type:"Feature", properties:{ role },
        geometry:{ type:"LineString", coordinates:[[site.lng, site.lat], x.at] } });
      feats.push({ type:"Feature", properties:{ role: role + "-end" }, geometry:{ type:"Point", coordinates:x.at } });
    };
    const st = site.stat || {}, oim = site.oim || {};
    const grid = [st.ref225, oim.hv].filter(Boolean).sort((a, b)=>a.km - b.km)[0];
    link(grid, "grid");
    link(oim.sub, "sub");
    feats.push({ type:"Feature", properties:{ role:"site" }, geometry:{ type:"Point", coordinates:[site.lng, site.lat] } });
    const data = { type:"FeatureCollection", features: feats };
    if(map.getSource("src-site")){ map.getSource("src-site").setData(data); return; }
    map.addSource("src-site", { type:"geojson", data });
    const col = SITE_COLOR();
    const role = (r)=>["==", ["get","role"], r];
    map.addLayer({ id:"lyr-site-ring-fill", type:"fill", source:"src-site", filter: role("ring"),
      paint:{ "fill-color": col, "fill-opacity": 0.06 } });
    map.addLayer({ id:"lyr-site-ring", type:"line", source:"src-site", filter: role("ring"),
      paint:{ "line-color": col, "line-width": 1.2, "line-opacity": 0.8, "line-dasharray":[2, 2] } });
    map.addLayer({ id:"lyr-site-links", type:"line", source:"src-site",
      filter:["any", role("grid"), role("sub")],
      paint:{ "line-color": col, "line-width": 1.6, "line-dasharray":[1.5, 1.5] } });
    map.addLayer({ id:"lyr-site-ends", type:"circle", source:"src-site",
      filter:["any", role("grid-end"), role("sub-end")],
      paint:{ "circle-radius": 4, "circle-color": isDark() ? "#070D1A" : "#FFFFFF",
              "circle-stroke-color": col, "circle-stroke-width": 2 } });
    map.addLayer({ id:"lyr-site-pin", type:"circle", source:"src-site", filter: role("site"),
      paint:{ "circle-radius": 7, "circle-color": col,
              "circle-stroke-color": isDark() ? "#070D1A" : "#FFFFFF", "circle-stroke-width": 2.5 } });
  }
  function removeSiteOverlay(){
    if(!map || !map.getStyle()) return;
    ["lyr-site-pin","lyr-site-ends","lyr-site-links","lyr-site-ring","lyr-site-ring-fill"]
      .forEach(id=>{ if(map.getLayer(id)) map.removeLayer(id); });
    if(map.getSource("src-site")) map.removeSource("src-site");
  }
  function clearSite(){
    if(!site) return;
    site = null;
    removeSiteOverlay();
    if(location.hash.startsWith("#site=")) history.replaceState(null, "", location.pathname + location.search);
  }

  // ---- mode toggle ----
  const siteBtn = $("#siteBtn"), siteHint = $("#siteHint"), mapWrap = $(".map-wrap");
  function setSiteMode(on){
    siteMode = on;
    if(siteBtn) siteBtn.setAttribute("aria-pressed", String(on));
    if(siteHint) siteHint.classList.toggle("hidden", !on);
    if(mapWrap) mapWrap.classList.toggle("site-mode", on);
    if(on) hideTooltip();
  }
  if(siteBtn) siteBtn.addEventListener("click", ()=>setSiteMode(!siteMode));

  // ---- run ----
  function runSiteDiagnostic(lng, lat){
    if(!map) return;
    const seq = ++siteSeq;
    removeSiteOverlay();
    site = { lng, lat, seq, inside: inCountry(lng, lat), stat: null, oim: null, solar: { pending: true } };
    history.replaceState(null, "", "#site=" + currentCountry + "/" + lat.toFixed(4) + "," + lng.toFixed(4));
    hideTooltip();
    drawSiteOverlay();
    renderSite();
    const live = ()=>site && site.seq === seq;

    loadSiteGrid(currentCountry).then(ref=>{
      if(!live()) return;
      site.refAvailable = !!ref;
      site.stat = analyseStatic(site, ref);
      drawSiteOverlay(); renderSite();
    });

    fetchSolar(lat, lng)
      .then(v=>{ if(live()){ site.solar = Object.assign({ ok: true }, v); renderSite(); } })
      .catch(e=>{ if(live()){ site.solar = { ok: false, error: String(e && e.message || e) }; renderSite(); } });

    // Bring the tiles around the site in, then read the live OSM grid.
    let done = false;
    const readOim = ()=>{
      if(done || !live()) return;
      done = true;
      site.oim = analyseOim(site);
      drawSiteOverlay(); renderSite();
    };
    // Desktop: the details sheet covers the right 384 px, so centre the
    // site in what stays visible. Phones: the sheet is at the bottom.
    const wide = window.matchMedia("(min-width: 901px)").matches;
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), SITE_ZOOM),
                 offset: wide ? [-192, 0] : [0, -Math.round(map.getContainer().clientHeight * 0.2)], duration: 700 });
    map.once("idle", readOim);
    setTimeout(readOim, 6000);  // slow tiles: score with what has arrived
  }

  // ---- render ----
  function siteRows(s, sc){
    const st = s.stat, oim = s.oim, pend = '<span class="site-pending">analysing…</span>';
    const name = (x)=>escapeHtml(x && x.f && x.f.properties && x.f.properties.name || "unnamed");
    const rows = {};

    // Grid
    if(!st && !oim) rows.grid = { value: pend, detail: "" };
    else {
      const best = [st && st.ref225, oim && oim.hv].filter(Boolean).sort((a, b)=>a.km - b.km)[0];
      const d = [];
      if(st && s.refAvailable){
        const src = escapeHtml(COUNTRIES[currentCountry].siteGrid.source);
        d.push(`≥225 kV: <b>${fmtKm(st.ref225 && st.ref225.km)}</b> · 400 kV: <b>${fmtKm(st.ref400 && st.ref400.km)}</b> <span class="micro">(${src})</span>`);
      }
      if(!oim) d.push(`OSM grid: ${pend}`);
      else if(oim.off) d.push(`<span class="micro">Turn on the Transmission grid layer to add live OSM lines and substations.</span>`);
      else if(oim.unavailable) d.push(`<span class="micro">Live OSM grid tiles did not load${s.refAvailable ? "; scored on the reference grid only" : " and this country has no reference grid file, so grid access can't be scored"}.</span>`);
      else {
        d.push(`OSM ≥200 kV line: <b>${oim.hv ? fmtKm(oim.hv.km) : `none within ${fmtKm(oim.reach)}`}</b>`);
        const sub = oim.sub225 || oim.sub;
        d.push(sub
          ? `Nearest${oim.sub225 ? " ≥200 kV" : ""} substation: <b>${name(sub)}</b>${toKv(sub.f.properties.voltage) ? ` (${Math.round(toKv(sub.f.properties.voltage))} kV)` : ""} · <b>${fmtKm(sub.km)}</b>`
          : `No HV substation within ${fmtKm(oim.reach)} <span class="micro">(loaded tiles)</span>`);
      }
      if(st && st.planned) d.push(`Planned line: ${name(st.planned)} · <b>${fmtKm(st.planned.km)}</b>`);
      rows.grid = { value: best ? fmtKm(best.km) + " to ≥225 kV" : oim && !oim.off && !oim.unavailable ? `none within ${fmtKm(oim.reach)}` : "no grid data",
                    detail: d.join("<br>") };
    }

    // Generation
    if(!st) rows.generation = { value: pend, detail: "" };
    else if(!st.gen.hasLayer) rows.generation = { value: "no plant data", detail: "" };
    else {
      const g = st.gen, share = g.mw ? Math.round(100 * g.renewMw / g.mw) : 0;
      rows.generation = {
        value: `${Math.round(g.mw).toLocaleString()} MW`,
        detail: (g.mw ? `${share}% renewable · ` : "") +
          (g.top.length ? g.top.map(x=>`${name(x)} (${fmtCap(x.f.properties.capacity_mw)}, ${escapeHtml(x.f.properties.fuel_type)})`).join(", ")
                        : "No tracked operating plant within 50 km") +
          (g.pipelineMw ? `<br>+ ${Math.round(g.pipelineMw).toLocaleString()} MW under construction / planned` : "")
      };
    }

    // Connectivity
    if(!st) rows.connectivity = { value: pend, detail: "" };
    else {
      const d = [];
      if(st.hasCables) d.push(st.cable ? `Cable landing: <b>${name(st.cable)}</b> · <b>${fmtKm(st.cable.km)}</b>` : "No cable landing in the data");
      if(st.hasDCs) d.push(st.dc ? `Nearest operating DC: <b>${name(st.dc)}</b> · <b>${fmtKm(st.dc.km)}</b>` : "No operating data centre in the data");
      rows.connectivity = { value: d.length ? [st.cable && "cable " + fmtKm(st.cable.km), st.dc && "DC " + fmtKm(st.dc.km)].filter(Boolean).join(" · ") || "remote" : "no digital data",
                            detail: d.join("<br>") };
    }

    // Solar
    const so = s.solar || {};
    rows.solar = so.pending ? { value: pend, detail: "" }
      : so.ok ? { value: `${Math.round(so.yield).toLocaleString()} kWh/kWp`,
                  detail: `Fixed, south-facing, ${Math.min(45, Math.round(Math.abs(s.lat)))}° tilt, 14 % losses` +
                          (so.irr ? ` · in-plane irradiation ${Math.round(so.irr).toLocaleString()} kWh/m²/yr` : "") + " · PVGIS (EU JRC)" }
      : { value: "unavailable", detail: `<span class="micro">PVGIS did not answer (${escapeHtml(so.error || "error")}); scored without it.</span>` };
    return rows;
  }

  function renderSite(){
    if(!site) return;
    const s = site, sc = siteScores(s), rows = siteRows(s, sc), st = s.stat;
    const allIn = st && s.oim && !s.solar.pending;
    const overall = sc.overall;
    const bar = (v)=>`<span class="site-bar"><span class="site-bar-fill" data-w="${v == null ? 0 : Math.round(v / 5 * 100)}"></span></span>`;

    const crit = SITE_CRITERIA.map(c=>`
      <div class="site-crit">
        <div class="site-crit-head">
          <span class="site-crit-name">${c.label} <span class="micro">${Math.round(c.weight * 100)}%</span></span>
          <span class="site-crit-score">${sc[c.key] == null ? "—" : sc[c.key].toFixed(sc[c.key] % 1 ? 1 : 0) + "<small>/5</small>"}</span>
        </div>
        ${bar(sc[c.key])}
        <div class="site-crit-value">${rows[c.key].value}</div>
        ${rows[c.key].detail ? `<div class="site-crit-detail">${rows[c.key].detail}</div>` : ""}
      </div>`).join("");

    const ctx = [];
    if(st){
      if(st.loads.list.length) ctx.push(`<li><b>Large loads within 50 km:</b> ~${Math.round(st.loads.mw).toLocaleString()} MW — ${st.loads.list.map(x=>escapeHtml(x.f.properties.name)).join(", ")}</li>`);
      if(st.dcNear.count) ctx.push(`<li><b>Data centres within 50 km:</b> ${st.dcNear.count}${st.dcNear.mw ? ` · ${Math.round(st.dcNear.mw).toLocaleString()} MW incl. announced` : ""}</li>`);
    }

    $("#popupBadge").innerHTML = `<span class="badge site"><span class="dot" data-bg="${escapeHtml(SITE_COLOR())}"></span>Site diagnostic</span>`;
    paint($("#popupBadge"));
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">Site screening</h1>
      <div class="pop-sub">${fmtCoord(s.lat, s.lng)}</div>
      ${s.inside ? "" : `<div class="site-warn">Outside ${escapeHtml(COUNTRIES[currentCountry].label)}'s outline: the map's data stops at the border, so this read-out is incomplete.</div>`}
      <div class="site-score">
        <div class="site-score-v">${overall == null ? "—" : overall.toFixed(1)}<small>/5</small></div>
        <div>
          <div class="site-score-label">${allIn || overall == null ? verdict(overall) : verdict(overall) + "…"}</div>
          <div class="micro">${allIn ? `Screening indicator · ${Math.round(sc.coverage * 100)}% of weights scored` : "Analysing…"}</div>
        </div>
      </div>
      ${crit}
      ${ctx.length ? `<h3 class="site-h">Context</h3><ul class="site-ctx">${ctx.join("")}</ul>` : ""}
      <details>
        <summary>How the score works</summary>
        <div class="site-method">
          <p>Each criterion scores 1–5 against fixed thresholds; the score is their weighted mean over the criteria that could be scored. Grid access is required.</p>
          <ul>${SITE_CRITERIA.map(c=>`<li><b>${c.label}</b> (${Math.round(c.weight*100)}%): ${c.steps ? `5 / 4 / 3 / 2 at ${c.dir === "below" ? "≤" : "≥"} ${c.steps.join(" / ")} ` : ""}${escapeHtml(c.unit)}</li>`).join("")}</ul>
          <p>Distances are straight-line. Line data is indicative, not survey-grade; OSM lines and substations come from the tiles loaded around the site. Spare capacity at a substation is not public and is <b>not</b> assessed — confirm with the TSO.</p>
        </div>
      </details>
      <div class="pop-actions">
        <button type="button" id="siteCopy">Copy summary</button>
        <button type="button" id="siteLink">Copy link</button>
      </div>`;
    $("#popupBody").querySelectorAll("[data-w]").forEach(el=>{ el.style.width = el.dataset.w + "%"; });
    const copy = (btn, text)=>{
      const ok = ()=>{ btn.textContent = "Copied ✓"; }, ko = ()=>{ btn.textContent = "Copy failed"; };
      try{ navigator.clipboard.writeText(text).then(ok, ko); }catch(e){ ko(); }
    };
    $("#siteCopy").addEventListener("click", (e)=>copy(e.currentTarget, siteSummary(s, sc, rows)));
    $("#siteLink").addEventListener("click", (e)=>copy(e.currentTarget, location.href));
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function siteSummary(s, sc, rows){
    const strip = (h)=>{ const d = document.createElement("div"); d.innerHTML = h.replace(/<br>/g, "\n   "); return d.textContent; };
    return [
      `Wattu site screening — ${fmtCoord(s.lat, s.lng)} (${COUNTRIES[currentCountry].label})`,
      `Score: ${sc.overall == null ? "—" : sc.overall.toFixed(1)}/5 (${verdict(sc.overall)}) — screening indicator, not a grid-connection study`,
      ...SITE_CRITERIA.map(c=>`- ${c.label} [${sc[c.key] == null ? "—" : sc[c.key].toFixed(sc[c.key] % 1 ? 1 : 0)}/5]: ${strip(rows[c.key].value)}${rows[c.key].detail ? "\n   " + strip(rows[c.key].detail) : ""}`),
      location.href
    ].join("\n");
  }

  // A shared link (#site=<country>/<lat>,<lng>) reopens the diagnostic.
  function siteFromHash(){
    const m = /^#site=([a-z-]+)\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(location.hash);
    if(!m) return null;
    const lat = +m[2], lng = +m[3];
    if(!ENABLED.includes(m[1]) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { country: m[1], lat, lng };
  }
  let pendingSite = siteFromHash();

  // ---------- Country switch ----------
  countrySelect.addEventListener("change", async (e)=>{
    const key = e.target.value;
    if(!ENABLED.includes(key)) return;
    currentCountry = key;
    const c = COUNTRIES[key];
    closePopup();
    hideTooltip();
    hoveredLayer = null;
    if(!(await loadAllData(key))) return; // superseded by a later switch
    renderPanel(key);
    if(map && mapReady){
      map.flyTo({ center: c.center, zoom: c.zoom, speed: 0.8, curve: 1.4 });
      buildMapLayers(key);
    }
  });

  boot();
})();
