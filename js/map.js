import { LAYER_REGISTRY } from './layers.js';
import { initInfoPanel, openInfo, closeInfo } from './popups.js';

const MAPBOX_TOKEN = 'MAPBOX_TOKEN_REDACTED';

let map = null;
let mapLoaded = false;
let darkMode = true;
let chartInstance = null;

const layerState = {};    // id → bool (parent layers)
const sublayerState = {}; // id → bool (sublayers)
const loadedData = {};    // id → GeoJSON FeatureCollection
const htmlMarkers = [];   // Mapbox Marker instances

// ── State init ───────────────────────────────────
function initState() {
  LAYER_REGISTRY.forEach(l => {
    layerState[l.id] = l.defaultOn;
    if (l.sublayers) {
      l.sublayers.forEach(sl => {
        sublayerState[sl.id] = sl.defaultOn !== false;
      });
    }
  });
}

// ── Sidebar ──────────────────────────────────────
function buildSidebar() {
  const container = document.getElementById('layers-list');
  if (!container) return;

  const groups = {};
  LAYER_REGISTRY.forEach(l => {
    if (!groups[l.group]) groups[l.group] = { label: l.groupLabel || l.group, layers: [] };
    groups[l.group].layers.push(l);
  });

  container.innerHTML = '';
  Object.entries(groups).forEach(([groupKey, group]) => {
    // Create wrapper section with data-group
    const sec = document.createElement('div');
    sec.className = 'sec';
    sec.setAttribute('data-group', groupKey);

    const secLabel = document.createElement('div');
    secLabel.className = 'sec-label';
    secLabel.textContent = group.label;
    sec.appendChild(secLabel);

    group.layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'layer-toggle';
      row.setAttribute('data-group', layer.group);
      row.innerHTML = `
        <div class="lt-check ${layer.defaultOn ? 'on' : ''}" id="ck-${layer.id}" style="color:${layer.color}"></div>
        <div class="lt-dot" style="background:${layer.color}"></div>
        <span class="lt-name">${layer.label}</span>
        <span class="lt-count" id="ct-${layer.id}">—</span>
      `;
      row.addEventListener('click', () => toggleLayer(layer.id));
      sec.appendChild(row);

      // Render sublayers if present
      if (layer.sublayers) {
        const sublayerContainer = document.createElement('div');
        sublayerContainer.id = `sublayers-${layer.id}`;
        sublayerContainer.style.marginLeft = '18px';
        sublayerContainer.style.marginTop = '-8px';

        layer.sublayers.forEach(sl => {
          const slRow = document.createElement('div');
          slRow.className = 'layer-toggle';
          slRow.innerHTML = `
            <div class="lt-check ${sl.defaultOn !== false ? 'on' : ''}" id="ck-${sl.id}" style="color:${layer.color};width:11px;height:11px"></div>
            <div class="lt-dot" style="background:${layer.color};width:5px;height:5px;${!sl.defaultOn ? 'opacity:0.5' : ''}"></div>
            <span class="lt-name" style="font-size:11px">${sl.label}</span>
            <span class="lt-count" id="ct-${sl.id}" style="font-size:9px">—</span>
          `;
          slRow.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSublayer(sl.id);
          });
          sublayerContainer.appendChild(slRow);
        });

        sec.appendChild(sublayerContainer);
      }
    });

    // Append completed section to container
    container.appendChild(sec);
  });
}

function updateCount(layerId, count) {
  const el = document.getElementById(`ct-${layerId}`);
  if (el) el.textContent = count > 0 ? String(count) : '—';
}

// ── Token / map init ─────────────────────────────
window.hideTokenBar = () => document.getElementById('token-bar').classList.add('hidden');
window.showTokenBar = () => document.getElementById('token-bar').classList.remove('hidden');

window.applyToken = () => {
  const tk = document.getElementById('token-input').value.trim();
  if (!tk) { alert('Paste a valid Mapbox token.'); return; }
  mapboxgl.accessToken = tk;
  localStorage.setItem('mg-token', tk);
  window.hideTokenBar();
  initMap();
};

