// Adding a country to the platform:
//   1. Drop GeoJSON files into  ./data/<key>/  (+ boundary.geojson, optional)
//   2. Add an entry below: label, iso, center, zoom, bounds, dataPath, layers
//   3. Add the country key to COUNTRIES_ENABLED to surface it in the UI
//   4. Run  node scripts/validate-countries.mjs  (CI runs it too)
//
// No code change is required — app.js reads this file at boot.
//
// Layer `kind` picks the renderer (see DATA_SCHEMA.md for the fields each
// one reads):
//   power       power plants — clustered, coloured by fuel_type
//   grid        transmission lines — styled by status and voltage_kv
//   industrial  industrial consumers — coloured by palette.sectors
//   digital     data centres + cable landings — coloured by palette.providers
//   water       water transfers (lines), dams and desalination plants (points);
//               `category` per feature: transfer / dam / desalination
//   oim         OpenInfraMap live grid tiles (worldwide; file: null)
//   oim-plants  OpenInfraMap live OSM power plants (worldwide; file: null).
//               Not counted in the KPIs; `visible: false` starts it unticked.
// Layer ids must be unique within a country; map ids derive from them.
//
// Optional per country:
//   operators:      [{ key, short }] — short operator names for tooltips; `key`
//                   is `operator` as in the data. (Layer colours are not per
//                   country: app.js LAYER_COLORS.)
//   boundary:       { source, sourceUrl, note } — provenance of boundary.geojson
//   mix:            national electricity mix file in dataPath, built from Ember
//                   by scripts/build-country-mix.py (the "Electricity mix" panel)
//   snapshotSource: short credit for the plant figures in the "Mapped assets" tiles
//   snapshotSourceFr: the same in French, when it has words to translate
//
// Every country has `labelFr` and every layer `titleFr`: the French page
// (energy.wattu.org/fr/) shows them. Sources stay as cited.
//   credits:        data credits in the footer, e.g. "GEM · ONEE · Datacentermap"
//   demand:         { source, sourceUrl, figures: [{ label, labelFr, value, unit }] } —
//                   dated national figures, tiles under the KPIs
//   lenses:         [{ id, label, labelFr, layers?, fuel?, note?, noteFr? }] — the
//                   Energy / Water / Nexus switch above the layers; `layers`
//                   lists the ids switched on (none: each layer's default)
//   liveFlow:       { path, features, partner, partnerFr, source, sourceUrl } — live flow
//                   on the interconnectors whose ids are in `features`, read
//                   from the Wattu Worker at `path`

// Layers for countries built from open data (see the entries below).
const GPPD_COUNTRY_LAYERS = [
  { id: "power-plants", file: "power-plants.geojson", kind: "power",
    title: "Power plants", titleFr: "Centrales électriques",
    source: "WRI Global Power Plant Database v1.3 (2021, CC BY 4.0); unmaintained since 2022, so recent plants are missing",
    sourceUrl: "https://datasets.wri.org/dataset/globalpowerplantdatabase",
    updated: "2021" },
  { id: "datacentres", file: "datacentres.geojson", kind: "digital",
    title: "Data centres", titleFr: "Data centers",
    source: "PeeringDB facility registry (operator-maintained); colocation sites only, no MW figures",
    sourceUrl: "https://www.peeringdb.com/",
    updated: "2026-09" },
  { id: "osm-plants", file: null, kind: "oim-plants",
    title: "OSM power plants", titleFr: "Centrales OSM",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
    sourceUrl: "https://openinframap.org/",
    updated: "live" },
  { id: "oim-grid", file: null, kind: "oim",
    title: "Transmission grid", titleFr: "Réseau de transport",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
    sourceUrl: "https://openinframap.org/",
    updated: "live" }
];

// Layers for European countries built from powerplantmatching (see
// scripts/build-power-plants-ppm.py). Data centres wait for a PeeringDB export.
const PPM_COUNTRY_LAYERS = [
  { id: "power-plants", file: "power-plants.geojson", kind: "power",
    title: "Power plants ≥ 10 MW", titleFr: "Centrales ≥ 10 MW",
    source: "powerplantmatching v0.9.0 (PyPSA / KIT, 2026-10-03, CC BY 4.0): ENTSO-E, JRC, Open Power System Data, Global Energy Monitor and others reconciled; units on one site merged; plants under 10 MW, rooftop solar included, left out; closures as dated by the dataset",
    sourceUrl: "https://github.com/PyPSA/powerplantmatching",
    updated: "2026-10" },
  { id: "osm-plants", file: null, kind: "oim-plants",
    title: "OSM power plants", titleFr: "Centrales OSM",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
    sourceUrl: "https://openinframap.org/",
    updated: "live", visible: false },
  { id: "oim-grid", file: null, kind: "oim",
    title: "Transmission grid", titleFr: "Réseau de transport",
    source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
    sourceUrl: "https://openinframap.org/",
    updated: "live" }
];

