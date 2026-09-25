#!/usr/bin/env bash
# The Council's record-landing guard.
#
# The Board is the Council's memory. A memory write that waits on human
# approval is not memory — and this repo has the receipts: 49 sitting
# branches written, 2 days of minutes actually on main, so every sitting
# after 2026-08-04 woke up believing it was 2026-08-04 and re-derived work
# that was already done.
#
# The fix is to separate the two things a sitting produces:
#
#   the RECORD  — council/** only. Bookkeeping. No production risk.
#                 Must land every sitting, automatically.
#   the CHANGE  — docs/** code. Needs human review. Stays gated.
#
# This script is the guard that makes that split enforceable rather than
# a promise: it refuses to prepare a record that touches anything outside
# council/, so "the Chair may merge its own record" can never become
# "the Chair merged code into main".
#
# Usage:
#   scripts/council-record.sh --verify            check the diff only
#   scripts/council-record.sh --branch <name>     verify, commit, push
#
# Exit codes: 0 clean · 1 misuse · 2 diff escapes council/ (never merge)

set -euo pipefail

MODE="${1:---verify}"
BRANCH="${2:-}"

changed() { git diff --name-only HEAD; git diff --cached --name-only; git ls-files -o --exclude-standard; }

FILES=$(changed | sort -u | grep -v '^$' || true)

if [ -z "$FILES" ]; then
  echo "council-record: nothing to record (no changes)."
  exit 0
fi

# The whole point of the guard: anything outside council/ is a CHANGE, not
# a record, and must go through review on its own branch.
ESCAPES=$(printf '%s\n' "$FILES" | grep -v '^council/' || true)

echo "Files in this record:"
printf '  %s\n' $FILES
echo

if [ -n "$ESCAPES" ]; then
  cat >&2 <<EOF
REFUSED — this is not a record. These files are outside council/:

$(printf '  %s\n' $ESCAPES)

A record PR may contain ONLY council/** and is merged by the Chair itself.
Anything else is a CHANGE: put it on its own branch, open a separate PR,
and leave it for human review. Never merge the two together — that is the
exact coupling that stranded 49 sittings.
EOF
  exit 2
fi

echo "OK — record touches only council/. Safe for the Chair to merge."
[ "$MODE" = "--verify" ] && exit 0

if [ "$MODE" != "--branch" ] || [ -z "$BRANCH" ]; then
  echo "usage: $0 --verify | $0 --branch <branch-name>" >&2
  exit 1
fi

git checkout -b "$BRANCH"
git add council/
git commit -q -m "council: record the $(date -u +%Y-%m-%d) sitting

Minutes and Board update only. No code. Landed by the Chair under
COUNCIL.md §9 so the Board that the next sitting reads is current."
git push -u origin "$BRANCH"
echo
echo "Pushed $BRANCH. Now open a PR titled 'Council record — <date> <time>' and MERGE IT."
echo "It contains only council/**, so merging it is the Chair's own duty, not a human's."
