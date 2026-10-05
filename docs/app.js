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
  const OIM_ATTR  = '<a href="https://openinframap.org" target="_blank">OpenInfraMap</a> (ODbL)';
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
  function fmtInvestment(v){
    if(v == null) return "—";
    if(v >= 1e9) return "$" + (v/1e9).toFixed(1).replace(/\.0$/,"") + "B";
    if(v >= 1e6) return "$" + Math.round(v/1e6) + "M";
    return "$" + v.toLocaleString();
  }
  function fmtCap(mw){ return mw == null ? "—" : mw.toLocaleString() + " MW"; }
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
    if(dataReady && mapReady) buildMapLayers(currentCountry);
  }

  function boot(){
    const initialCountry = ENABLED.includes(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : ENABLED[0];
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
      map.addControl(new maplibregl.AttributionControl({ compact:true }), "bottom-left");

      map.on("load", ()=>{ mapReady = true; tryBuild(); });
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
        ? `<span class="layer-line${planned ? " dashed" : ""}" style="border-color:${dotColor}"></span>`
        : `<span class="layer-dot" style="background:${dotColor}"></span>`;
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
    const totalMW = fcPower.features.reduce((s,f)=>s + (f.properties.capacity_mw || 0), 0);
    const renewMW = fcPower.features.filter(f=>RENEWABLE_FUELS.includes(f.properties.fuel_type))
                    .reduce((s,f)=>s + (f.properties.capacity_mw || 0), 0);
    const renewShare = totalMW ? Math.round(100 * renewMW / totalMW) : 0;
    const dcMW = fcDC.features.reduce((s,f)=>s + (f.properties.capacity_estimate_mw || 0), 0);
    const dcInvest = fcDC.features.reduce((s,f)=>s + (f.properties.investment_usd || 0), 0);
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
      fuel_type: OSM_FUEL[p.source] || p.source || "unknown",
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
      <div class="tt-name">${dot ? `<span class="tt-dot" style="background:${dot}"></span>` : ""}${escapeHtml(p.name)}</div>
      <div class="tt-metric">${escapeHtml(metric)}</div>
      <div class="tt-meta">
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>` : escapeHtml(p.source || "—")}
        ${p.commissioning_year || p.year ? " · " + escapeHtml(p.commissioning_year || p.year) : ""}
      </div>`;
    positionTooltip(point);
  }
  function showLineTooltip(f, point){
    const p = f.properties || {};
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(p.name)}</div>
      <div class="tt-metric">${escapeHtml(p.voltage_kv)} kV · ${escapeHtml(p.status || "")}</div>
      <div class="tt-meta">${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>` : escapeHtml(p.source || "—")}</div>`;
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
        <div class="cell"><div class="k">Fuel</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.fuel_type)}</div></div>
        <div class="cell"><div class="k">Technology</div><div class="v" style="font-size:12px">${escapeHtml(p.tech || "—")}</div></div>
        <div class="cell"><div class="k">${p.status==="operational"?"Commissioned":"Target year"}</div><div class="v">${escapeHtml(p.commissioning_year || "—")}</div></div>`;
    } else if(kind === "industrial"){
      stats = `
        <div class="cell"><div class="k">Sector</div><div class="v" style="font-size:12px">${escapeHtml(p.sector)}</div></div>
        <div class="cell"><div class="k">Est. demand</div><div class="v">${fmtCap(p.estimated_demand_mw)}</div></div>
        <div class="cell"><div class="k">Grid connection</div><div class="v" style="font-size:11.5px">${escapeHtml(p.grid_connection || "—")}</div></div>
        <div class="cell"><div class="k">Precision</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.precision || "—")}</div></div>`;
    } else if(kind === "digital"){
      stats = `
        <div class="cell"><div class="k">Operator</div><div class="v" style="font-size:12px">${escapeHtml(p.operator || "—")}</div></div>
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

    $("#popupBadge").innerHTML = `<span class="badge ${badgeClass}"><span class="dot" style="background:${dotColor}"></span>${badgeLabel}</span>`;
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${p.region ? escapeHtml(p.region) + " · " : ""}${coords}</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">${stats}</div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}${p.vintage ? " · " + escapeHtml(p.vintage) : ""}</span>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>Raw data</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        ${p.osm
          // OSM data is fixed at the source, where every map using it benefits.
          ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">View on OpenInfraMap ↗</a>
             <a href="https://www.openstreetmap.org/#map=17/${f.geometry.coordinates[1].toFixed(5)}/${f.geometry.coordinates[0].toFixed(5)}" target="_blank" rel="noopener">Fix on OpenStreetMap ↗</a>`
          : `<a href="${escapeHtml(issueUrl(`${COUNTRIES[currentCountry].label} map — correction: ${p.name}`, `Feature id: ${p.id || p.name}\n\nSuggested correction:\n`))}" target="_blank" rel="noopener">Report an error</a>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Primary source ↗</a>` : ""}`}
      </div>`;
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function openLinePopup(f){
    const p = f.properties || {};
    $("#popupBadge").innerHTML = `<span class="badge grid"><span class="dot" style="background:${GRID_COLOR}"></span>Transmission line</span>`;
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${escapeHtml(p.voltage_kv)} kV</div>
      <span class="status-pill ${escapeHtml(p.status || "operational")}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">
        <div class="cell"><div class="k">Voltage</div><div class="v">${escapeHtml(p.voltage_kv)} kV</div></div>
        <div class="cell"><div class="k">Status</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.status)}</div></div>
        <div class="cell"><div class="k">Precision</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.precision || "approximate")}</div></div>
        <div class="cell"><div class="k">Kind</div><div class="v">${p.kind === "hvdc_planned" ? "HVDC (planned)" : "AC"}</div></div>
      </div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}</span>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
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
    popup.classList.remove("open");
    popup.setAttribute("aria-hidden","true");
  }
  $("#popupClose").addEventListener("click", closePopup);
  document.addEventListener("keydown", (e)=>{
    if(e.key !== "Escape") return;
    if(!methModal.classList.contains("hidden")) methModal.classList.add("hidden");
    else closePopup();
  });

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
