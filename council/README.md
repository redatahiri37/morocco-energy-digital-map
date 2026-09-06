# Council minutes and board

Two files, two jobs — do not conflate them:

- **[BOARD.md](./BOARD.md)** — the standing memory. Current state only: what's
  In Progress, what's Docketed per seat, what Shipped, what was Vetoed (and
  why), what's Blocked-structural, what's Iceboxed. **Mutable** — edited in
  place every sitting. Read this first, always. Governed by
  [COUNCIL.md](../COUNCIL.md) §8.
- **`YYYY-MM-DD.md`** (one file per day) — the journal. Each sitting appends a
  `## Sitting — HH:MM (Europe/Paris)` section, per COUNCIL.md §7.
  **Append-only** — never edited after the fact. It's the record of what
  happened, not what's true now.

Sittings run **weekly** (Monday 10:00 Europe/Paris). The SHIP budget is
**1 per rolling 24 h across all sittings** — the Chair checks both the Board
(`In Progress`) and today's minutes file before approving one. COUNCIL.md §4
still describes the older 5-hourly cadence in its budget note; the budget
itself is unchanged and binding, only the firing schedule moved.

Each sitting also carries a `### Telemetry briefing` block — the usage
reading from `scripts/telemetry_brief.py`, pasted verbatim. It is
**informational only and expands no remit**: no seat files objectives on it,
nothing from it is docketed, and Atlas Solar stays out of remit under
COUNCIL.md §2. It exists so a sitting is not blind to whether anything is
actually used. See `.claude/agents/standup-chair.md` step 7b.

The Board is what stops a recurring routine from re-deriving the same three
objectives every five hours — seats pull from it instead of inventing from
scratch. The minutes are what stop it from forgetting why a ruling was made.
