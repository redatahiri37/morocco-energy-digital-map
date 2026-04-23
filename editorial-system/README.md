# Editorial System — v0

Multi-agent editorial workflow for the Energy × Digital Nexus Substack.
Substack-primary, LinkedIn teaser, weekly cadence, human-in-loop at
the angle-approval stage.

## Start here
1. Read THESIS.md — the editorial view. **Edit this first.**
2. Read AGENTS.md — roles and file-based handoffs
3. Read CADENCE.md — the weekly rhythm
4. Read SOURCES.md — 5 approved sources

## Trigger a cycle (manual v0)
In Cowork, say:
- "Run the Scout" → Monday pass over SOURCES.md
- "Research signal [N]" → Tuesday deep dive on a picked signal
- "Draft this week's Substack" → Thursday writing pass
- "Weekly editorial meeting" → Chief Editor synthesis + email draft

## Folder map
```
editorial-system/
├── THESIS.md          ← editorial view (DRAFT — edit first)
├── AGENTS.md          ← agent roles + I/O contracts
├── SOURCES.md         ← 5 approved sources
├── CADENCE.md         ← weekly rhythm
├── editorial-log.md   ← decisions + meetings (append-only)
├── queue/
│   ├── raw-signals.md    ← Scout output
│   ├── briefings/        ← Researcher output
│   └── drafts/           ← Writer output
└── published/
    ├── substack/         ← final Substack posts (moved by Reda)
    └── linkedin/         ← final LinkedIn teasers
```

## What's intentionally NOT built yet
- Automation (scheduled-tasks MCP) — deferred until 3 manual cycles
  prove the rhythm works
- Email from Chief Editor to Reda — Gmail MCP disconnected in
  current session; plugs in later
- Performance feedback loop (which posts got engagement) — v2
- Archive search over past signals — v2

## Differences from the original prompt
- Substack primary (not LinkedIn) — aligned with CONTEXT.md
- Weekly (not bi-daily) — writer-rhythm, not newsroom-rhythm
- Reda approves angle on Wednesday (not draft on Friday) —
  editorial fingerprint on every post
- 5 sources (not 13) — signal over noise
- Explicit thesis at the top — constrains every downstream decision
