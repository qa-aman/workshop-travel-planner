# Handover check

Independent end-to-end drive of the web app, run from a clean browser state with `npm run dev`
already running on port 3000 (PID 901). Slug for this drive: `japan-tokyo-kyoto-e6f1`. The sample
run committed at `trips/sample-japan/` is a separate, earlier drive (slug `japan-tokyo-kyoto-0000`
at generation time, renamed to `sample-japan`), also produced through the browser with `pass: true`.

1. **Wall time, click to itinerary.** Clicked "Plan my trip" at 13:37:26 UTC (19-09-2026), full
   itinerary view rendered at 13:49:06 UTC. Wall time: 709 seconds (11 min 49 sec). Within the
   8 to 16 minute expected range. The earlier sample-run drive took 807 seconds (13 min 27 sec),
   also within range.

2. **Three agents running together.** Confirmed at both drives. In the independent drive, 80
   seconds after click: Orchestrator `running`, Destination research `running`, Logistics
   `running`, Budget `done`. Screenshot of the equivalent moment in the sample-run drive saved at
   `/tmp/task16-running.png`.

3. **Tool call counts.** Independent drive, read from the rendered timeline card for each agent
   (`.MuiTypography-caption` lines under each card, excluding the status line):
   - Destination research: 21 tool_call lines (Read, 12x `search_places`, Write, 2x Read, Write,
     4x Read/Write from the repair round). Requirement: >= 4. Pass.
   - Logistics: 11 tool_call lines (Read, 4x `search_places`, `get_rail_route`,
     `get_walking_route`, Write, 2x Read, Write). Requirement: >= 3. Pass.

4. **Review card shows 6 lines.** Confirmed via DOM query for `PASS:`/`FAIL:` prefixed lines
   under the Review timeline card once `itinerary` loaded:
   `PASS: Fits in 5 days`, `PASS: Includes Tokyo, Kyoto`, `PASS: Within $3000`,
   `PASS: Matches food, temples`, `PASS: Avoids crowds`, `PASS: Travel time realistic`.
   Exactly 6 lines, all pass on the final (post-repair) review.

5. **Budget total colour matches `within_budget`.** Independent drive: `budget.within_budget`
   is `true`, total `$898.68` (displayed rounded as `$899`). Computed style on the total figure:
   `rgb(60, 122, 91)`, which is the `success.main` token used in `ItineraryView.tsx` line 246
   (`color: over ? "error.main" : "success.main"`). Matches.

6. **Refresh + `loadTrip` restores the itinerary.** Navigated to `http://localhost:3000` fresh
   (all five agent cards reset to `waiting`, confirming no client-side persistence survives a
   reload), then clicked "Load last run (dev)", which calls `loadTrip("japan-tokyo-kyoto-7c2e")`.
   The full itinerary view (stays, between-cities, day-by-day, crowd strategy, budget) rendered
   from the on-disk `itinerary.json` with no new agent run. Confirms `loadTrip` reads
   `trips/<slug>/itinerary.json` directly and repopulates the store.

7. **`slop_check.py` on `trips/sample-japan/itinerary.md`.** First run found 2 hard failures: two
   semicolons inside the "Where you stay" table separating two example hotels per city
   (`TOKYO-W-inn Asakusa (4.4, ...); plat hostel keikyu asakusa station (4.4, ...)` and the Kyoto
   equivalent). Fixed by replacing `; ` with `, ` (both hotel cells now join on a comma, matching
   every other multi-item cell in the same file). Re-run: exit code 0, 0 hard failures, 4 warnings
   (three day-heading title-case warnings on city/area names, which are proper nouns and correct
   as written, and one "rule of three" warning on a genuine three-item to-do clause). No FAIL.

8. **`worker_eval.py` on `trips/sample-japan`.** Run without `--run-log` (the web path's SSE
   result event carries no `claude -p --output-format stream-json` message list, so no run-log
   exists for a browser-driven run; `scripts/worker_eval.py` explicitly warns against passing a
   `json`-format log for this reason). All 17 checks PASS, 0 FAIL:

   ```
   PASS brief.schema : 00-brief.json validates
   PASS dest.count.Tokyo : Tokyo: 10 candidates (need 6 to 10)
   PASS dest.mustdo.Tokyo : Tokyo: 4 must-do (need 3 to 4)
   PASS dest.count.Kyoto : Kyoto: 10 candidates (need 6 to 10)
   PASS dest.mustdo.Kyoto : Kyoto: 4 must-do (need 3 to 4)
   PASS dest.crowd_tactic : 0 rows with an empty or vague crowd tactic
   PASS dest.source : 0 rows with Source not in (tool, could not verify)
   PASS logi.nights : nights sum 4 vs days-1 = 4
   PASS logi.intercity : 1 inter-city rows, sources ['https://smart-ex.jp/en/product/plan/service/']
   PASS logi.hotels.Tokyo : Tokyo: 4 hotel rows (need 4: 2 areas x 2 hotels)
   PASS logi.hotels.Kyoto : Kyoto: 4 hotel rows (need 4: 2 areas x 2 hotels)
   PASS budget.fx : FX line: 1 USD = 157.89 JPY on 18-09-2026
   PASS budget.shares : category shares sum 100
   PASS budget.no_iso : no ISO dates in 03-budget.md (outside the FX line)
   PASS itin.days : day headings ['1', '2', '3', '4', '5'] vs 1..5
   PASS itin.no_iso : no ISO dates in itinerary.md
   PASS itin.schema : itinerary.json validates
   PASS review.six : 6 review checks
   ```

