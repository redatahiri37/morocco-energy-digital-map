# Energy x Digital Nexus — Emerging Countries (Morocco focus)

## Goal
Two-part platform at the intersection of energy and digital 
infrastructure in emerging markets:
1. Interactive infrastructure map (web app)
2. Thought leadership blog

## Platform 1 — Infrastructure Map
Interactive web app displaying Morocco's infrastructure 
as toggleable map layers:
- Energy: power generation, grid, renewables (ONEE data)
- Industrial consumers: phosphates (OCP), cement, steel
- Digital: data centers, telecom nodes
Design reference: enersite.app

## Platform 2 — Blog
Platform: **Substack** (free, migrate to Astro later if needed)
Short analytical posts on:
- Morocco/MEA renewable export strategy
- Power constraints for hyperscalers in MEA
- Industrial demand response & grid flexibility
- North Africa's role in Europe's green supply chain

## Stack
HTML/JS/React + **Mapbox GL JS** + GeoJSON
(Deck.gl deferred — only if large datasets or 3D needed later)

## Data Sources
ONEE, GEM, OpenStreetMap, Datacentermap.com

## My Profile
Energy & digital infrastructure expert, Paris-based,
MEA region focus. High technical fluency on energy systems,
grid economics, infrastructure finance.

## Current Task
Write first Substack post — Morocco renewable export strategy

## Decisions Log
- 2026-04-11: Map stack → Mapbox GL JS (simpler, better docs, used by enersite.app)
- 2026-04-11: Blog platform → Substack (free tier, existing account, zero setup)
- 2026-04-11: Sequencing → Blog first (faster to publish, builds audience before map launch)

## Open Questions
- [ ] First blog post angle — Morocco renewable export strategy (draft needed)
- [ ] Mapbox free tier limits — check token usage for public map
- [ ] Substack vs custom domain for SEO long-term

## Last Session
[paste session summary here after each session]