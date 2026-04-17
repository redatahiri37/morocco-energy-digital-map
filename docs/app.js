/* =============================================================
   Energy × Digital Nexus — Morocco Infrastructure Map v1.0
   Single-file app logic: country switch, layer manifest, map,
   tooltips, popups, methodology modal.
   ============================================================= */

(function(){
  "use strict";

  // ---------- Config & country manifest ----------
  const CFG       = window.APP_CONFIG || { mapboxToken:null, defaultCountry:"morocco" };
  const COUNTRIES = window.COUNTRIES || {};
  const ENABLED   = (window.COUNTRIES_ENABLED || ["morocco"]).filter(k=>COUNTRIES[k]);
  const REPO_URL  = "https://github.com/redatahiri37/morocco-energy-digital-map";

  const FUEL_COLOR = {
    solar:"#F59E0B", wind:"#0D9488", hydro:"#3B82F6",
    coal:"#8B7F72",  gas:"#C77B3A", oil:"#A55A2A"
  };
  const DIGITAL_COLOR    = "#7C3AED";
  const INDUSTRIAL_COLOR = "#EA580C";
  const CABLE_COLOR      = "#F97316";
  const GRID_COLOR       = "#E5E4E0";

  const LAYER_KIND = {
    "power-plants":"power",
    "grid-lines":"grid",
    "industrial":"industrial",
    "digital":"digital"
  };

  // ---------- State ----------
  let map = null;
  let currentCountry = null;
  let layerData      = {};   // id -> GeoJSON
  let markersByLayer = {};   // id -> Marker[]
  let visibility     = {};   // id -> bool

  // ---------- DOM refs ----------
  const $ = (sel)=>document.querySelector(sel);
  const tooltip = $("#tooltip");
  const popup   = $("#popup");
  const noTokenCard = $("#noTokenCard");

  // ---------- Theme ----------
  const savedTheme = localStorage.getItem("mg.theme") || "dark";
  document.body.dataset.theme = savedTheme;
  $("#themeToggle").addEventListener("click", ()=>{
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem("mg.theme", next);
    if(map){
      map.setStyle(next === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11");
      map.once("styledata", ()=>buildMapLayers(currentCountry));
    }
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

  // ---------- Repo / contribute links ----------
  ["githubLink","githubContribute","githubFooter"].forEach(id=>{ const el = $("#"+id); if(el) el.href = REPO_URL; });

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
  function fmtDate(iso){ return iso || "—"; }
  function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  function layerKind(layerId){ return LAYER_KIND[layerId] || "other"; }

  // ---------- Token handling ----------
  function getToken(){
    return (CFG.mapboxToken && CFG.mapboxToken.startsWith("pk.") ? CFG.mapboxToken : null)
        || localStorage.getItem("mg.token");
  }
  function showNoToken(reason){
    noTokenCard.classList.remove("hidden");
    if(reason) console.warn("[MoroccoMap]", reason);
  }
  $("#tokenSave").addEventListener("click", ()=>{
    const v = $("#tokenInput").value.trim();
    if(!v.startsWith("pk.")){ $("#tokenInput").style.borderColor = "#ef4444"; return; }
    localStorage.setItem("mg.token", v);
    noTokenCard.classList.add("hidden");
    bootMap(v);
  });
  $("#tokenInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("#tokenSave").click(); });

  // ---------- Boot ----------
  function boot(){
    const initialCountry = ENABLED.includes(CFG.defaultCountry) ? CFG.defaultCountry : ENABLED[0];
    countrySelect.value = initialCountry;
    currentCountry = initialCountry;
    renderPanelShell(initialCountry);   // panel works even without a map
    loadAllData(initialCountry).then(()=>{
      renderLayerList(initialCountry);
      renderKPIs(initialCountry);
      renderMethodologySources(initialCountry);
    });

    const token = getToken();
    if(!token){ showNoToken("No Mapbox token available"); return; }
    bootMap(token);
  }

  function bootMap(token){
    try{
      mapboxgl.accessToken = token;
      const c = COUNTRIES[currentCountry];
      map = new mapboxgl.Map({
        container: "map",
        style: document.body.dataset.theme === "dark"
               ? "mapbox://styles/mapbox/dark-v11"
               : "mapbox://styles/mapbox/light-v11",
        center: c.center, zoom: c.zoom,
        attributionControl: { compact:true },
        projection: "mercator"
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass:false }), "bottom-right");

      map.on("load", ()=>buildMapLayers(currentCountry));
      map.on("click", (e)=>{
        if(e.originalEvent.target.closest(".mg-pin")) return;
        closePopup();
      });
      map.on("error", (e)=>{
        const msg = e && e.error && String(e.error.message||"");
        if(/token|401|Unauthor/i.test(msg)){
          localStorage.removeItem("mg.token");
          if(map){ map.remove(); map = null; }
          showNoToken("Invalid or restricted token: " + msg);
        }
      });
    } catch(err){
      showNoToken(String(err));
    }
  }

  // ---------- Data loading ----------
  async function loadAllData(countryKey){
    const c = COUNTRIES[countryKey];
    layerData = {};
    const promises = c.layers.map(async (L)=>{
      try{
        const res = await fetch(c.dataPath + L.file);
        if(!res.ok) throw new Error(res.status + " " + L.file);
        layerData[L.id] = await res.json();
      } catch(e){
        console.warn("[MoroccoMap] failed to load", L.file, e);
        layerData[L.id] = { type:"FeatureCollection", features:[] };
      }
      if(visibility[L.id] === undefined) visibility[L.id] = true;
    });
    await Promise.all(promises);
  }

  // ---------- Panel: layer list ----------
  function renderPanelShell(countryKey){
    const c = COUNTRIES[countryKey];
    if(!c) return;
    // KPI placeholders so it renders pre-data
    renderKPIs(countryKey);
  }

  function renderLayerList(countryKey){
    const c = COUNTRIES[countryKey];
    const host = $("#layerList");
    host.innerHTML = "";
    c.layers.forEach(L=>{
      const fc = layerData[L.id] || { features:[] };
      const kind = layerKind(L.id);
      const dotColor = (
        kind==="power"      ? FUEL_COLOR.solar :
        kind==="grid"       ? GRID_COLOR :
        kind==="industrial" ? INDUSTRIAL_COLOR :
        kind==="digital"    ? DIGITAL_COLOR : "#999"
      );
      const row = document.createElement("label");
      row.className = "layer-row";
      row.dataset.layer = L.id;
      row.innerHTML = `
        <input type="checkbox" ${visibility[L.id]!==false?"checked":""}>
        <span class="check"></span>
        <div class="layer-body">
          <div class="layer-head">
            <span class="layer-dot" style="background:${dotColor}"></span>
            <span class="layer-name">${escapeHtml(L.title)}</span>
            <span class="layer-count">${fc.features.length}</span>
          </div>
          <div class="layer-meta">
            <span>${escapeHtml(L.source)}</span> ·
            <a href="${escapeHtml(L.sourceUrl)}" target="_blank" rel="noopener">source ↗</a> ·
            <span class="micro">updated ${escapeHtml(L.updated)}</span>
          </div>
        </div>
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

  // ---------- Panel: KPIs (computed, not hardcoded) ----------
  function renderKPIs(countryKey){
    const host = $("#kpiGrid");
    const fcPower = layerData["power-plants"] || { features:[] };
    const fcDC    = layerData["digital"]      || { features:[] };

    const totalMW = fcPower.features.reduce((s,f)=>s + (f.properties.capacity_mw || 0), 0);
    const renewMW = fcPower.features.filter(f=>["solar","wind","hydro"].includes(f.properties.fuel_type))
                    .reduce((s,f)=>s + (f.properties.capacity_mw || 0), 0);
    const renewShare = totalMW ? Math.round(100 * renewMW / totalMW) : 0;
    const dcMW = fcDC.features.reduce((s,f)=>s + (f.properties.capacity_estimate_mw || 0), 0);
    const dcInvest = fcDC.features.reduce((s,f)=>s + (f.properties.investment_usd || 0), 0);

    host.innerHTML = `
      <div class="kpi"><div class="k">Tracked capacity</div>
        <div class="v">${(totalMW/1000).toFixed(1)}<small> GW</small></div></div>
      <div class="kpi"><div class="k">Renewables share*</div>
        <div class="v">${renewShare}<small>%</small></div></div>
      <div class="kpi"><div class="k">DC pipeline</div>
        <div class="v">${(dcMW/1000).toFixed(1)}<small> GW</small></div></div>
      <div class="kpi"><div class="k">DC investment</div>
        <div class="v">${fmtInvestment(dcInvest)}</div></div>
    `;
  }

  // ---------- Methodology modal content ----------
  function renderMethodologySources(countryKey){
    const c = COUNTRIES[countryKey];
    const host = $("#methodologySources");
    if(!host) return;
    host.innerHTML = c.layers.map(L=>
      `<li><strong>${escapeHtml(L.title)}:</strong> ${escapeHtml(L.source)} — <a href="${escapeHtml(L.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(L.sourceUrl)}</a> <span class="micro">(updated ${escapeHtml(L.updated)})</span></li>`
    ).join("");
  }

  // ---------- Map layers ----------
  function buildMapLayers(countryKey){
    if(!map) return;
    markersByLayer = {};

    const c = COUNTRIES[countryKey];
    c.layers.forEach(L=>{
      const fc = layerData[L.id] || { features:[] };
      const kind = layerKind(L.id);

      if(L.kind === "lines"){
        buildLineLayer(L.id, fc);
      } else {
        buildPointLayer(L.id, fc, kind);
      }
      applyLayerVisibility(L.id, visibility[L.id] !== false);
    });
  }

  function buildLineLayer(layerId, fc){
    const srcId = "src-" + layerId;
    const layerHV   = "lyr-" + layerId + "-hv";
    const layerMV   = "lyr-" + layerId + "-mv";
    const layerLV   = "lyr-" + layerId + "-lv";
    const layerPLAN = "lyr-" + layerId + "-planned";

    // Clean up prior instance (theme switch)
    [layerHV,layerMV,layerLV,layerPLAN].forEach(id=>{ if(map.getLayer(id)) map.removeLayer(id); });
    if(map.getSource(srcId)) map.removeSource(srcId);

    map.addSource(srcId, { type:"geojson", data: fc });

    map.addLayer({ id: layerHV, type:"line", source: srcId,
      filter:["all",["==",["get","status"],"operational"],[">=",["get","voltage_kv"],300]],
      paint:{ "line-color":GRID_COLOR, "line-width":2, "line-opacity":0.85 }
    });
    map.addLayer({ id: layerMV, type:"line", source: srcId,
      filter:["all",["==",["get","status"],"operational"],[">=",["get","voltage_kv"],100],["<",["get","voltage_kv"],300]],
      paint:{ "line-color":GRID_COLOR, "line-width":1.2, "line-opacity":0.6 }
    });
    map.addLayer({ id: layerLV, type:"line", source: srcId,
      filter:["all",["==",["get","status"],"operational"],["<",["get","voltage_kv"],100]],
      paint:{ "line-color":GRID_COLOR, "line-width":0.8, "line-opacity":0.35 }
    });
    map.addLayer({ id: layerPLAN, type:"line", source: srcId,
      filter:["==",["get","status"],"planned"],
      paint:{ "line-color":"#a37df0", "line-width":1.6, "line-opacity":0.9, "line-dasharray":[2,2] }
    });

    // Click behaviour on lines
    [layerHV,layerMV,layerLV,layerPLAN].forEach(id=>{
      map.on("mouseenter", id, ()=>{ map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, ()=>{ map.getCanvas().style.cursor = ""; hideTooltip(); });
      map.on("mousemove", id, (e)=>{
        const f = e.features[0];
        showLineTooltip(f, e.point);
      });
      map.on("click", id, (e)=>{
        const f = e.features[0];
        openLinePopup(f);
      });
    });
  }

  function buildPointLayer(layerId, fc, kind){
    markersByLayer[layerId] = (markersByLayer[layerId]||[]).map(m=>{ m.remove(); return null; });
    markersByLayer[layerId] = [];

    fc.features.forEach(f=>{
      const p = f.properties || {};
      const el = document.createElement("div");
      el.className = "mg-pin";
      // Fuel / category class
      if(kind === "power"){
        el.classList.add(p.fuel_type || "coal");
      } else if(kind === "industrial"){
        el.classList.add("industrial");
      } else if(kind === "digital"){
        if(p.category === "cable_landing") el.classList.add("cable");
        else el.classList.add("digital");
      }
      if(p.status === "announced") el.classList.add("announced");
      if(p.status === "construction") el.classList.add("construction");

      const m = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(f.geometry.coordinates)
        .addTo(map);

      el.addEventListener("mouseenter", ()=>showPointTooltip(layerId, f));
      el.addEventListener("mousemove",  (e)=>moveTooltip(e));
      el.addEventListener("mouseleave", hideTooltip);
      el.addEventListener("click", (e)=>{
        e.stopPropagation();
        openPointPopup(layerId, f);
        map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 6.5), speed: 0.8, curve: 1.4 });
      });

      markersByLayer[layerId].push(m);
    });
  }

  function applyLayerVisibility(layerId, on){
    if(!map) return;
    const kind = layerKind(layerId);
    if(kind === "grid"){
      ["hv","mv","lv","planned"].forEach(k=>{
        const id = "lyr-"+layerId+"-"+k;
        if(map.getLayer(id)) map.setLayoutProperty(id,"visibility", on ? "visible" : "none");
      });
    } else {
      (markersByLayer[layerId] || []).forEach(m=>{
        const el = m.getElement();
        el.style.opacity = on ? "1" : "0";
        el.style.pointerEvents = on ? "auto" : "none";
        el.style.transition = "opacity 200ms ease";
      });
    }
  }

  // ---------- Tooltip ----------
  function showPointTooltip(layerId, f){
    const p = f.properties || {};
    const kind = layerKind(layerId);
    let metric = "";
    if(kind === "power")       metric = `${fmtCap(p.capacity_mw)} · ${p.fuel_type || ""}`;
    else if(kind === "industrial") metric = `${p.sector || ""} · est. ${fmtCap(p.estimated_demand_mw)}`;
    else if(kind === "digital")    metric = p.capacity_estimate_mw ? `${fmtCap(p.capacity_estimate_mw)} · ${p.operator || ""}` : (p.operator || p.category || "");
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(p.name)}</div>
      <div class="tt-metric">${escapeHtml(metric)}</div>
      <div class="tt-meta">
        <a href="${escapeHtml(p.source_url || "#")}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a>
        · ${escapeHtml(p.commissioning_year || p.year || "")}
      </div>
    `;
    tooltip.style.display = "block";
  }
  function showLineTooltip(f, point){
    const p = f.properties || {};
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(p.name)}</div>
      <div class="tt-metric">${p.voltage_kv} kV · ${escapeHtml(p.status || "")}</div>
      <div class="tt-meta"><a href="${escapeHtml(p.source_url || "#")}" target="_blank" rel="noopener">${escapeHtml(p.source || "—")}</a></div>
    `;
    const rect = $("#map").getBoundingClientRect();
    tooltip.style.left = (point.x) + "px";
    tooltip.style.top  = (point.y) + "px";
    tooltip.style.display = "block";
  }
  function moveTooltip(e){
    const rect = $("#map").getBoundingClientRect();
    tooltip.style.left = (e.clientX - rect.left) + "px";
    tooltip.style.top  = (e.clientY - rect.top)  + "px";
  }
  function hideTooltip(){ tooltip.style.display = "none"; }

  // ---------- Popup ----------
  function openPointPopup(layerId, f){
    const p = f.properties || {};
    const kind = layerKind(layerId);
    const badgeClass = kind === "power" ? "power" : kind === "industrial" ? "industrial" : kind === "digital" ? "digital" : "grid";
    const badgeLabel = kind === "power" ? "Generation" : kind === "industrial" ? "Industrial consumer" : kind === "digital" ? (p.category === "cable_landing" ? "Submarine cable" : "Data center") : "Infrastructure";

    let stats = "";
    if(kind === "power"){
      stats = `
        <div class="cell"><div class="k">Capacity</div><div class="v">${fmtCap(p.capacity_mw)}</div></div>
        <div class="cell"><div class="k">Fuel</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.fuel_type)}</div></div>
        <div class="cell"><div class="k">Technology</div><div class="v" style="font-size:12px">${escapeHtml(p.tech || "—")}</div></div>
        <div class="cell"><div class="k">${p.status==="operational"?"Commissioned":"Target year"}</div><div class="v">${escapeHtml(p.commissioning_year || "—")}</div></div>
      `;
    } else if(kind === "industrial"){
      stats = `
        <div class="cell"><div class="k">Sector</div><div class="v" style="font-size:12px">${escapeHtml(p.sector)}</div></div>
        <div class="cell"><div class="k">Est. demand</div><div class="v">${fmtCap(p.estimated_demand_mw)}</div></div>
        <div class="cell"><div class="k">Grid connection</div><div class="v" style="font-size:11.5px">${escapeHtml(p.grid_connection || "—")}</div></div>
        <div class="cell"><div class="k">Precision</div><div class="v" style="text-transform:capitalize">${escapeHtml(p.precision || "—")}</div></div>
      `;
    } else if(kind === "digital"){
      stats = `
        <div class="cell"><div class="k">Operator</div><div class="v" style="font-size:12px">${escapeHtml(p.operator || "—")}</div></div>
        <div class="cell"><div class="k">Capacity</div><div class="v">${p.capacity_estimate_mw!=null ? fmtCap(p.capacity_estimate_mw) : "—"}</div></div>
        <div class="cell"><div class="k">Investment</div><div class="v">${fmtInvestment(p.investment_usd)}</div></div>
        <div class="cell"><div class="k">${p.status==="operational"?"Energised":"Target year"}</div><div class="v">${escapeHtml(p.year || "—")}</div></div>
      `;
    }

    const [lng, lat] = f.geometry.coordinates;
    const coords = `${Math.abs(lat).toFixed(2)}°${lat>=0?"N":"S"}, ${Math.abs(lng).toFixed(2)}°${lng>=0?"E":"W"}`;

    $("#popupBadge").innerHTML = `<span class="badge ${badgeClass}"><span class="dot" style="background:${ badgeClass==='power'?FUEL_COLOR[p.fuel_type]||FUEL_COLOR.solar:badgeClass==='industrial'?INDUSTRIAL_COLOR:badgeClass==='digital'?(p.category==='cable_landing'?CABLE_COLOR:DIGITAL_COLOR):GRID_COLOR }"></span>${badgeLabel}</span>`;

    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${escapeHtml(p.region || "")} · ${coords}</div>
      <span class="status-pill ${p.status || 'operational'}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">${stats}</div>
      <div class="source-row">
        <span class="src">${escapeHtml(p.source || "—")}</span>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ""}
      </div>
      <details>
        <summary>Raw data</summary>
        <pre class="raw-json">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
      </details>
      <div class="pop-actions">
        <a href="mailto:reda.tahiri@example.com?subject=${encodeURIComponent('MoroccoMap — correction: '+p.name)}&body=${encodeURIComponent('Feature id: '+p.id+'\n\nSuggested correction:\n')}">Report an error</a>
        ${p.source_url ? `<a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener">Primary source ↗</a>` : ""}
      </div>
    `;
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function openLinePopup(f){
    const p = f.properties || {};
    $("#popupBadge").innerHTML = `<span class="badge grid"><span class="dot" style="background:${GRID_COLOR}"></span>Transmission line</span>`;
    $("#popupBody").innerHTML = `
      <h1 class="pop-title">${escapeHtml(p.name)}</h1>
      <div class="pop-sub">${p.voltage_kv} kV</div>
      <span class="status-pill ${p.status || 'operational'}"><span class="dot"></span>${escapeHtml(p.status || "operational")}</span>
      <div class="stat-grid">
        <div class="cell"><div class="k">Voltage</div><div class="v">${p.voltage_kv} kV</div></div>
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
        <a href="mailto:reda.tahiri@example.com?subject=${encodeURIComponent('MoroccoMap — correction: '+p.name)}">Report an error</a>
      </div>
    `;
    popup.classList.add("open");
    popup.setAttribute("aria-hidden","false");
  }

  function closePopup(){
    popup.classList.remove("open");
    popup.setAttribute("aria-hidden","true");
  }
  $("#popupClose").addEventListener("click", closePopup);

  // ---------- Country switch ----------
  countrySelect.addEventListener("change", async (e)=>{
    const key = e.target.value;
    if(!ENABLED.includes(key)) return;
    currentCountry = key;
    const c = COUNTRIES[key];
    await loadAllData(key);
    renderLayerList(key);
    renderKPIs(key);
    renderMethodologySources(key);
    if(map){
      // tear down existing markers
      Object.values(markersByLayer).forEach(arr => arr.forEach(m=>m.remove()));
      markersByLayer = {};
      map.flyTo({ center: c.center, zoom: c.zoom, speed: 0.8, curve: 1.4 });
      buildMapLayers(key);
    }
  });

  // ---------- Go ----------
  boot();
})();
