#!/usr/bin/env bash
# Runs the trip-revision agent headless on each fixture and compares the classified
# change type(s) and their key fields against expected.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/tests/revision-fixtures"
TODAY="20-09-2026"
fail=0
for case_dir in "$FIX"/*/; do
  name="$(basename "$case_dir")"
  work="$ROOT/trips/fixture-revision-$name"
  rm -rf "$work" && mkdir -p "$work"
  cp "$case_dir/itinerary.json" "$work/itinerary.json"
  request="$(cat "$case_dir/request.txt")"
  claude -p "Use the trip-revision subagent. Slug: trips/fixture-revision-$name/. Today: $TODAY. Revision request: $request" \
    --allowedTools "Agent,Read,Edit(trips/**)" --max-turns 12 --model sonnet >/dev/null || { echo "FAIL $name: claude exited non-zero"; fail=1; continue; }
  python3 - "$name" "$work/revision-plan.json" "$case_dir/expected.json" <<'PY' || fail=1
import json, sys
name, got_path, exp_path = sys.argv[1:]
got = json.load(open(got_path))
exp = json.load(open(exp_path))
got_types = [c["type"] for c in got["changes"]]
mismatches = []
if "change_types" in exp and sorted(got_types) != sorted(exp["change_types"]):
    mismatches.append(f"change_types: expected {exp['change_types']}, got {got_types}")
for c in got["changes"]:
    for key in ("shift_days", "delta_days", "target_city", "cutoff_day"):
        if key in exp and key in c and c[key] != exp[key]:
            mismatches.append(f"{key}: expected {exp[key]}, got {c[key]}")
if exp.get("needs_user_input_nonempty") and not got.get("needs_user_input"):
    mismatches.append("needs_user_input: expected non-empty, got empty")
print(f"{name}: {'OK' if not mismatches else 'MISMATCH ' + '; '.join(mismatches)}")
sys.exit(1 if mismatches else 0)
PY
done
exit $fail
