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
  const fmtMW = (mw)=>mw >= 1000 ? (mw/1000).toFixed(1).replace(/\.0$/, "") + " GW" : Math.round(mw) + " MW";

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
  // A shared link's view and feature wait for the map and the data.
  let initialView = null, pendingFeature = null;
  function tryBuild(){
    if(!(dataReady && mapReady)) return;
    buildMapLayers(currentCountry);
    if(pendingFeature){ openLinkedFeature(pendingFeature, !initialView); pendingFeature = null; }
    urlReady = true;
  }

  function boot(){
    const link = readLink();
    const initialCountry = ENABLED.includes(link.country) ? link.country
      : ENABLED.includes(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : ENABLED[0];
    countrySelect.value = initialCountry;
    currentCountry = initialCountry;
    initialView = link.country === initialCountry ? link.view : null;
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
      const r = await fetch(c.dataPath + "boundary.geojson" + ASSET_V);
      if(r.ok) boundary = await r.json();
    } catch(e){ /* no boundary for this country */ }
    if(c.mix){
      try{
        const r = await fetch(c.dataPath + c.mix + ASSET_V);
        if(r.ok) mix = await r.json();
      } catch(e){ console.warn("[MoroccoMap] failed to load", c.mix, e); }
    }

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
      row.title = `${L.source} · updated ${L.updated}`;
      row.innerHTML = `
        <input type="checkbox" ${visibility[L.id]!==false?"checked":""}>
        <span class="check"></span>
        ${swatch}
        <span class="layer-name">${escapeHtml(L.title)}</span>
        <span class="layer-count">${LIVE_KINDS.includes(kind) ? "live" : shown === fc.features.length ? shown : `${shown} / ${fc.features.length}`}</span>
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
    return mw >= 1000 ? `${(mw/1000).toFixed(1)}<small> GW</small>` : `${Math.round(mw)}<small> MW</small>`;
  }

  // Figures summed from the layers on the map, so they follow the fuel picked
  // in the mix legend. National totals are in the Electricity mix above.
  function renderKPIs(countryKey){
    const host = $("#kpiGrid");
    const c = COUNTRIES[countryKey];
    const snap = $("#snapshotSource");
    if(snap) snap.textContent = c.snapshotSource ? "plants: " + c.snapshotSource : "";
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
    const prefix = fuel ? escapeHtml(fuel.label) + " · " : "";
    host.innerHTML = `
      <div class="kpi" title="Plants on the map that are operating"><div class="k">${prefix}In service</div>
        <div class="v">${hasPower ? fmtPower(inService) : NA}</div></div>
      <div class="kpi" title="Plants on the map under construction or announced. — means the plant source lists built plants only."><div class="k">${prefix}Pipeline</div>
        <div class="v">${hasPower && tracksPipeline ? fmtPower(pipeline) : NA}</div></div>
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
    ).join("") + (mixData ? `<li><strong>Electricity mix:</strong> ${escapeHtml(mixData.source)} — <a href="${escapeHtml(safeUrl(mixData.source_url))}" target="_blank" rel="noopener">${escapeHtml(mixData.source_url)}</a> <span class="micro">(${escapeHtml(mixData.year)} figures; national, not summed from the map)</span></li>` : "") +
    (c.boundary ? `<li><strong>Boundary:</strong> ${escapeHtml(c.boundary.source)} — <a href="${escapeHtml(c.boundary.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(c.boundary.sourceUrl)}</a>${c.boundary.note ? ` <span class="micro">(${escapeHtml(c.boundary.note)})</span>` : ""}</li>` : "") +
    `<li><strong>Basemap:</strong> MapLibre GL + <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL) — public, no token required.</li>`;
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
    note.textContent = shown ? `${shown.toLocaleString("en")} of ${total.toLocaleString("en")} mapped assets` +
        (statusView === "pipeline" ? " are under construction, announced or planned." : " are in service.")
      : statusView === "pipeline"
        ? "None of this country's mapped assets is under construction or announced: its sources list built ones only."
        : "None of this country's mapped assets is listed as in service.";
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
  const fmtShare = (v)=>v >= 0.95 ? Math.round(v) + "%" : v >= 0.1 ? v.toFixed(1) + "%" : v > 0 ? "<0.1%" : "—";
  const fmtAmount = (v, unit)=>(v >= 100 ? Math.round(v).toLocaleString("en") : v >= 0.1 ? v.toFixed(1) : "<0.1") + " " + unit;
  // Plant capacity in text: MW under 1 GW, as the tiles show it.
  const fmtGW = (gw)=>gw >= 1 ? fmtAmount(gw, "GW") : Math.round(gw * 1000) + " MW";
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
    $("#mixTotal").textContent = fmtAmount(total, cap ? "GW installed" : "TWh generated");
    section.querySelectorAll(".seg-btn").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.measure === mixMeasure)));
    section.classList.toggle("has-filter", !!fuelFilter);
    section.classList.remove("has-hot");   // a tap's hover must not outlive the rebuild

    const bar = $("#mixBar"), legend = $("#mixLegend");
    bar.replaceChildren(); legend.replaceChildren();
    m.fuels.forEach(f=>{
      const color = FUEL_COLOR[f.fuel] || "#888";
      const picked = fuelFilter === f.fuel;
      const tip = `${f.label}: ${amount(f)}, ${fmtShare(share(f))}`;
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
      btn.title = tip + (picked ? ". Pick again to show every plant." : ". Show only these plants on the map.");
      btn.setAttribute("aria-pressed", String(picked));
      const sw = el("span", "mix-swatch"); sw.style.background = color;
      btn.append(sw, el("span", "mix-label", f.label), el("span", "mix-val", fmtShare(share(f))));
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
    host.append(el("span", null, `Map: ${f.label.toLowerCase()} plants only · ${n} shown`));
    const all = el("button", "link-btn", "Show all");
    all.type = "button";
    all.addEventListener("click", ()=>setFuelFilter(null));
    host.appendChild(all);
  }

  function renderMixFacts(m){
    const dl = $("#mixFacts");
    dl.replaceChildren();
    const row = (k, v)=>{ dl.append(el("dt", null, k), el("dd", null, v)); };
    row("Renewables", `${fmtShare(m.renewables_pct_generation)} of generation` +
      (m.renewables_pct_capacity != null ? ` · ${fmtShare(m.renewables_pct_capacity)} of capacity` : ""));
    const imp = m.net_imports_twh;
    if(imp != null){
      if(Math.abs(imp) < 0.05) row("Trade", "Imports and exports balance");
      else if(imp > 0) row("Net imports", `${fmtAmount(imp, "TWh")}` +
        (m.demand_twh ? ` · ${fmtShare(100 * imp / m.demand_twh)} of demand` : ""));
      else row("Net exports", `${fmtAmount(-imp, "TWh")} · ${fmtShare(100 * -imp / m.generation_twh)} of generation`);
    }
    if(m.co2_intensity_g_per_kwh != null) row("CO₂ intensity", `${Math.round(m.co2_intensity_g_per_kwh)} g/kWh`);
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
      host.append(el("span", null, `${plantLayer.title} layer${f ? ", " + f.label.toLowerCase() : ""}: ` +
        `${fmtGW(mappedMW / 1000)} in service, ` +
        (pct <= 100 ? `${Math.round(pct)}% of the ${fmtGW(nationalGW)} installed. `
                    : `against ${fmtGW(nationalGW)} installed per Ember. `)));
    }
    if(cap && m.capacity_gaps.length){
      const names = m.capacity_gaps.map(g=>(mixFuel(g) || { label:g }).label).join(", ");
      host.append(el("span", "mix-gap", `The source lists no ${names} capacity though it generates power: this view undercounts it. `));
    }
    host.append(el("span", null, "Source: "));
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
        "text-field":["case", [">=", ["get","mw"], 1000],
          ["concat", ["to-string", ["/", ["round", ["/", ["get","mw"], 100]], 10]], " GW"],
          ["concat", ["to-string", ["round", ["get","mw"]]], " MW"]],
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
  function showClusterTooltip(f, point){
    const p = f.properties || {};
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(num(p.point_count))} plants · ${escapeHtml(fmtMW(num(p.mw) || 0))}</div>
      <div class="tt-metric">Click to zoom in</div>`;
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
        ${selected ? `<button type="button" class="pop-share">Copy link</button>` : ""}
      </div>`;
    wirePopupShare();
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
    syncUrl();
  }

  function openLinePopup(dataLayerId, f){
    const p = f.properties || {};
    selected = p.id != null ? { layer: dataLayerId, id: String(p.id) } : null;
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
        ${selected ? `<button type="button" class="pop-share">Copy link</button>` : ""}
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
                   measure: q.get("measure"), layers: null, view: null, feature: null };
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
    const parts = [["country", currentCountry]];
    if(map){
      const ctr = map.getCenter();
      parts.push(["map", `${map.getZoom().toFixed(2)}/${ctr.lat.toFixed(4)}/${ctr.lng.toFixed(4)}`]);
    }
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
  }

  // Opens the popup of a linked feature; `fly` centres the map on it when the
  // link carried no view of its own.
  function openLinkedFeature(ref, fly){
    const L = layerConfig(ref.layer);
    const fc = layerData[ref.layer];
    const f = L && fc && fc.features.find(x=>String(x.properties.id) === ref.id);
    if(!f) return;
    if(L.kind === "grid"){
      openLinePopup(L.id, f);
      if(fly){
        const pts = (f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.coordinates.flat());
        const lng = pts.map(p=>p[0]), lat = pts.map(p=>p[1]);
        map.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 60, duration: 0 });
      }
    } else {
      openPointPopup(L.id, f);
      if(fly) map.jumpTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 8) });
    }
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
    try{ await navigator.clipboard.writeText(url); showToast("Link copied"); }
    catch(e){ showToast("Copy the link from the address bar"); }
  }
  $("#shareBtn").addEventListener("click", shareView);

  // A link pasted into this tab, or an edited hash.
  window.addEventListener("hashchange", ()=>{
    if(location.hash === writeLink()) return;
    const link = readLink();
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
    if(e.key !== "Escape") return;
    if(!methModal.classList.contains("hidden")) methModal.classList.add("hidden");
    else closePopup();
  });

  // ---------- Country switch ----------
  // `link`: the shared link being applied, if the switch comes from one.
  async function switchCountry(key, link){
    if(!ENABLED.includes(key)) return;
    currentCountry = key;
    countrySelect.value = key;
    const c = COUNTRIES[key];
    closePopup();
    hideTooltip();
    hoveredLayer = null;
    fuelFilter = null;
    if(!(await loadAllData(key))) return; // superseded by a later switch
    if(link) applyLinkState(link);
    renderPanel(key);
    if(map && mapReady){
      if(link && link.view) map.jumpTo(link.view);
      else map.flyTo({ center: c.center, zoom: c.zoom, speed: 0.8, curve: 1.4 });
      buildMapLayers(key);
      if(link && link.feature) openLinkedFeature(link.feature, !link.view);
    } else if(link){
      pendingFeature = link.feature;
    }
    syncUrl();
  }
  countrySelect.addEventListener("change", (e)=>switchCountry(e.target.value, null));

  boot();
})();