window.fitMorocco = () => {
  if (!map) return;
  map.flyTo({ center: [-6.0, 31.0], zoom: 5.2, duration: 1200 });
};

function initMap() {
  if (mapLoaded) return;
  const ph = document.getElementById('map-placeholder');
  try {
    map = new mapboxgl.Map({
      container: 'map',
      style: darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11',
      center: [-6.0, 31.0],
      zoom: 5.2,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', async () => {
      mapLoaded = true;
      ph.classList.add('hidden');
      document.getElementById('fit-btn').style.display = 'flex';
      await loadAllData();
      renderAllLayers();
    });
    map.on('click', e => {
      if (!e.originalEvent.target.closest('.mg-marker')) closeInfo();
    });
    map.on('error', e => {
      console.error(e);
      ph.classList.remove('hidden');
      window.showTokenBar();
    });
  } catch (err) {
    console.error(err);
    ph.classList.remove('hidden');
    window.showTokenBar();
  }
}

// ── Data loading ─────────────────────────────────
async function loadAllData() {
  await Promise.all(LAYER_REGISTRY.map(async layer => {
    try {
      const r = await fetch(layer.file);
      if (!r.ok) throw new Error(r.status);
      const fc = await r.json();
      loadedData[layer.id] = fc;
      const pts = fc.features.filter(f => f.geometry.type === 'Point').length;
      if (pts > 0) updateCount(layer.id, pts);
    } catch (e) {
      console.warn(`[layers] Could not load ${layer.file}:`, e.message);
      loadedData[layer.id] = { type: 'FeatureCollection', features: [] };
    }
  }));
}

// ── Render ───────────────────────────────────────
function renderAllLayers() {
  clearAll();
  LAYER_REGISTRY.forEach(layer => {
    if (!layerState[layer.id]) return;
    const fc = loadedData[layer.id];
    if (!fc) return;

    if (layer.type === 'point') {
      renderPointLayer(layer, fc);
    } else if (layer.type === 'line') {
      if (layer.sublayers) renderLineLayerSublayers(layer, fc);
      else if (layer.splitByStatus) renderLineLayerSplit(layer, fc);
      else renderLineLayer(layer, fc);
    } else if (layer.type === 'fill') {
      renderFillLayer(layer, fc);
    } else if (layer.type === 'mixed') {
      renderMixedLayer(layer, fc);
    }
  });
}

function clearAll() {
  htmlMarkers.forEach(m => m.remove());
  htmlMarkers.length = 0;

  LAYER_REGISTRY.forEach(layer => {
    const ids = [
      `${layer.id}-line`,
      `${layer.id}-line-op`,
      `${layer.id}-line-planned`,
      `${layer.id}-routes`,
    ];
    // Add sublayer IDs if present
    if (layer.sublayers) {
      layer.sublayers.forEach(sl => ids.push(sl.id));
    }
    ids.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });

    // Fill layers per feature
    if (layer.type === 'fill' && loadedData[layer.id]) {
      loadedData[layer.id].features.forEach(f => {
        const id = `${layer.id}-${f.properties.id}-fill`;
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(`${layer.id}-${f.properties.id}`)) {
          map.removeSource(`${layer.id}-${f.properties.id}`);
        }
      });
    }

    if (map.getSource(layer.id)) map.removeSource(layer.id);
    if (map.getSource(`${layer.id}-routes`)) map.removeSource(`${layer.id}-routes`);
  });
}

// Point layer — HTML markers
function renderPointLayer(layer, fc) {
  fc.features
    .filter(f => f.geometry.type === 'Point')
    .forEach(feat => {
      const props = feat.properties;
      const [lng, lat] = feat.geometry.coordinates;

      const el = document.createElement('div');
      el.className = 'mg-marker';

      const inner = document.createElement('div');
      inner.className = buildMarkerClass(layer, props);

      const tooltip = document.createElement('div');
      tooltip.className = 'mg-tooltip';
      let ttBody = `<b>${props.name}</b>`;
      if (props.capacity_mw)         ttBody += `<div class="tt-cap">${props.capacity_mw} MW</div>`;
      if (props.estimated_demand_mw) ttBody += `<div class="tt-cap">~${props.estimated_demand_mw} MW demand</div>`;
      tooltip.innerHTML = ttBody;

      el.appendChild(inner);
      el.appendChild(tooltip);
      el.addEventListener('click', e => { e.stopPropagation(); openInfo(props); });

      const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
      htmlMarkers.push(m);
    });
}