window.COUNTRIES = {
  morocco: {
    label: "Morocco", labelFr: "Maroc",
    iso:   "MA",
    center: [-6.3, 31.8],
    zoom:   5.5,
    bounds: [[-17.5, 20.5], [-0.8, 36.35]],
    dataPath: "./data/morocco/",
    mix:      "mix.json",
    snapshotSource: "GEM · ONEE · operator disclosures, 2026-04",
    snapshotSourceFr: "GEM · ONEE · déclarations des opérateurs, 2026-04",
    credits: "GEM · ONEE · Datacentermap · REE",
    // National demand: dated figures, not computed from the layers.
    demand: {
      source: "ONEE board of directors, 27 Jul 2026, reported by TelQuel",
      sourceUrl: "https://telquel.ma/instant-t/2026/07/28/electricite-le-maroc-enregistre-un-nouveau-record-historique-de-consommation_2001082",
      figures: [
        { label: "Record peak · 2026", labelFr: "Pointe record · 2026", value: 8.4, unit: "GW" }
      ]
    },
    // Live flow on the Spain–Morocco link (both cables together), from REE
    // through the Wattu Worker (solar/proxy/flow.js).
    liveFlow: {
      path: "/flow/es-ma",
      features: ["interconnector-es-ma-1", "interconnector-es-ma-2"],
      partner: "Spain", partnerFr: "Espagne",
      source: "REE (Red Eléctrica), real-time exchange data",
      sourceUrl: "https://www.ree.es/en/activities/operation-of-the-electricity-system/international-interconnections"
    },
    // Read by Site check only (not drawn): national 150–400 kV lines for
    // distance-to-grid anywhere in the country, independent of loaded tiles.
    siteGrid: { file: "transmission-lines.geojson",
                source: "World Bank Group masterplan 2018",
                sourceUrl: "https://datacatalog.worldbank.org/",
                updated: "2018" },
    boundary: { source: "Natural Earth 1:50m Admin 0, dissolved",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "Morocco and the Southern Provinces drawn as one territory" },
    operators: [
      { key:"N+ONE", short:"N+ONE" },
      { key:"inwi", short:"inwi" },
      { key:"Maroc Telecom (IAM)", short:"Maroc Telecom" },
      { key:"Naver / Nvidia consortium", short:"Naver × Nvidia" },
      { key:"Iozera", short:"Iozera" },
      { key:"Government of Morocco", short:"Government" },
      { key:"ADD (Agence de Développement du Digital)", short:"ADD" }
    ],
    // Perspectives above the layer list. Energy keeps each layer's default;
    // Water shows the water layers with the grid and the hydro plants;
    // Nexus shows both systems together.
    lenses: [
      { id: "energy", label: "Energy", labelFr: "Énergie" },
      { id: "water", label: "Water", labelFr: "Eau", fuel: "hydro",
        layers: ["water-transfers", "dams", "desalination", "power-plants", "oim-grid"],
        note: "Water highways, new dams and desalination, with the grid and the hydro plants. Transfers and desalination are electrical loads.",
        noteFr: "Autoroutes de l'eau, nouveaux barrages et dessalement, avec le réseau et les centrales hydrauliques. Transferts et dessalement sont des charges électriques." },
      { id: "nexus", label: "Nexus", labelFr: "Nexus",
        layers: ["power-plants", "oim-grid", "interconnectors", "planned-corridors", "water-transfers", "dams", "desalination", "industrial", "digital", "datacentres"],
        note: "Energy, water, industry and data centres together: where new loads meet the grid.",
        noteFr: "Énergie, eau, industrie et data centers ensemble : là où les nouvelles charges rencontrent le réseau." }
    ],
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "power",
        title: "Power plants", titleFr: "Centrales électriques",
        source: "Global Energy Monitor · ONEE · operator disclosures",
        sourceUrl: "https://globalenergymonitor.org/projects/global-power-plant-tracker/",
        updated: "2026-04" },
      { id: "oim-grid", file: null, kind: "oim",
        title: "Transmission grid", titleFr: "Réseau de transport",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "osm-plants", file: null, kind: "oim-plants", visible: false,
        title: "OSM power plants", titleFr: "Centrales OSM",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "interconnectors", file: "interconnectors.geojson", kind: "grid",
        title: "Interconnectors", titleFr: "Interconnexions",
        source: "REE · ONEE · editorial overlay on OpenInfraMap",
        sourceUrl: "https://openinframap.org/",
        updated: "2026-04" },
      { id: "planned-corridors", file: "planned-corridors.geojson", kind: "grid",
        title: "Planned corridors", titleFr: "Corridors prévus",
        source: "Xlinks · MIICEN · World Bank Group 2018 masterplan",
        sourceUrl: "https://datacatalog.worldbank.org/",
        updated: "2026-04" },
      // Water–energy nexus: inter-basin transfers, new dams, desalination.
      { id: "water-transfers", file: "water-transfers.geojson", kind: "water", visible: false,
        title: "Water highways", titleFr: "Autoroutes de l'eau",
        source: "Ministry of Equipment and Water and ONEE figures as reported by Le Matin, Médias24, TelQuel, L'Économiste; routes schematic",
        sourceUrl: "https://telquel.ma/2026/03/31/autoroute-de-leau-ce-que-le-cahier-des-charges-revele-de-la-phase-ii-du-projet_1981667",
        updated: "2026-11" },
      { id: "dams", file: "dams.geojson", kind: "water", visible: false,
        title: "New dams (2020–2027 programme)", titleFr: "Nouveaux barrages (programme 2020–2027)",
        source: "Ministry of Equipment and Water figures as reported by Le360, Médias24, Hespress; positions OpenStreetMap or commune (approximate)",
        sourceUrl: "https://fr.le360.ma/economie/un-stockage-supplementaire-de-49-milliards-de-metres-cubes-deau-voici-ce-que-lon-sait-sur-les_HOQ2O6GTKRAP5DX7TPON67EHAA/",
        updated: "2026-11" },
      { id: "desalination", file: "desalination.geojson", kind: "water", visible: false,
        title: "Desalination plants", titleFr: "Stations de dessalement",
        source: "ONEE · OCP Green Water · press (LesEco, Le360, Le Desk); positions OpenStreetMap or site (approximate)",
        sourceUrl: "https://www.fedenerg.ma/2026/07/28/onee-mise-en-service-des-ouvrages-400-kv-destines-a-lalimentation-electrique-de-la-station-de-dessalement-de-la-region-casablanca-settat/",
        updated: "2026-11" },
      { id: "industrial", file: "industrial.geojson", kind: "industrial",
        title: "Industry", titleFr: "Industrie",
        source: "OCP · Holcim · SONASID · Renault · public disclosures",
        sourceUrl: "https://www.ocpgroup.ma/",
        updated: "2026-04" },
      { id: "digital", file: "digital.geojson", kind: "digital",
        title: "Data centres & cables", titleFr: "Data centers et câbles",
        source: "Datacentermap.com · OSM · press releases",
        sourceUrl: "https://www.datacentermap.com/morocco/",
        updated: "2026-03" },
      // PeeringDB sites not already in the curated layer above (same
      // operator within 15 km is dropped by the build script).
      { id: "datacentres", file: "datacentres.geojson", kind: "digital",
        title: "More colocation sites (PeeringDB)", titleFr: "Autres sites de colocation (PeeringDB)",
        source: "PeeringDB facility registry (operator-maintained); no MW figures",
        sourceUrl: "https://www.peeringdb.com/",
        updated: "2026-09" }
    ]
  },

  // Reserved — no data in v1, will no-op until GeoJSON files are dropped in.
  // Built by scripts/build-country-open-data.py: Natural Earth outline and
  // WRI's Global Power Plant Database (v1.3, 2021, unmaintained), each plant
  // checked against the outline. Data centres are not mapped yet.
  "cote-divoire": {
    label: "C\u00f4te d'Ivoire", labelFr: "C\u00f4te d'Ivoire",
    iso:   "CI",
    center: [-5.55, 7.54],
    zoom:   6.3,
    bounds: [[-8.9, 4.1], [-2.3, 11.0]],
    dataPath: "./data/cote-divoire/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  egypt: {
    label: "Egypt", labelFr: "Égypte",
    iso:   "EG",
    center: [30.79, 26.82],
    zoom:   5.3,
    bounds: [[24.5, 21.7], [37.1, 31.9]],
    dataPath: "./data/egypt/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries: the Halaib Triangle is drawn as administered by Egypt, Bir Tawil is not included" },
    layers: GPPD_COUNTRY_LAYERS
  },
  ethiopia: {
    label: "Ethiopia", labelFr: "Éthiopie",
    iso:   "ET",
    center: [40.49, 9.15],
    zoom:   5.4,
    bounds: [[32.7, 3.2], [48.2, 15.1]],
    dataPath: "./data/ethiopia/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  ghana: {
    label: "Ghana", labelFr: "Ghana",
    iso:   "GH",
    center: [-1.03, 7.96],
    zoom:   6.2,
    bounds: [[-3.5, 4.5], [1.4, 11.4]],
    dataPath: "./data/ghana/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  kenya: {
    label: "Kenya", labelFr: "Kenya",
    iso:   "KE",
    center: [37.89, 0.4],
    zoom:   5.6,
    bounds: [[33.6, -4.9], [42.1, 5.7]],
    dataPath: "./data/kenya/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  nigeria: {
    label: "Nigeria", labelFr: "Nigeria",
    iso:   "NG",
    center: [8.66, 9.08],
    zoom:   5.7,
    bounds: [[2.4, 4.0], [14.9, 14.1]],
    dataPath: "./data/nigeria/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  rwanda: {
    label: "Rwanda", labelFr: "Rwanda",
    iso:   "RW",
    center: [29.87, -1.94],
    zoom:   8.0,
    bounds: [[28.6, -3.1], [31.1, -0.8]],
    dataPath: "./data/rwanda/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries" },
    layers: GPPD_COUNTRY_LAYERS
  },
  "south-africa": {
    label: "South Africa", labelFr: "Afrique du Sud",
    iso:   "ZA",
    center: [24.67, -28.47],
    zoom:   4.9,
    bounds: [[16.2, -35.0], [33.1, -21.9]],
    dataPath: "./data/south-africa/",
    mix:      "mix.json",
    snapshotSource: "WRI GPPD 2021",
    credits: "WRI Global Power Plant Database (CC BY 4.0) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; de facto boundaries; Prince Edward Islands omitted" },
    layers: GPPD_COUNTRY_LAYERS
  },

  // Power plants are an owner-supplied list, marked unverified per feature
  // until each is checked against a primary source. Industry and data
  // centres are not mapped yet.
  senegal: {
    label: "Senegal", labelFr: "Sénégal",
    iso:   "SN",
    center: [-14.4, 14.5],
    zoom:   6.2,
    bounds: [[-17.6, 12.3], [-11.3, 16.7]],
    dataPath: "./data/senegal/",
    mix:      "mix.json",
    snapshotSource: "owner list, unverified",
    snapshotSourceFr: "liste du propriétaire, non vérifiée",
    credits: "owner-supplied plant list (unverified) · PeeringDB",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain" },
    layers: [
      { id: "power-plants", file: "power-plants.geojson", kind: "power",
        title: "Power plants", titleFr: "Centrales électriques",
        source: "Owner-supplied list (compiled with ChatGPT), not yet checked against primary sources",
        sourceUrl: "https://github.com/redatahiri37/morocco-energy-digital-map/blob/main/docs/data/senegal/power-plants.geojson",
        updated: "2026-09" },
      { id: "datacentres", file: "datacentres.geojson", kind: "digital",
        title: "Data centres", titleFr: "Data centers",
        source: "PeeringDB facility registry (operator-maintained); colocation sites only, no MW figures",
        sourceUrl: "https://www.peeringdb.com/",
        updated: "2026-09" },
      { id: "osm-plants", file: null, kind: "oim-plants",
        title: "OSM power plants", titleFr: "Centrales OSM",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL); all plants from zoom 8, larger ones earlier",
        sourceUrl: "https://openinframap.org/",
        updated: "live" },
      { id: "oim-grid", file: null, kind: "oim",
        title: "Transmission grid", titleFr: "Réseau de transport",
        source: "OpenStreetMap contributors · OpenInfraMap (ODbL)",
        sourceUrl: "https://openinframap.org/",
        updated: "live" }
    ]
  },
  france: {
    label: "France", labelFr: "France",
    iso:   "FR",
    center: [2.4, 46.4],
    zoom:   5.4,
    bounds: [[-5.0, 41.1], [9.8, 51.3]],
    dataPath: "./data/france/",
    mix:      "mix.json",
    snapshotSource: "powerplantmatching 2026, ≥ 10 MW",
    credits: "powerplantmatching (CC BY 4.0)",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; metropolitan France and Corsica" },
    layers: PPM_COUNTRY_LAYERS
  },
  spain: {
    label: "Spain", labelFr: "Espagne",
    iso:   "ES",
    center: [-3.7, 40.2],
    zoom:   5.4,
    bounds: [[-18.4, 27.4], [4.6, 44.0]],
    dataPath: "./data/spain/",
    mix:      "mix.json",
    snapshotSource: "powerplantmatching 2026, ≥ 10 MW",
    credits: "powerplantmatching (CC BY 4.0)",
    boundary: { source: "Natural Earth 1:50m Admin 0",
                sourceUrl: "https://www.naturalearthdata.com/",
                note: "public domain; peninsula, Balearic and Canary Islands" },
    layers: PPM_COUNTRY_LAYERS
  },
  namibia: { label: "Namibia", labelFr: "Namibie", iso: "NA", center: [17.5, -22.5], zoom: 5.2,
             dataPath: "./data/namibia/", layers: [], placeholder: true }
};

window.COUNTRIES_ENABLED = ["morocco", "cote-divoire", "egypt", "ethiopia", "ghana",
  "kenya", "nigeria", "rwanda", "senegal", "south-africa", "france", "spain"];
