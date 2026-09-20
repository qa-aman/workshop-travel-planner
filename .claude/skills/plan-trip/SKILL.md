---
name: plan-trip
description: Run the full multi-agent travel planning flow for a natural-language trip request, for any destination, cities, budget, currency, likes and avoids the user gives. Use when the user asks to plan a trip, says /plan-trip, or gives a request like "5 days in Japan, Tokyo and Kyoto, $3,000, love food and temples, hate crowds" or "5 days in France, Paris and Lyon, $3,000, love food, hate crowds".
---

# /plan-trip

Request: $ARGUMENTS

You are the Orchestrator. Follow these steps in order. Announce each step in one line as you start it so the UI and the terminal both show progress.

## Step 1: Brief

Parse the request into `trips/<slug>/00-brief.json` using the shape in `docs/contracts/brief.schema.json`. Slug = lowercase destination and cities joined by hyphens, plus 4 hex chars taken from the current time: use the last four hex digits of the minute-level timestamp as you know it, or, if unsure, the fixed suffix `0000` when `trips/<base>-0000/` does not exist yet, else `0001`, and so on. Never spend more than one attempt on the suffix. Example: `japan-tokyo-kyoto-a1f3`. If the request has no dates, `start_date` is null. Days come from the request, cities from the request in the order given. Likes and avoids are short nouns.

If destination, days or budget are missing from the request, stop and ask the user for the missing one. Do not guess.

## Step 2: Fan out (parallel)

In ONE message, launch these three subagents at the same time, each with the prompt `Brief: trips/<slug>/00-brief.json`:
1. `destination-research`
2. `logistics`
3. `budget`

Wait for all three. Each returns three lines. Do not read their files yet. If a subagent returns an error instead of three lines, write `## <section> unavailable` for that section in the draft and continue, the review will flag it.

## Step 3: Synthesise

Read `01-destinations.md`, `02-logistics.md`, `03-budget.md`. Write `trips/<slug>/04-itinerary-draft.md` using `itinerary-template.md` in this skill folder. Rules:
1. Each day sits in the base area from the logistics day skeleton. Fill morning, afternoon, evening from destinations, must-do first, keeping each day inside one zone. Every morning, afternoon and evening slot must name a venue from 01-destinations.md. Use Nice-to-have rows to fill gaps. A `free` slot is allowed only on the departure day's last slot.
2. Every slot copies its crowd tactic and Source from the destinations file. For `transit` and `free` slots the crowd tactic is `n/a, not a venue`. Schedule each venue in the slot its crowd tactic names: a tactic that says arrive at opening, 06:30, 07:00 or before 09:00 goes in the morning slot, a tactic that names lunch or early afternoon goes in the afternoon slot, an evening tactic goes in the evening slot. If the tactic and the slot cannot agree, pick another venue.
3. Inter-city day: put the train/transit as a `transit` slot with the duration and fare converted to USD at the budget file's rate, `source` copied from 02-logistics.md's Inter-city Source column for that route (`seed` for a Japan route from the seeded fare table, `tool` for a live Google Routes TRANSIT result elsewhere, or `could not verify` if the route could not verify). Never hardcode `seed`, the source depends on which route it is.
4. Budget section: multiply the budget price bands by counts (nights, days, attraction/activity entries you actually scheduled, one inter-city transfer) using the MIDPOINT of each band. Show every line with its basis. Total it. Compare to the limit. When a line item has both a tool or seed value and an estimate band, use the tool or seed value and say so in the basis. Example: the inter-city fare from 02-logistics.md (seed or tool, whichever it is) over the budget band midpoint.
5. Anything "could not verify" stays labelled so.
6. Kind column is always one of `food`, `temple`, `sight`, `transit`, `free`, matching `itinerary.schema.json`'s `kind` enum exactly, never a value outside it. `food` for anything edible. `temple` only for an actual temple, shrine or equivalent religious site. `sight` for every other non-food attraction, whatever the destination: a museum, landmark, park, mural, market, palace, cathedral, monument, viewpoint, all get `sight`, not a new kind invented for the occasion. `transit` for an inter-city or transfer leg. `free` for unscheduled time.

## Step 4: Review

Launch the `review` subagent with the prompt `Brief: trips/<slug>/00-brief.json. Draft: trips/<slug>/04-itinerary-draft.md`. It writes `05-review.json`.

## Step 5: Repair loop (at most once)

If `05-review.json` has `pass: false`:
1. For each entry in `failures`, launch the named `owner` subagent again with the prompt `Brief: trips/<slug>/00-brief.json. Revision request for <check_id>: <instruction>. The affected slot is <day and when, if the reason names one>. Update your file in place and say what you changed.` Launch them in one message if more than one. If an entry's owner is `orchestrator`, do not launch a subagent. Fix the draft yourself in Step 2 of this loop, following the instruction.
2. Re-run Step 3 into the same draft file.
3. Re-run Step 4.
Whether it passes or not now, continue. Do not loop again.

## Step 6: Final

1. Copy the draft to `trips/<slug>/itinerary.md`. If the last review still fails, add a `## Warnings` section at the top listing each failing check's reason. If the total is under 75% of the limit, add a `## Headroom` section after Budget listing the budget file's spend-here lines.
2. Write `trips/<slug>/itinerary.json` matching `docs/contracts/itinerary.schema.json`. `generated_on` is today in DD-MM-YYYY. Map the draft to the schema as follows:
   - `title`: the H1 of the draft.
   - `days[]`: one per `## Day N` section; `slots[]` from the table rows, `when` from the first column, `kind` from the Kind column, `crowd_tactic` from the Crowd tactic column, `transit_min_from_prev` from the transit column ONLY (integer or null, and a transit cell reading "could not verify" makes `transit_min_from_prev` null and never changes `source`), `est_cost_usd` from the Est. USD column (number or null), `source` from the Source column ONLY. Never copy text from the transit column into `source`.
   - `stays[]`: from the "Where you stay" table; `examples[]` split the "Example hotels (rating, price level)" cell into `name`, `rating` (number or null), `price_level` (string or null).
   - `intercity[]`: one row per "Getting between cities" table row, always written even when could not verify. `duration_min` is the Duration min column as an integer, or `null` when that cell reads "could not verify". `fare_usd` converted at the budget FX rate, or `null` when the fare could not verify. `source` from the table's Source column.
   - `budget.lines[]`: from the Budget table, `basis` verbatim; `budget.fx` always present, `rate` null when FX could not verify, `currency` is the `<CUR>` code from 03-budget.md's FX line (never null unless FX itself could not verify, and never a hardcoded currency, it always matches whichever code the budget agent actually used for this destination).
   - `crowd_strategy[]`: the numbered lines under "How we handled crowds".
   - `review`: the last `05-review.json` verbatim. `warnings[]`: the Warnings section lines, empty array when there are none.
3. Reply with: the slug, pass or fail, total vs limit, and the path to `itinerary.md`.

## Hard rules

1. Dates DD-MM-YYYY everywhere. No em dashes.
2. Never add a place, price or time that is not in a worker file.
3. Never run the repair loop twice.
4. Never use a semicolon anywhere in any file you write. Join list items in a table cell with commas.
