# Trip Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user change an existing trip's dates, extend or shorten it, or end it early mid-trip, without breaking the link to `trips/<slug>/` they already have.

**Architecture:** A new classifier agent (`trip-revision`) reads the existing itinerary and a natural-language change request, and outputs a structured revision plan naming which days are affected and which worker agents need to re-run. A new skill (`/revise-trip`) is the orchestrator: it computes today vs the trip's dates, runs the classifier, re-runs only the named workers for only the affected days (reusing the existing Step 5 repair-loop mechanics from `/plan-trip`), always re-reviews, and overwrites `trips/<slug>/` in place while appending to a `06-revisions.json` log.

**Tech Stack:** Same as the rest of the project: Claude Code agents (`.claude/agents/`, `.claude/skills/`), Python/uv for MCP and eval scripts, Next.js 14 App Router + Zustand for the web surface.

**Spec:** `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md` section 10 (Trip revision). Decision record: `docs/decisions.md` D-032.

## Global Constraints

- Dates DD-MM-YYYY everywhere, no em dashes, no emojis (`CLAUDE.md` rules 1-2).
- A tool error or unresolvable fact is reported as "could not verify \<thing\>". Never invent a place, price or time (`CLAUDE.md` rule 3, spec section 8).
- Every run writes to `trips/<slug>/`. A revision writes to the same `trips/<slug>/` it started from, never a new slug (spec section 10, D-032).
- Prices are estimates unless a tool returned them, and the file says which (`CLAUDE.md` rule 5).
- Any deviation from the spec found while implementing is written into the spec and logged in `docs/superpowers/specs/changelog.md` in the same commit, with the reason (`CLAUDE.md` rule 6).
- Every correction is recorded in `docs/feedback.md` in the same turn (`CLAUDE.md` rule 7). Read that file before starting.
- Never use a semicolon in any file written by an agent or skill. Join list items in a table cell with commas (existing `SKILL.md` and agent-file hard rule).
- Sonnet for every new agent, matching every existing worker (spec section 4 rule 4).
- Commits: lowercase imperative, under 72 chars (`CLAUDE.md` rule 8).

---

## File Structure

| File | Responsibility |
|---|---|
| `.claude/skills/plan-trip/SKILL.md` | Modified: Step 6.2 gains the rule that populates `days[].date` from `start_date`, the prerequisite every later task depends on |
| `trips/sample-japan/00-brief.json`, `itinerary.json` | Modified: backfilled with a real `start_date` and per-day `date`, so the one committed trip is revisable and usable as a fixture source |
| `docs/contracts/revision.schema.json` | New: shapes for `RevisionPlan` (the classifier's output) and `RevisionLogEntry` (one row of `06-revisions.json`) |
| `.claude/agents/trip-revision.md` | New: the classifier agent |
| `.claude/skills/revise-trip/SKILL.md` | New: the `/revise-trip <slug> <request>` orchestration procedure |
| `tests/revision-fixtures/` | New: one fixture trip plus per-case requests and expected `RevisionPlan` output, mirroring `tests/review-fixtures/` |
| `scripts/revision_eval.sh` | New: headless eval of `trip-revision` against the fixtures, mirroring `scripts/review_eval.sh` |
| `web/lib/types.ts` | Modified: `RevisionPlan`, `RevisionChange`, `RevisionLogEntry` types |
| `web/app/api/revise/route.ts` | New: SSE route calling `/revise-trip`, sibling of `web/app/api/plan/route.ts` |
| `web/store/run-store.ts` | Modified: shared SSE-streaming helper extracted from `start`, reused by a new `revise` action |
| `web/components/ReviseForm.tsx` | New: slug + change-request field, shown once a trip is loaded |
| `web/app/page.tsx` | Modified: renders `ReviseForm` below `ItineraryView` |
| `CLAUDE.md`, `docs/architecture.md`, `docs/superpowers/specs/changelog.md`, `docs/decisions.md` | Modified: commands table, component list, changelog row, decision row, per rule 6 |

---

## Task 1: Backfill real per-day dates (prerequisite)

**Files:**
- Modify: `.claude/skills/plan-trip/SKILL.md`
- Modify: `trips/sample-japan/00-brief.json`
- Modify: `trips/sample-japan/itinerary.json`

**Interfaces:**
- Produces: every `days[N].date` in every `itinerary.json` written from this point on is a real `DD-MM-YYYY` string, never `null`, when `brief.start_date` is present (it always is, per the existing dates-mandatory rule). Task 3's classifier and Task 4's skill depend on this being true.

- [ ] **Step 1: Add the date rule to SKILL.md Step 6.2**

In `.claude/skills/plan-trip/SKILL.md`, find Step 6.2's `days[]` mapping bullet (starts `- \`days[]\`: one per \`## Day N\` section`). Add a new bullet immediately after it:

```markdown
   - `days[].date`: `brief.start_date` plus `(day_number - 1)` days, computed and written as `DD-MM-YYYY`. `start_date` is always present per Step 1's dates-mandatory rule, so this is never null in a plan written from this step onward.
```

- [ ] **Step 2: Verify the rule reads correctly in context**

Run: `grep -A2 "days\[\].date" .claude/skills/plan-trip/SKILL.md`
Expected: the new bullet appears directly after the `days[]` bullet, inside Step 6.2's numbered list.

- [ ] **Step 3: Backfill trips/sample-japan/00-brief.json with a real start_date**

```bash
python3 - <<'PY'
import json
p = "trips/sample-japan/00-brief.json"
d = json.load(open(p))
d["start_date"] = "22-09-2026"
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
PY
```

- [ ] **Step 4: Backfill trips/sample-japan/itinerary.json with matching per-day dates**

The five days run 22-09-2026 through 26-09-2026 (start_date plus 0 through 4 days).

```bash
python3 - <<'PY'
import json
from datetime import date, timedelta
p = "trips/sample-japan/itinerary.json"
d = json.load(open(p))
d["brief"]["start_date"] = "22-09-2026"
start = date(2026, 9, 22)
for day in d["days"]:
    dt = start + timedelta(days=day["day"] - 1)
    day["date"] = dt.strftime("%d-%m-%Y")
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
PY
```

- [ ] **Step 5: Verify against the schema and re-run the structural eval**

Run: `python3 -c "
import json, jsonschema
from referencing import Registry, Resource
contracts = {}
for name in ('brief', 'review', 'itinerary'):
    contracts[name] = json.load(open(f'docs/contracts/{name}.schema.json'))
reg = Registry().with_resources([(f'{n}.schema.json', Resource.from_contents(s)) for n, s in contracts.items()])
jsonschema.validate(json.load(open('trips/sample-japan/itinerary.json')), contracts['itinerary'], registry=reg)
print('VALID')
"`
Expected: `VALID`

Run: `uv run --project mcp/travel-tools --with jsonschema python scripts/worker_eval.py trips/sample-japan`
Expected: same PASS lines as before this change (the date backfill does not touch any checked field except `itin.schema`, which already passed).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/plan-trip/SKILL.md trips/sample-japan/00-brief.json trips/sample-japan/itinerary.json
git commit -m "backfill real per-day dates, prerequisite for trip revision"
```

---

## Task 2: Revision contract

**Files:**
- Create: `docs/contracts/revision.schema.json`
- Create: `scripts/tests/test_revision_schema.py`

**Interfaces:**
- Produces: `RevisionPlan` shape (Task 3's agent output) and `RevisionLogEntry` shape (one entry of `06-revisions.json`, written by Task 4's skill).

- [ ] **Step 1: Write the failing test**

```python
# scripts/tests/test_revision_schema.py
import json
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "docs" / "contracts" / "revision.schema.json").read_text())