function buildMarkerClass(layer, props) {
  let cls = layer.markerClass || 'mg-gen';
  if ((layer.group === 'energy') && props.capacity_mw >= 400) cls += ' large';
  if (layer.id === 'dig_datacenter' && ['announced', 'planned'].includes(props.status)) cls += ' pulse';
  if (props.coord_confidence === 'approximate') cls += ' conf-approx';
  if (props.coord_confidence === 'centroid') cls += ' conf-centroid';
  return cls;
}

// Line layer — single style
function renderLineLayer(layer, fc) {
  const lines = { type: 'FeatureCollection', features: fc.features.filter(f => f.geometry.type === 'LineString') };
  if (!lines.features.length) return;
  map.addSource(layer.id, { type: 'geojson', data: lines });
  const paint = { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.6, ...(layer.paint || {}) };
  map.addLayer({ id: `${layer.id}-line`, type: 'line', source: layer.id, paint });
  addLineInteraction(`${layer.id}-line`, fc.features);
}

// Line layer — split operational vs planned (handles line-dasharray limitation)
function renderLineLayerSplit(layer, fc) {
  const lines = fc.features.filter(f => f.geometry.type === 'LineString');
  if (!lines.length) return;

  const opFeats    = lines.filter(f => f.properties.status === 'operational');
  const planFeats  = lines.filter(f => f.properties.status === 'planned');

  if (!map.getSource(layer.id)) {
    map.addSource(layer.id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: lines },
    });
  }

  if (opFeats.length) {
    map.addLayer({
      id: `${layer.id}-line-op`, type: 'line', source: layer.id,
      filter: ['==', ['get', 'status'], 'operational'],
      paint: layer.paintOperational || { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.65 },
    });
    addLineInteraction(`${layer.id}-line-op`, lines);
  }

  if (planFeats.length) {
    map.addLayer({
      id: `${layer.id}-line-planned`, type: 'line', source: layer.id,
      filter: ['==', ['get', 'status'], 'planned'],
      paint: layer.paintPlanned || { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.4, 'line-dasharray': [6, 4] },
    });
    addLineInteraction(`${layer.id}-line-planned`, lines);
  }
}

// Line layer — sublayers with filters (e.g., voltage classes, grid types)
function renderLineLayerSublayers(layer, fc) {
  const lines = fc.features.filter(f => f.geometry.type === 'LineString');
  if (!lines.length) return;

  if (!map.getSource(layer.id)) {
    map.addSource(layer.id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: lines },
    });
  }

  layer.sublayers.forEach(sl => {
    if (!sublayerState[sl.id]) return; // Skip if sublayer is off

    const sublayerId = sl.id;
    const filter = sl.filter;

    if (map.getLayer(sublayerId)) return; // Already added

    map.addLayer({
      id: sublayerId,
      type: 'line',
      source: layer.id,
      filter: filter,
      paint: sl.paint || { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.65 },
    });

    addLineInteraction(sublayerId, lines);
  });
}

function addLineInteraction(layerId, features) {
  map.on('click', layerId, e => {
    const f = e.features[0];
    const original = features.find(x => x.properties.id === f.properties.id);
    if (original) openInfo(original.properties);
  });
  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
}

// Fill layer — one source+layer per feature (enables per-feature color)
function renderFillLayer(layer, fc) {
  fc.features.forEach(feat => {
    const srcId = `${layer.id}-${feat.properties.id}`;
    if (map.getSource(srcId)) return;
    map.addSource(srcId, { type: 'geojson', data: feat });
    map.addLayer({
      id: `${srcId}-fill`, type: 'fill', source: srcId,
      paint: { 'fill-color': feat.properties.color || layer.color, 'fill-opacity': 0.06 },
    });
    map.on('click', `${srcId}-fill`, () => openInfo(feat.properties));
  });
}

