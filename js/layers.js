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
    color: '#06b6d4',
    defaultOn: true,
  },
  {
    id: 'gen_thermal',
    label: 'Thermal Generation',
    group: 'energy',
    file: 'data/energy/gen_thermal.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-thermal',
    color: '#9ca3af',
    defaultOn: true,
  },
  {
    id: 'gen_hydro',
    label: 'Hydro / Storage',
    group: 'energy',
    file: 'data/energy/gen_hydro.geojson',
    type: 'point',
    markerClass: 'mg-gen mg-hydro',
    color: '#60a5fa',
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
    sublayers: [
      {
        id: 'grid_hv_backbone',
        label: '400kV Backbone',
        filter: ['==', ['get', 'grid_class'], 'backbone'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2.5,
          'line-opacity': 0.7,
        },
        defaultOn: true,
      },
      {
        id: 'grid_hv_regional',
        label: '225kV Corridors',
        filter: ['==', ['get', 'grid_class'], 'regional'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 1.8,
          'line-opacity': 0.55,
        },
        defaultOn: true,
      },
      {
        id: 'grid_hv_planned',
        label: 'Planned / Upgrades',
        filter: ['==', ['get', 'grid_class'], 'planned'],
        paint: {
          'line-color': '#06b6d4',
          'line-width': 2,
          'line-opacity': 0.45,
          'line-dasharray': [6, 4],
        },
        defaultOn: true,
      },
    ],
  },
  {
    id: 'grid_hv_real',
    label: 'ONEE Grid (Real)',
    group: 'grid',
    file: 'data/energy/grid_hv_real.geojson',
    type: 'line',
    color: '#3b82f6',
    defaultOn: false,
    sublayers: [
      {
        id: 'grid_hv_real_backbone',
        label: '400 kV Backbone',
        filter: ['==', ['get', 'grid_class'], 'backbone'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-opacity': 0.8,
        },
        defaultOn: true,
      },
      {
        id: 'grid_hv_real_regional',
        label: '225 / 150 kV',
        filter: ['==', ['get', 'grid_class'], 'regional'],
        paint: {
          'line-color': '#60a5fa',
          'line-width': 1.2,
          'line-opacity': 0.6,
        },
        defaultOn: true,
      },
      {
        id: 'grid_hv_real_distribution',
        label: '60 kV Distribution',
        filter: ['==', ['get', 'grid_class'], 'distribution'],
        paint: {
          'line-color': '#93c5fd',
          'line-width': 0.8,
          'line-opacity': 0.4,
        },
        defaultOn: false,
      },
    ],
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
    color: '#a78bfa',
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
    color: '#7a39bb',
    defaultOn: true,
  },
  {
    id: 'dig_telecom',
    label: 'Submarine Cables',
    group: 'digital',
    file: 'data/digital/dig_telecom.geojson',
    type: 'mixed',  // points (landings) + lines (routes) in same file
    markerClass: 'mg-cable',
    color: '#da7101',
    lineColor: '#da7101',
    defaultOn: true,
    paintLine: {
      'line-color': '#da7101',
      'line-width': 1.5,
      'line-opacity': 0.25,
      'line-dasharray': [4, 3],
    },
  },
];
