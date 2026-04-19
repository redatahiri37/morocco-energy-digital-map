// Adding a country to the platform:
//   1. Drop GeoJSON files into  ./data/<key>/
//   2. Add an entry below with center, zoom, label, dataPath
//   3. (optional) add the country key to `enabled` to surface it in the UI
//
// No other code change is required — app.js reads this file at boot.

window.COUNTRIES = {
  morocco: {
    label: "Morocco",
    iso:   "MA",
    center: [-6.3, 31.8],
    zoom:   5.5,
    bounds: [[-17.5, 20.5], [-0.8, 36.35]],
    dataPath: "./data/morocco/",
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "points",
        title: "Power generation",
        source: "Global Energy Monitor · ONEE · operator disclosures",
        sourceUrl: "https://globalenergymonitor.org/projects/global-power-plant-tracker/",
        updated: "2025-11" },
      { id: "transmission-lines", file: "transmission-lines.geojson", kind: "lines",
        title: "Transmission network (HV / EHV)",
        source: "World Bank Group — Morocco Power Sector Masterplan (2018, ≥150 kV)",
        sourceUrl: "https://datacatalog.worldbank.org/",
        updated: "2018-06" },
      { id: "grid-lines", file: "grid-lines.geojson", kind: "lines",
        title: "Interconnectors & strategic corridors",
        source: "REE · Xlinks · ONEE · editorial overlay on OpenInfraMap",
        sourceUrl: "https://openinframap.org/",
        updated: "2026-04" },
      { id: "industrial", file: "industrial.geojson", kind: "points",
        title: "Industrial consumers",
        source: "OCP · Holcim · SONASID public disclosures",
        sourceUrl: "https://www.ocpgroup.ma/",
        updated: "2025-09" },
      { id: "digital", file: "digital.geojson", kind: "points",
        title: "Digital infrastructure",
        source: "Datacentermap.com · OSM · press releases",
        sourceUrl: "https://www.datacentermap.com/morocco/",
        updated: "2026-03" }
    ]
  },

  // Reserved — no data in v1, will no-op until GeoJSON files are dropped in.
  egypt:   { label: "Egypt",   iso: "EG", center: [30.8, 26.8], zoom: 5.2,
             dataPath: "./data/egypt/",   layers: [], placeholder: true },
  senegal: { label: "Senegal", iso: "SN", center: [-14.4, 14.5], zoom: 6.2,
             dataPath: "./data/senegal/", layers: [], placeholder: true },
  namibia: { label: "Namibia", iso: "NA", center: [17.5, -22.5], zoom: 5.2,
             dataPath: "./data/namibia/", layers: [], placeholder: true }
};

window.COUNTRIES_ENABLED = ["morocco"];