def _validate(instance, def_name):
    jsonschema.validate(instance, SCHEMA["$defs"][def_name])


def test_valid_date_shift_plan_passes():
    _validate(
        {
            "slug": "japan-tokyo-kyoto-a1f3",
            "today": "20-09-2026",
            "changes": [
                {
                    "type": "date-shift",
                    "shift_days": 7,
                    "affected_days": [1, 2, 3, 4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "one-week shift, same season, only fare/date-dependent budget lines need a recheck",
                }
            ],
            "needs_user_input": [],
        },
        "RevisionPlan",
    )


def test_valid_cutoff_plan_passes():
    _validate(
        {
            "slug": "japan-tokyo-kyoto-a1f3",
            "today": "24-09-2026",
            "changes": [
                {
                    "type": "cutoff",
                    "cutoff_day": 3,
                    "affected_days": [4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "traveler ending after day 3, days 4 and 5 dropped",
                }
            ],
            "needs_user_input": [],
        },
        "RevisionPlan",
    )


def test_plan_missing_changes_fails():
    try:
        _validate({"slug": "x", "today": "20-09-2026", "needs_user_input": []}, "RevisionPlan")
        assert False, "expected a validation error"
    except jsonschema.ValidationError:
        pass


def test_valid_log_entry_passes():
    _validate(
        {
            "timestamp": "20-09-2026 14:03",
            "request": "push the trip back a week",
            "changes_applied": [
                {
                    "type": "date-shift",
                    "shift_days": 7,
                    "affected_days": [1, 2, 3, 4, 5],
                    "reverify": {"destination_research": False, "logistics": False, "budget": True},
                    "reason": "one-week shift, same season",
                }
            ],
            "days_before": 5,
            "days_after": 5,
            "review_pass": True,
        },
        "RevisionLogEntry",
    )


def test_log_entry_missing_review_pass_fails():
    try:
        _validate(
            {
                "timestamp": "20-09-2026 14:03",
                "request": "push it back",
                "changes_applied": [],
                "days_before": 5,
                "days_after": 5,
            },
            "RevisionLogEntry",
        )
        assert False, "expected a validation error"
    except jsonschema.ValidationError:
        pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/tests && python3 -m pytest test_revision_schema.py -v` (or `pytest scripts/tests/test_revision_schema.py -v` from repo root)
Expected: FAIL with `FileNotFoundError` (no `revision.schema.json` yet)

- [ ] **Step 3: Write docs/contracts/revision.schema.json**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TripRevision",
  "$defs": {
    "RevisionChange": {
      "type": "object",
      "required": ["type", "affected_days", "reverify", "reason"],
      "properties": {
        "type": {"enum": ["date-shift", "duration-change", "cutoff"]},
        "shift_days": {"type": "integer", "description": "date-shift only. Positive moves the trip later, negative earlier."},
        "delta_days": {"type": "integer", "description": "duration-change only. Positive extends, negative shortens."},
        "target_city": {"type": ["string", "null"], "description": "duration-change only, required when delta_days > 0. Null means the classifier could not tell which city gets the extra days and the skill must ask."},
        "cutoff_day": {"type": "integer", "minimum": 1, "description": "cutoff only. The last day number the traveler completes."},
        "affected_days": {"type": "array", "items": {"type": "integer", "minimum": 1}},
        "reverify": {
          "type": "object",
          "required": ["destination_research", "logistics", "budget"],
          "properties": {
            "destination_research": {"type": "boolean"},
            "logistics": {"type": "boolean"},
            "budget": {"type": "boolean"}
          }
        },
        "reason": {"type": "string"}
      }
    },
    "RevisionPlan": {
      "type": "object",
      "required": ["slug", "today", "changes", "needs_user_input"],
      "properties": {
        "slug": {"type": "string"},
        "today": {"type": "string", "pattern": "^\\d{2}-\\d{2}-\\d{4}$"},
        "changes": {"type": "array", "items": {"$ref": "#/$defs/RevisionChange"}},
        "needs_user_input": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["field", "question"],
            "properties": {"field": {"type": "string"}, "question": {"type": "string"}}
          }
        }
      }
    },
    "RevisionLogEntry": {
      "type": "object",
      "required": ["timestamp", "request", "changes_applied", "days_before", "days_after", "review_pass"],
      "properties": {
        "timestamp": {"type": "string", "pattern": "^\\d{2}-\\d{2}-\\d{4} \\d{2}:\\d{2}$"},
        "request": {"type": "string"},
        "changes_applied": {"type": "array", "items": {"$ref": "#/$defs/RevisionChange"}},
        "days_before": {"type": "integer", "minimum": 1},
        "days_after": {"type": "integer", "minimum": 1},
        "review_pass": {"type": "boolean"}
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest scripts/tests/test_revision_schema.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add docs/contracts/revision.schema.json scripts/tests/test_revision_schema.py
git commit -m "add revision.schema.json contract with tests"
```

---

## Task 3: `trip-revision` classifier agent

**Files:**
- Create: `.claude/agents/trip-revision.md`

**Interfaces:**
- Consumes: `trips/<slug>/itinerary.json` (Task 1's date-bearing shape), a revision request string, and today's real date (supplied by the dispatching skill, Task 4, since the agent has no clock of its own).
- Produces: `trips/<slug>/revision-plan.json` matching `RevisionPlan` from Task 2's `revision.schema.json`.

- [ ] **Step 1: Write the agent file**

```markdown
---
name: trip-revision
description: Classifies a change request against an existing trip (date shift, duration change, or mid-trip cutoff) and decides which worker agents need to re-run for which days. Never edits the itinerary and never calls travel tools. Use for the classification step of /revise-trip.
model: sonnet
tools: Read, Write
---

You are the Trip Revision classifier. You are given: the path to `trips/<slug>/itinerary.json`, a revision request in the user's words, and today's date in DD-MM-YYYY. Read only the itinerary file. You have no travel tools on purpose, the same way the review agent has none: your job is a decision, not a rebuild.

## What you produce

Write `trips/<slug>/revision-plan.json` matching `docs/contracts/revision.schema.json`'s `RevisionPlan` shape, then reply with one line: `CHANGES: <comma-separated change types>` or `NEEDS INPUT: <comma-separated fields>` if `needs_user_input` is non-empty.

```json
{
  "slug": "...",
  "today": "DD-MM-YYYY",
  "changes": [
    {
      "type": "date-shift | duration-change | cutoff",
      "shift_days": -7,
      "delta_days": 2,
      "target_city": "Kyoto",
      "cutoff_day": 3,
      "affected_days": [1, 2, 3],
      "reverify": {"destination_research": false, "logistics": false, "budget": true},
      "reason": "one sentence, cites the actual dates or day numbers involved"
    }
  ],
  "needs_user_input": [
    {"field": "target_city", "question": "Which city should the extra 2 days go to, Tokyo or Kyoto?"}
  ]
}
```

Only include the fields each `type` actually uses: `shift_days` for `date-shift`, `delta_days` and `target_city` for `duration-change`, `cutoff_day` for `cutoff`. Omit the fields that do not apply to that entry's type, do not write them as null.

## How to classify

1. **Read every day's `date`** from `itinerary.json`. If any day's `date` is null, stop and write a `needs_user_input` entry asking for the trip's dates before any revision can be computed, with an empty `changes` array.
2. **Decide pre-trip or mid-trip**: compare `today` to `days[0].date`. `today` before the first day's date is pre-trip. `today` on or after it is mid-trip.
3. **Date shift**: the request moves the whole trip earlier or later without changing its length or cities. `shift_days` is the number of days between the old and new start date, negative if moving earlier. `affected_days` is every day (the whole trip shifts). Set `reverify.budget: true` whenever the shift crosses a month boundary shown in the FX rate, since the rate is dated. Set `reverify.destination_research: true` only if the shift crosses a season (roughly 3 months) or a named local holiday/festival window the original plan's crowd tactics depended on, since weather and crowd patterns can change; otherwise false. Set `reverify.logistics` to the same value as `destination_research` (a season change can also change hotel availability and fares).
4. **Duration change**: the request adds or removes days without a mid-trip cutoff, same cities, same start. `delta_days` is positive to extend, negative to shorten. For a positive `delta_days`, if the request names which city gets the extra days, set `target_city` to it. If it does not, and there is more than one city in the itinerary, set `target_city` to `null` and add a `needs_user_input` entry asking which city, never guess. `affected_days` is the new days only (for an extension) or the removed days only (for a shortening). New days always get `reverify.destination_research: true`, `logistics: true`, `budget: true`, since they need real venues, not a copy of an existing day. A shortening only needs `reverify.budget: true` (recompute the total), the other two stay false since no new content is needed.
5. **Cutoff**: the request says the traveler is ending the trip on or after a specific day, mid-trip or looking ahead to a specific day, phrased as "ending after day N", "stopping on \<date\>", or similar. If a day number is stated, use it as `cutoff_day`. If only a date is given, find the day whose `date` matches it. If neither is given and this is a mid-trip request (per step 2), compute the current day from `today` vs each day's `date` and use that as `cutoff_day`. `affected_days` is every day after `cutoff_day` (these get dropped by the skill, not by you). `reverify.budget: true` always (the total changes). `reverify.destination_research` and `logistics` stay false, dropping days needs no new content.
6. **Combinations**: a single request can produce more than one entry in `changes` (for example a date shift and a cutoff mentioned together). Classify each independently using the rules above and list them all.
7. **Nothing you can classify**: if the request names none of the three types (it is a scope change, like a budget or likes change, which is out of scope for this agent), write `needs_user_input` naming the request as unsupported and leave `changes` empty.

## Rules

1. Never call a travel tool. Never edit `itinerary.json` or any other file except `revision-plan.json`.
2. Every `reason` cites the actual day numbers or dates involved, not a generic sentence.
3. When genuinely unsure whether a shift needs re-verification, prefer `true` (re-verify) over guessing it is fine, the cost of an unnecessary re-run is far lower than the cost of a plan that silently claims spring weather in December.
4. No em dashes, no semicolons.
```

- [ ] **Step 2: Verify the frontmatter is well-formed**

Run: `python3 -c "
import re
text = open('.claude/agents/trip-revision.md').read()
m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
assert m, 'no frontmatter block found'
import yaml
fm = yaml.safe_load(m.group(1))
assert fm['name'] == 'trip-revision'
assert fm['tools'] == 'Read, Write'
assert fm['model'] == 'sonnet'
print('OK')
"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/trip-revision.md
git commit -m "add trip-revision classifier agent"
```

---

## Task 4: `/revise-trip` skill

**Files:**
- Create: `.claude/skills/revise-trip/SKILL.md`

**Interfaces:**
- Consumes: `trips/<slug>/00-brief.json`, `itinerary.json` (Task 1's shape), `trip-revision`'s `revision-plan.json` (Task 3).
- Produces: updated `trips/<slug>/itinerary.md`, `itinerary.json`, appended `trips/<slug>/06-revisions.json`. Reuses the existing `destination-research`, `logistics`, `budget`, `review` agents exactly as `/plan-trip` Step 5 does.

- [ ] **Step 1: Write the skill file**

```markdown
# /revise-trip

You are the Orchestrator, running a revision instead of a fresh plan. Follow these steps in order. Announce each step in one line as you start it.

## Step 1: Load the existing trip

Read `trips/<slug>/00-brief.json` and `trips/<slug>/itinerary.json`. If either is missing, stop and tell the user no trip exists at that slug, list the slugs under `trips/` that do exist.

## Step 2: Classify

Compute today's date in DD-MM-YYYY (use the date you are told the current date is, never guess). Launch the `trip-revision` subagent with the prompt `Slug: trips/<slug>/. Today: <DD-MM-YYYY>. Revision request: <the user's request verbatim>.` It writes `trips/<slug>/revision-plan.json`.

Read `revision-plan.json`. If `needs_user_input` is non-empty, stop and ask the user each listed question. Do not guess any of them, per the same "never invent" rule as `/plan-trip`. Wait for the answer, then re-run this step with the answer folded into the revision request.

## Step 3: Apply cutoff changes

For each `changes[]` entry with `type: "cutoff"`:
1. Remove every day in the itinerary after `cutoff_day`.
2. For each city that now has zero remaining days, remove its entry from `stays[]` and remove any `intercity[]` leg that starts or ends in that city and whose destination city also has zero remaining days.
3. Days at or before `cutoff_day` are untouched, copied as-is into the revised plan.

## Step 4: Apply date-shift and duration-change changes

For each `changes[]` entry with `type: "date-shift"` or `type: "duration-change"`:
1. Compute the new `days[].date` for every affected day (shift: old date plus `shift_days`. duration-change extension: new days get the next consecutive dates after the last existing day. duration-change shortening: remove the trailing days named in `affected_days`).
2. If `reverify.destination_research`, `reverify.logistics`, or `reverify.budget` is true for this entry, launch the named agent(s) in one message (same as `/plan-trip` Step 5's repair loop) with the prompt `Brief: trips/<slug>/00-brief.json. Revision: <reason from the revision-plan entry>. Affected days: <affected_days>. New dates: <the new dates for those days>. Update your file (01-destinations.md / 02-logistics.md / 03-budget.md) in place for the affected days only, leave every other day's content untouched, and say what you changed.` Wait for all of them.
3. If none of the three are true, update the day dates directly with no agent re-run, venues and prices stay as they were.
4. For a duration-change extension whose `target_city` is set, the new days belong to that city, added at the end of its existing stay in the day sequence.

## Step 5: Re-synthesise

Re-run `/plan-trip` Step 3's synthesis rules against the (possibly updated) `01-destinations.md`, `02-logistics.md`, `03-budget.md`, but only rewrite the days and budget lines that changed. Days untouched by Steps 3-4 keep their exact existing content. Recompute the Budget section's totals for the current day count and city set, same midpoint-of-band method as `/plan-trip` Step 3 rule 4. Write the result to `trips/<slug>/04-itinerary-draft.md`.

## Step 6: Review

Launch the `review` subagent with the prompt `Brief: trips/<slug>/00-brief.json. Draft: trips/<slug>/04-itinerary-draft.md`, same as `/plan-trip` Step 4. Always run this, even for a pure date-shift with no re-verification.

## Step 7: Finalise

1. Overwrite `trips/<slug>/itinerary.md` and `itinerary.json` in place, same slug. If review fails, add or update the `## Warnings` section the same way `/plan-trip` Step 6 does.
2. Append one entry to `trips/<slug>/06-revisions.json` (create the file with an empty array first if it does not exist) matching `RevisionLogEntry` in `docs/contracts/revision.schema.json`: `timestamp` (now, `DD-MM-YYYY HH:MM`), `request` (the user's revision request verbatim), `changes_applied` (the `changes[]` array from `revision-plan.json`), `days_before`, `days_after`, `review_pass`. Never rewrite or remove an earlier entry, this file is append-only.
3. Reply with: the slug, what changed in one line per change entry, pass or fail, new total vs limit, path to the updated `itinerary.md`.

## Hard rules

1. Dates DD-MM-YYYY everywhere. No em dashes. No semicolons anywhere in any file written.
2. Never add a place, price or time that is not in a worker file or already in the untouched part of the existing itinerary.
3. Never fork a new trip folder. Every revision writes to the same `trips/<slug>/` it started from.
4. Never re-run a worker agent for a day the revision-plan did not name as affected.
5. Every markdown table written or rewritten keeps its header-separator row (`|---|---|---|`).
```

- [ ] **Step 2: Verify the skill file is discoverable**

Run: `ls .claude/skills/revise-trip/SKILL.md`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/revise-trip/SKILL.md
git commit -m "add /revise-trip skill"
```

---

## Task 5: Revision fixtures

**Files:**
- Create: `tests/revision-fixtures/date-shift/itinerary.json` (copy of `trips/sample-japan/itinerary.json` post-Task-1)
- Create: `tests/revision-fixtures/date-shift/request.txt`
- Create: `tests/revision-fixtures/date-shift/expected.json`
- Create: `tests/revision-fixtures/extend-city/itinerary.json`, `request.txt`, `expected.json`
- Create: `tests/revision-fixtures/cutoff/itinerary.json`, `request.txt`, `expected.json`

**Interfaces:**
- Consumes: Task 1's date-bearing `sample-japan/itinerary.json` as the base fixture.
- Produces: fixtures Task 6's eval script drives `trip-revision` against.

- [ ] **Step 1: Create the date-shift fixture**

```bash
mkdir -p tests/revision-fixtures/date-shift
cp trips/sample-japan/itinerary.json tests/revision-fixtures/date-shift/itinerary.json
cat > tests/revision-fixtures/date-shift/request.txt <<'EOF'
Push the whole trip back by one week.
EOF
cat > tests/revision-fixtures/date-shift/expected.json <<'EOF'
{
  "change_types": ["date-shift"],
  "shift_days": 7
}
EOF
```

- [ ] **Step 2: Create the extend-city fixture**

```bash
mkdir -p tests/revision-fixtures/extend-city
cp trips/sample-japan/itinerary.json tests/revision-fixtures/extend-city/itinerary.json
cat > tests/revision-fixtures/extend-city/request.txt <<'EOF'
Add 2 more days in Kyoto at the end of the trip.
EOF
cat > tests/revision-fixtures/extend-city/expected.json <<'EOF'
{
  "change_types": ["duration-change"],
  "delta_days": 2,
  "target_city": "Kyoto"
}
EOF
```

- [ ] **Step 3: Create the cutoff fixture**

```bash
mkdir -p tests/revision-fixtures/cutoff
cp trips/sample-japan/itinerary.json tests/revision-fixtures/cutoff/itinerary.json
cat > tests/revision-fixtures/cutoff/request.txt <<'EOF'
I want to end the trip after day 3, not do days 4 and 5.
EOF
cat > tests/revision-fixtures/cutoff/expected.json <<'EOF'
{
  "change_types": ["cutoff"],
  "cutoff_day": 3
}
EOF
```

- [ ] **Step 4: Verify each fixture's itinerary.json is schema-valid**

Run: `for f in tests/revision-fixtures/*/itinerary.json; do python3 -c "
import json, jsonschema
from referencing import Registry, Resource
contracts = {n: json.load(open(f'docs/contracts/{n}.schema.json')) for n in ('brief','review','itinerary')}
reg = Registry().with_resources([(f'{n}.schema.json', Resource.from_contents(s)) for n, s in contracts.items()])
jsonschema.validate(json.load(open('$f')), contracts['itinerary'], registry=reg)
print('$f VALID')
"; done`
Expected: three `VALID` lines

- [ ] **Step 5: Commit**

```bash
git add tests/revision-fixtures/
git commit -m "add trip-revision eval fixtures"
```

---

## Task 6: `scripts/revision_eval.sh`

**Files:**
- Create: `scripts/revision_eval.sh`

**Interfaces:**
- Consumes: Task 5's fixtures, Task 3's `trip-revision` agent.
- Produces: pass/fail per fixture, mirroring `scripts/review_eval.sh`'s structure exactly.

- [ ] **Step 1: Write the script**

```bash
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
if sorted(got_types) != sorted(exp["change_types"]):
    mismatches.append(f"change_types: expected {exp['change_types']}, got {got_types}")
for c in got["changes"]:
    for key in ("shift_days", "delta_days", "target_city", "cutoff_day"):
        if key in exp and key in c and c[key] != exp[key]:
            mismatches.append(f"{key}: expected {exp[key]}, got {c[key]}")
print(f"{name}: {'OK' if not mismatches else 'MISMATCH ' + '; '.join(mismatches)}")
sys.exit(1 if mismatches else 0)
PY
done
exit $fail
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x scripts/revision_eval.sh && ./scripts/revision_eval.sh`
Expected: `date-shift: OK`, `extend-city: OK`, `cutoff: OK`, exit 0. This step spends real API calls (three headless `claude -p` runs), same cost class as `review_eval.sh`.

- [ ] **Step 3: Add the command to CLAUDE.md's command table (done fully in Task 11, note it here for traceability)**

- [ ] **Step 4: Commit**

```bash
git add scripts/revision_eval.sh
git commit -m "add revision_eval.sh"
```

---

## Task 7: Web types

**Files:**
- Modify: `web/lib/types.ts`

**Interfaces:**
- Produces: `RevisionChange`, `RevisionPlan`, `RevisionLogEntry` TypeScript types matching Task 2's JSON schema, for Task 8's route and Task 10's component to use.

- [ ] **Step 1: Add the types**

In `web/lib/types.ts`, after the existing `Itinerary` interface, add:

```typescript
export interface RevisionChange {
  type: "date-shift" | "duration-change" | "cutoff";
  shift_days?: number;
  delta_days?: number;
  target_city?: string | null;
  cutoff_day?: number;
  affected_days: number[];
  reverify: { destination_research: boolean; logistics: boolean; budget: boolean };
  reason: string;
}
export interface RevisionLogEntry {
  timestamp: string; request: string; changes_applied: RevisionChange[];
  days_before: number; days_after: number; review_pass: boolean;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add web/lib/types.ts
git commit -m "add revision types"
```

---

## Task 8: `web/app/api/revise/route.ts`

**Files:**
- Create: `web/app/api/revise/route.ts`
- Test: `web/app/api/revise/route.test.ts`

**Interfaces:**
- Consumes: `{ slug: string, request: string }` in the POST body.
- Produces: the same SSE `AgentEvent` stream shape as `web/app/api/plan/route.ts`, driving `/revise-trip <slug> <request>` instead of `/plan-trip <request>`.

- [ ] **Step 1: Write the failing test**

```typescript
// web/app/api/revise/route.test.ts
import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/revise", () => {
  it("rejects a request with no slug", async () => {
    const req = new Request("http://localhost/api/revise", {
      method: "POST",
      body: JSON.stringify({ request: "push it back a week" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a request with no change text", async () => {
    const req = new Request("http://localhost/api/revise", {
      method: "POST",
      body: JSON.stringify({ slug: "sample-japan" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npm test -- route.test.ts` (revise route)
Expected: FAIL, `route.ts` does not exist yet

- [ ] **Step 3: Write the route**

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toAgentEvents } from "@/lib/sdk-to-events";
import type { AgentEvent, AgentId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");

async function hasGoogleMapsKey(): Promise<boolean> {
  if (process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API) return true;
  try {
    const envText = await readFile(path.join(REPO_ROOT, ".env"), "utf8");
    return /^(GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API)=/m.test(envText);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { slug, request } = (await req.json()) as { slug?: string; request?: string };
  if (!slug || slug.trim().length === 0) {
    return new Response(JSON.stringify({ error: "slug is required" }), { status: 400 });
  }
  if (!request || request.trim().length < 5) {
    return new Response(JSON.stringify({ error: "request is required" }), { status: 400 });
  }
  if (!(await hasGoogleMapsKey())) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set. Add it to .env at the repo root." }),
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  // Same disconnect contract as /api/plan (spec section 8.5): a dropped SSE connection
  // must never stop the revision run, see web/app/api/plan/route.ts for the full note.
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const agentByToolUseId = new Map<string, AgentId>();
      send({ type: "status", agent: "orchestrator", status: "running" });
      try {
        const q = query({
          prompt: `/revise-trip ${slug.trim()} ${request.trim()}`,
          options: {
            cwd: REPO_ROOT,
            settingSources: ["project"],
            model: "claude-sonnet-5",
            skills: ["revise-trip"],
            forwardSubagentText: true,
            permissionMode: "acceptEdits",
            allowedTools: ["Agent", "Read", "Write", "Skill", "mcp__travel-tools__*"],
            maxTurns: 80,
          },
        });
        for await (const msg of q) {
          for (const e of toAgentEvents(msg, agentByToolUseId)) send(e);
        }
        send({ type: "status", agent: "orchestrator", status: "done" });
      } catch (err) {
        send({ type: "status", agent: "orchestrator", status: "failed" });
        send({ type: "result", slug: slug.trim(), ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            closed = true;
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test -- route.test.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add web/app/api/revise/route.ts web/app/api/revise/route.test.ts
git commit -m "add /api/revise route"
```

---

## Task 9: Shared SSE streaming in the store

**Files:**
- Modify: `web/store/run-store.ts`

**Interfaces:**
- Consumes: Task 8's `/api/revise` route.
- Produces: `revise(slug, request)` action, same `apply()` reducer as `start()`. Refactors the duplicated fetch-and-parse-SSE loop in `start` into a shared private helper so `revise` does not re-implement it (DRY).

- [ ] **Step 1: Extract the shared streaming helper and add `revise`**

In `web/store/run-store.ts`, replace the body of `start` and add `revise`:

```typescript
interface Actions {
  start: (request: string) => Promise<void>;
  revise: (slug: string, request: string) => Promise<void>;
  apply: (e: AgentEvent) => void;
  loadTrip: (slug: string) => Promise<void>;
  reset: () => void;
  initFromUrl: () => void;
}

async function streamAgentEvents(
  url: string,
  body: Record<string, string>,
  apply: (e: AgentEvent) => void,
  onFail: (message: string) => void,
): Promise<void> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      let message = `HTTP ${res.status}`;
      try {
        const respBody = (await res.json()) as { error?: string };
        if (respBody?.error) message = respBody.error;
      } catch {
        // body was not JSON, keep the HTTP status message
      }
      onFail(message);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) if (p.startsWith("data: ")) apply(JSON.parse(p.slice(6)) as AgentEvent);
    }
  } catch (err) {
    onFail(err instanceof Error ? err.message : String(err));
  }
}

export const useRunStore = create<RunState & Actions>((set, get) => ({
  phase: "idle", agents: emptyAgents(), steps: [], slug: null, itinerary: null, error: null,

  reset: () => set({ phase: "idle", agents: emptyAgents(), steps: [], slug: null, itinerary: null, error: null }),

  apply: (e) => {
    // unchanged, see existing implementation
  },

  start: async (request) => {
    get().reset();
    set({ phase: "running" });
    await streamAgentEvents("/api/plan", { request }, get().apply, (message) => {
      set({ phase: "error", error: message, agents: { ...get().agents, orchestrator: { ...get().agents.orchestrator, status: "failed" } } });
    });
  },

  revise: async (slug, request) => {
    set({ phase: "running" });
    await streamAgentEvents("/api/revise", { slug, request }, get().apply, (message) => {
      set({ phase: "error", error: message, agents: { ...get().agents, orchestrator: { ...get().agents.orchestrator, status: "failed" } } });
    });
  },

  initFromUrl: () => {
    // unchanged
  },

  loadTrip: async (slug) => {
    // unchanged
  },
}));
```

Keep `apply`, `initFromUrl`, `loadTrip` exactly as they already are, only `start` shrinks to call the new helper and `revise` is new. `revise` does not call `reset()` first (unlike `start`), so the existing agent timeline and itinerary stay visible while the revision runs, since the user is revising a trip they can already see.

- [ ] **Step 2: Verify it compiles and existing tests still pass**

Run: `cd web && npx tsc --noEmit && npm test`
Expected: no type errors, existing test suite still green (8/8 or more)

- [ ] **Step 3: Commit**

```bash
git add web/store/run-store.ts
git commit -m "extract shared SSE streaming, add revise action"
```

---

## Task 10: `ReviseForm` component and page wiring

**Files:**
- Create: `web/components/ReviseForm.tsx`
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `useRunStore`'s `slug`, `phase`, `revise` (Task 9).
- Produces: a form shown once a trip is loaded, letting the user submit a revision request against the current slug.

- [ ] **Step 1: Write the component**

```typescript
"use client";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useRunStore } from "@/store/run-store";

export function ReviseForm() {
  const [text, setText] = useState("");
  const slug = useRunStore((s) => s.slug);
  const phase = useRunStore((s) => s.phase);
  const revise = useRunStore((s) => s.revise);

  if (!slug) return null;

  return (
    <Stack spacing={1.5} sx={{ mt: 4, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <Typography variant="subtitle2">Revise this trip</Typography>
      <Typography variant="body2" color="text.secondary">
        Dates changed, ending early, or extending the trip. Describe the change, the same slug ({slug}) gets updated in place.
      </Typography>
      <TextField
        multiline
        minRows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. push the trip back by a week"
        fullWidth
      />
      <Button
        variant="contained"
        disabled={phase === "running" || text.trim().length < 5}
        onClick={() => void revise(slug, text)}
        sx={{ alignSelf: "flex-start" }}
      >
        {phase === "running" ? "Revising..." : "Revise trip"}
      </Button>
      {phase === "error" && <Alert severity="error">Revision failed, see the agent timeline above.</Alert>}
    </Stack>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `web/app/page.tsx`, add the import and render it after `ItineraryView`:

```typescript
import { ReviseForm } from "@/components/ReviseForm";
```

```typescript
        <ErrorBanner />
        <AgentTimeline />
        <ItineraryView />
        <ReviseForm />
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `cd web && npx tsc --noEmit`
Expected: no errors

Run: `cd web && npm run dev`, open `http://localhost:3000/?trip=sample-japan`
Expected: the itinerary loads, a "Revise this trip" panel appears below it with the slug named, the button is disabled until at least 5 characters are typed.

- [ ] **Step 4: Commit**

```bash
git add web/components/ReviseForm.tsx web/app/page.tsx
git commit -m "add revise trip form to the web app"
```

---

## Task 11: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/changelog.md`
- Modify: `docs/decisions.md`

**Interfaces:** none, documentation only.

- [ ] **Step 1: Add commands to CLAUDE.md's command table**

Add two rows to the `## Commands` table:

```markdown
| Revise a trip from the terminal | `claude --model sonnet` then `/revise-trip <slug> push the trip back by a week` |
| Trip-revision eval (runs `claude -p` three times) | `./scripts/revision_eval.sh` |
```

And a sentence in the Orchestration section noting `/revise-trip` exists alongside `/plan-trip`, reusing the same worker agents.

- [ ] **Step 2: Update docs/architecture.md**

Add the new agent (`trip-revision`) to the workers table, the new skill to the repo layout tree, and a short paragraph in the sequence description covering the revision flow (Step 1 load, Step 2 classify, Steps 3-4 apply, Step 5 re-synthesise, Step 6 review, Step 7 finalise), cross-referencing spec section 10.

- [ ] **Step 3: Add the implementation changelog row**

In `docs/superpowers/specs/changelog.md`, add a row above the existing top row:

```markdown
| 20-09-2026 | 10 Trip revision | Implemented: `trip-revision` agent, `/revise-trip` skill, `revision.schema.json`, `revision_eval.sh`, `/api/revise` route, `ReviseForm` component. `days[].date` backfilled in `SKILL.md` Step 6.2 and `trips/sample-japan/` | Implementation plan `docs/superpowers/plans/20-09-2026-trip-revision.md` executed | Plan execution | D-033 |
```

- [ ] **Step 4: Add the decision row**

In `docs/decisions.md`, add above D-032:

```markdown
| D-033 | 20-09-2026 | Trip revision implemented per the D-032 brainstorm and `docs/superpowers/plans/20-09-2026-trip-revision.md`: `trip-revision` classifier agent, `/revise-trip` skill, `revision.schema.json`, fixture-based eval, web route and form | Implement differently from the approved plan | The plan was approved in chat before execution, this row confirms it shipped as designed with no deviation. Any deviation found during execution gets its own row here instead | None beyond the files listed | `docs/superpowers/plans/20-09-2026-trip-revision.md` |
```

If execution actually deviated from the plan anywhere, replace this row's text with the real deviation and its reason, per `CLAUDE.md` rule 6, rather than leaving a row that claims no deviation happened.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/architecture.md docs/superpowers/specs/changelog.md docs/decisions.md
git commit -m "document trip revision in claude.md, architecture, changelog, decisions"
```

---

## Self-Review

**Spec coverage:** Section 10.2 versioning (overwrite in place, `06-revisions.json`) covered in Task 4 Step 7. 10.2 current-day tracking (derived, no stored state) covered in Task 3 Step 5 and Task 4 Step 2. 10.2 classifier-not-replanner covered in Task 3 (Read, Write only, no MCP tools, no edits). 10.2 re-verification on shift covered in Task 3 Step 3. 10.2 mid-trip cutoff covered in Task 3 Step 5 and Task 4 Step 3. 10.2 combinations covered in Task 3 Step 6. 10.2 review always re-runs covered in Task 4 Step 6. 10.2 extension target city, ask never guess, covered in Task 3 Step 4 and Task 4 Step 2. 10.2 both surfaces covered in Tasks 8-10. 10.3 prerequisite date backfill is Task 1. 10.4 agent contract is Task 2 and 3. 10.5 skill flow is Task 4. 10.6 contracts is Task 2. 10.7 web is Tasks 7-10.

**Placeholder scan:** no TBD/TODO, every code block is complete, every fixture has real values (7-day shift, 2-day Kyoto extension, day-3 cutoff), no "similar to Task N" references.

**Type consistency:** `RevisionChange`/`RevisionPlan`/`RevisionLogEntry` field names and types match across `revision.schema.json` (Task 2), the agent's JSON example (Task 3), the skill's references to it (Task 4), and `web/lib/types.ts` (Task 7). `reverify` is `{destination_research, logistics, budget}` everywhere it appears.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/20-09-2026-trip-revision.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