// Mixed layer — render Points as HTML markers, LineStrings as map layers
function renderMixedLayer(layer, fc) {
  const pointFc = { type: 'FeatureCollection', features: fc.features.filter(f => f.geometry.type === 'Point') };
  const lineFc  = { type: 'FeatureCollection', features: fc.features.filter(f => f.geometry.type === 'LineString') };

  renderPointLayer(layer, pointFc);

  if (lineFc.features.length) {
    const srcId = `${layer.id}-routes`;
    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: 'geojson', data: lineFc });
      map.addLayer({
        id: `${layer.id}-routes`, type: 'line', source: srcId,
        paint: layer.paintLine || { 'line-color': layer.lineColor || layer.color, 'line-width': 1.5, 'line-opacity': 0.25, 'line-dasharray': [4, 3] },
      });
    }
  }
}

// ── Toggle ───────────────────────────────────────
function toggleLayer(id) {
  layerState[id] = !layerState[id];
  const ck = document.getElementById(`ck-${id}`);
  if (ck) ck.classList.toggle('on', layerState[id]);
  if (!mapLoaded) return;
  renderAllLayers();
}

function toggleSublayer(id) {
  sublayerState[id] = !sublayerState[id];
  const ck = document.getElementById(`ck-${id}`);
  if (ck) ck.classList.toggle('on', sublayerState[id]);
  if (!mapLoaded) return;
  renderAllLayers();
}

// ── Theme ────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => {
  darkMode = !darkMode;
  document.body.classList.toggle('light', !darkMode);
  if (map && mapLoaded) {
    map.setStyle(darkMode ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11');
    map.once('style.load', renderAllLayers);
  }
  rebuildChart();
});

// ── Chart ────────────────────────────────────────
function rebuildChart() {
  const wrap = document.getElementById('mix-chart-wrap');
  const old  = document.getElementById('mix-chart');
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const canvas = document.createElement('canvas');
  canvas.id = 'mix-chart';
  wrap.replaceChild(canvas, old);

  const dark = darkMode;
  const tc = dark ? '#5a5850' : '#9a9890';
  const gc = dark ? '#2a2a2710' : '#ccc9c210';

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Coal', 'Gas', 'Solar', 'Wind', 'Hydro', 'Other'],
      datasets: [{
        data: [28, 21, 14, 13, 8, 16],
        backgroundColor: ['#6b7280', '#9ca3af', '#d19900', '#3b82f6', '#06b6d4', '#525252'],
        borderRadius: 3, barPercentage: .7,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: dark ? '#1a1a18' : '#f5f4f1',
          borderColor: dark ? '#2a2a27' : '#ccc9c2', borderWidth: 1,
          titleColor: dark ? '#f2f0ec' : '#1a1a18', bodyColor: dark ? '#c4c1b8' : '#3a3a36',
          titleFont: { size: 11 }, bodyFont: { size: 11 },
          callbacks: { label: c => c.parsed.x + '%' },
        },
      },
      scales: {
        x: { max: 35, grid: { color: gc }, ticks: { color: tc, font: { size: 9 }, callback: v => v + '%' } },
        y: { grid: { display: false }, ticks: { color: dark ? '#8a877e' : '#6a6860', font: { size: 10, weight: 500 } } },
      },
    },
  });
}

// ── Boot ─────────────────────────────────────────
document.getElementById('token-toggle').addEventListener('click', () => {
  document.getElementById('token-bar').classList.toggle('hidden');
});

initState();
buildSidebar();
initInfoPanel();
lucide.createIcons();

const tk = localStorage.getItem('mg-token') || MAPBOX_TOKEN;
document.getElementById('token-input').value = tk;
mapboxgl.accessToken = tk;
window.hideTokenBar();
initMap();
rebuildChart();
