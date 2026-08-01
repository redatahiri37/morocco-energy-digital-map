// Info panel rendering — driven by feature properties from GeoJSON.

const TYPE_MAP = {
  solar_csp:    { label: 'Solar — CSP',         cls: 'gen' },
  solar_pv:     { label: 'Solar — PV',          cls: 'gen' },
  wind:         { label: 'Wind Generation',     cls: 'gen' },
  thermal:      { label: 'Thermal Generation',  cls: 'gen' },
  hydro:        { label: 'Hydro / Storage',     cls: 'gen' },
  transmission: { label: 'Transmission',        cls: 'tx'  },
  cable:        { label: 'Submarine Cable',     cls: 'cable' },
  cable_route:  { label: 'Cable Route',         cls: 'cable' },
  datacenter:   { label: 'Data Center',         cls: 'dc'  },
  phosphates:   { label: 'Industrial — OCP',    cls: 'ind' },
  cement:       { label: 'Industrial — Cement', cls: 'ind' },
  zone:         { label: 'RE Resource Zone',    cls: 'zone' },
};

const STATUS_MAP = {
  operational:       { cls: 'operational',  dot: '#4ade80' },
  under_construction:{ cls: 'construction', dot: '#d19900' },
  announced:         { cls: 'announced',    dot: '#c084fc' },
  planned:           { cls: 'planned',      dot: '#3b82f6' },
  active:            { cls: 'operational',  dot: '#4ade80' },
};

export function initInfoPanel() {
  document.getElementById('ip-close-btn')
    .addEventListener('click', closeInfo);
}

export function openInfo(props) {
  const panel = document.getElementById('info-panel');

  const subsector = props.subsector || props.sector || 'generation';
  const tm = TYPE_MAP[subsector] || { label: subsector, cls: 'gen' };
  setEl('ip-badge', tm.label, 'ip-badge ' + tm.cls);
  setEl('ip-name', props.name || '');

  const st = (props.status || '').toLowerCase().replace(/\s+/g, '_');
  const sm = STATUS_MAP[st] || STATUS_MAP.operational;
  const statusEl = document.getElementById('ip-status');
  statusEl.className = 'ip-status ' + sm.cls;
  statusEl.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${sm.dot};display:inline-block"></span> ${props.status || ''}`;

  let cells = '';
  if (props.capacity_mw)         cells += cell('Capacity', props.capacity_mw + ' MW');
  if (props.estimated_demand_mw) cells += cell('Est. Demand', '~' + props.estimated_demand_mw + ' MW');
  if (props.own_generation_mw)   cells += cell('Captive Gen.', props.own_generation_mw + ' MW');
  if (props.voltage)             cells += cell('Voltage', props.voltage);
  if (props.technology)          cells += cell('Technology', props.technology);
  if (props.operator)            cells += cell('Operator', props.operator);
  if (props.investment_usd)      cells += cell('Investment', '$' + fmtM(props.investment_usd));
  if (props.grid_connection_kv)  cells += cell('Grid', props.grid_connection_kv + ' kV');
  if (props.capacity_mt_yr)      cells += cell('Cement Cap.', props.capacity_mt_yr + ' Mt/yr');
  if (props.year_operational) {
    const lbl = ['operational','active'].includes(st) ? 'Commissioned' : 'Target year';
    cells += cell(lbl, props.year_operational);
  }
  document.getElementById('ip-grid').innerHTML = cells;

  // Confidence notice
  const confEl = document.getElementById('ip-confidence');
  if (confEl) {
    const conf = props.coord_confidence;
    if (conf === 'approximate') {
      confEl.textContent = '± Location approximate';
      confEl.style.display = 'inline-block';
    } else if (conf === 'centroid') {
      confEl.textContent = '⊙ Centroid only — site not precisely located';
      confEl.style.display = 'inline-block';
    } else {
      confEl.style.display = 'none';
    }
  }

  document.getElementById('ip-desc').textContent = props.description || '';
  const srcEl = document.getElementById('ip-src');
  srcEl.innerHTML = props.source
    ? `<span class="ip-src-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg><span>${props.source}</span></span>`
    : '';

  panel.classList.add('open');
}

export function closeInfo() {
  document.getElementById('info-panel').classList.remove('open');
}

function setEl(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (cls !== undefined) el.className = cls;
}

function cell(lbl, val) {
  return `<div class="ip-cell"><div class="ip-cell-lbl">${lbl}</div><div class="ip-cell-val">${val}</div></div>`;
}

function fmtM(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toLocaleString();
}
