#!/usr/bin/env bash
# Runs the review agent headless on each fixture and compares pass/fail per check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/tests/review-fixtures"
fail=0
for case_dir in "$FIX"/*/; do
  name="$(basename "$case_dir")"
  work="$ROOT/trips/fixture-$name"
  rm -rf "$work" && mkdir -p "$work"
  cp "$FIX/brief.json" "$work/00-brief.json"
  cp "$case_dir/04-itinerary-draft.md" "$work/04-itinerary-draft.md"
  claude -p "Use the review subagent. Brief: trips/fixture-$name/00-brief.json. Draft: trips/fixture-$name/04-itinerary-draft.md" \
    --allowedTools "Agent,Read,Write" --max-turns 12 --model sonnet >/dev/null
  python3 - "$name" "$work/05-review.json" "$FIX/expected.json" <<'PY' || fail=1
import json, sys
name, got_path, exp_path = sys.argv[1:]
got = {c["id"]: c["pass"] for c in json.load(open(got_path))["checks"]}
exp = json.load(open(exp_path))[name]
diff = {k: (exp[k], got.get(k)) for k in exp if exp[k] != got.get(k)}
print(f"{name}: {'OK' if not diff else 'MISMATCH ' + json.dumps(diff)}")
sys.exit(1 if diff else 0)
PY
done
exit $fail
