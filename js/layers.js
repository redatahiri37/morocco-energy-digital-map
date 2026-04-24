// Layer registry — single source of truth.
// Adding a new dataset = one entry here + one GeoJSON file in data/.

export const LAYER_REGISTRY = [

  // ── Energy — Generation ──────────────────────────
  {
    id: 'gen_solar',
    label: 'Solar Generation',
    group: 'energy',
    groupLabel: 'Energy — Generation',
    file: 'data/energy/gen_solar.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-solar',
    color: '#d19900',
    defaultOn: true,
  },
  {
    id: 'gen_wind',
    label: 'Wind Generation',
    group: 'energy',
    file: 'data/energy/gen_wind.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-wind',
    color: '#10B981',
    defaultOn: true,
  },
  {
    id: 'gen_thermal',
    label: 'Thermal Generation',
    group: 'energy',
    file: 'data/energy/gen_thermal.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-thermal',
    color: '#C2783A',
    defaultOn: true,
  },
  {
    id: 'gen_hydro',
    label: 'Hydro / Storage',
    group: 'energy',
    file: 'data/energy/gen_hydro.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-hydro',
    color: '#38BDF8',
    defaultOn: true,
  },

  // ── Energy — Grid ────────────────────────────────
  {
    id: 'grid_hv',
    label: 'Transmission Grid',
    group: 'grid',
    groupLabel: 'Energy — Grid',
    file: 'data/energy/grid_hv.geojson',
    type: 'line',
    color: '#3b82f6',
    defaultOn: true,
    splitByStatus: true,  // renders operational and planned as separate layers
    paintOperational: {
      'line-color': ['match', ['get', 'voltage'], 'HVDC', '#A78BFA', '#60A5FA'],
      'line-width': ['match', ['get', 'voltage'], 'HVDC', 3.5, 2.5],
      'line-opacity': 0.9,
    },
    paintOperationalLight: {
      'line-color': ['match', ['get', 'voltage'], 'HVDC', '#6D28D9', '#1D4ED8'],
      'line-width': ['match', ['get', 'voltage'], 'HVDC', 3.5, 2.5],
      'line-opacity': 1.0,
    },
    paintPlanned: {
      'line-color': ['match', ['get', 'voltage'], 'HVDC', '#A78BFA', '#60A5FA'],
      'line-width': ['match', ['get', 'voltage'], 'HVDC', 2, 1.5],
      'line-opacity': 0.55,
      'line-dasharray': [8, 5],
    },
    paintPlannedLight: {
      'line-color': ['match', ['get', 'voltage'], 'HVDC', '#6D28D9', '#1D4ED8'],
      'line-width': ['match', ['get', 'voltage'], 'HVDC', 2, 1.5],
      'line-opacity': 0.6,
      'line-dasharray': [8, 5],
    },
  },
  {
    id: 're_zones',
    label: 'RE Resource Zones',
    group: 'grid',
    file: 'data/energy/re_zones.geojson',
    type: 'fill',
    color: '#d19900',
    defaultOn: true,
  },

  // ── Industrial Demand ────────────────────────────
  {
    id: 'ind_ocp',
    label: 'OCP Phosphate Sites',
    group: 'industrial',
    groupLabel: 'Industrial Demand',
    file: 'data/industrial/ind_ocp.geojson',
    type: 'point',
    markerClass: 'mg-ind mg-ocp',
    color: '#f97316',
    defaultOn: true,
  },
  {
    id: 'ind_cement',
    label: 'Cement Plants',
    group: 'industrial',
    file: 'data/industrial/ind_cement.geojson',
    type: 'point',
    markerClass: 'mg-ind mg-cement',
    color: '#818CF8',
    defaultOn: false,
  },

  // ── Digital ──────────────────────────────────────
  {
    id: 'dig_datacenter',
    label: 'Data Center Pipeline',
    group: 'digital',
    groupLabel: 'Digital',
    file: 'data/digital/dig_datacenter.geojson',
    type: 'point',
    markerClass: 'mg-dc',
    color: '#C084FC',
    defaultOn: true,
  },
  {
    id: 'dig_telecom',
    label: 'Submarine Cables',
    group: 'digital',
    file: 'data/digital/dig_telecom.geojson',
    type: 'mixed',  // points (landings) + lines (routes) in same file
    markerClass: 'mg-cable',
    color: '#2DD4BF',
    lineColor: '#2DD4BF',
    defaultOn: true,
    paintLine: {
      'line-color': '#2DD4BF',
      'line-width': 1.5,
      'line-opacity': 0.55,
      'line-dasharray': [5, 4],
    },
  },
];
