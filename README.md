# Energy x Digital Nexus

Morocco-focused workspace for the energy and digital infrastructure map.

## Project Layout

- Main app source: `index.html`
- Publish copies:
  - `morocco-grid.html`
  - `morocco-grid/public/index.html`
- Transmission data:
  - `existingtransmissionlines.geojson`
  - `futuretransmissionlines.geojson`

## Key Files

- `CONTEXT.md`: project context
- `deploy.sh`: sync publish files
- `scripts/build-transmission-geojson.py`: rebuild transmission GeoJSON from shapefiles

## Working Rule

Edit `index.html`, then run `./deploy.sh` to sync the published files.