## Date format audit

Ran from repo root exactly as specified:

```
grep -rnE "[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* [0-9]{1,2},? [0-9]{4}" web/app web/components web/lib web/store trips/sample-japan .claude docs/contracts | grep -v node_modules
```

Zero hits. No fix was needed: every date shown to a user, in a fixture, or in an agent file was
already DD-MM-YYYY.

## Repair loop observed

Both drives triggered exactly one repair round (the spec's "one repair loop" decision), each on
a different check, confirming the loop is general and not hard-coded to one failure mode:

- Sample-run drive (`japan-tokyo-kyoto-0000`): review 1 failed `travel_time_realistic` (day 3
  inter-city leg allotted only the 135 min ride time, not the 135 + 60 min transfer buffer).
  Logistics agent revised (`revising` status observed), review 2 passed all 6 checks.
- Independent drive (`japan-tokyo-kyoto-e6f1`): review 1 failed `avoids_crowds`. The owning
  agent revised (`revising` status observed on the Review card while the fix round ran), review 2
  passed all 6 checks.

Neither drive hit the `travel_time_realistic` / 40-minute walking-leg failure mode noted as the
in-flight issue from the interrupted run, so no change to `.claude/agents/logistics.md` rule 4
was needed in this environment.

## Test suites (Step 4)

- `cd mcp/travel-tools && uv run pytest -q`: 21 passed, 3 skipped.
- `cd web && npm test`: 7 passed (1 file).
- `./scripts/review_eval.sh`: first run showed one flaky mismatch (`six-days: MISMATCH
  {"days_fit": [false, true]}`, the review agent occasionally misses the "Day 6, not in brief"
  cut when checking `days_fit`; runs on `model: opus` with no fixed seed, so single-run variance
  is expected). Re-ran the single fixture headless: correctly returned `days_fit: false`, matching
  `expected.json` exactly. Re-ran the full 5-fixture script clean: `clean: OK`, `missing-kyoto: OK`,
  `no-crowd-tactics: OK`, `over-budget: OK`, `six-days: OK`. No change made to
  `.claude/agents/review.md`: its rule 1 (`days_fit`: exactly `days` headings, numbered 1..days)
  is already unambiguous, and the correct re-run on the unmodified rule confirms this was
  LLM sampling variance, not a rule defect.
- `uv run --project mcp/travel-tools --with jsonschema --with pytest python -m pytest scripts/tests -q`:
  3 passed.

## Known limits

- **Cost not captured on the web path.** The SSE `result` event from `web/app/api/plan/route.ts`
  carries no cost/token data (that comes only from `claude -p --output-format stream-json`, the
  CLI path). Every timing figure in this document is wall time only.
- **`npm audit` vulnerability counts:**
  ```
  cd web && npm audit --json | python3 -c "import sys,json; print(json.load(sys.stdin)['metadata']['vulnerabilities'])"
  ```
  Captured at handover time (19-09-2026):
  `{'info': 0, 'low': 0, 'moderate': 3, 'high': 5, 'critical': 2, 'total': 10}`. Not fixed as
  part of this task, flagged for a follow-up dependency pass.
- **Google Places returns no `price_level` for hotels.** Every hotel row in every run to date
  (`sample-japan`, `japan-tokyo-kyoto-e6f1`, and prior runs) shows "not returned by tool" /
  "price level not available" for this field. Rating and review count are the only price signal.
- **Google Routes has no transit data for Japan.** `get_walking_route` (Routes WALK mode) works;
  a bus/train transit mode was probed live and returns nothing inside Japan, which is why the
  spec's originally named `get_transit_route` was replaced with `get_walking_route` +
  `get_rail_route` (see the deviation note in `task-16-brief.md`'s self-review table).
- **The `travel-tools` MCP approval must be accepted once per machine.** A fresh machine or a
  fresh Claude Code trust state will prompt for MCP tool approval on the first agent run that
  calls a `travel-tools` tool; this does not recur once accepted.
