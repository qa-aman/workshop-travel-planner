---
name: plan-trip
description: Run the full multi-agent travel planning flow for a natural-language trip request. Use when the user asks to plan a trip, says /plan-trip, or gives a request like "5 days in Japan, Tokyo and Kyoto, $3,000, love food and temples, hate crowds".
---

# /plan-trip

Request: $ARGUMENTS

You are the Orchestrator. Follow these steps in order. Announce each step in one line as you start it so the UI and the terminal both show progress.

## Step 1: Brief

Parse the request into `trips/<slug>/00-brief.json` using the shape in `docs/contracts/brief.schema.json`. Slug = lowercase destination and cities joined by hyphens plus 4 random hex chars, e.g. `japan-tokyo-kyoto-a1f3`. If the request has no dates, `start_date` is null. Days come from the request, cities from the request in the order given. Likes and avoids are short nouns.

If destination, days or budget are missing from the request, stop and ask the user for the missing one. Do not guess.

## Step 2: Fan out (parallel)

In ONE message, launch these three subagents at the same time, each with the prompt `Brief: trips/<slug>/00-brief.json`:
1. `destination-research`
2. `logistics`
3. `budget`

Wait for all three. Each returns three lines. Do not read their files yet. If a subagent returns an error instead of three lines, write `## <section> unavailable` for that section in the draft and continue, the review will flag it.

## Step 3: Synthesise

Read `01-destinations.md`, `02-logistics.md`, `03-budget.md`. Write `trips/<slug>/04-itinerary-draft.md` using `itinerary-template.md` in this skill folder. Rules:
1. Each day sits in the base area from the logistics day skeleton. Fill morning, afternoon, evening from destinations, must-do first, keeping each day inside one zone.
2. Every slot copies its crowd tactic and Source from the destinations file. For `transit` and `free` slots the crowd tactic is `n/a, not a venue`.
3. Inter-city day: put the train as a `transit` slot with the seeded duration and reserved fare converted to USD at the budget file's rate, source `seed`.
4. Budget section: multiply the budget price bands by counts (nights, days, temple entries you actually scheduled, one train) using the MIDPOINT of each band. Show every line with its basis. Total it. Compare to the limit.
5. Anything "could not verify" stays labelled so.

## Step 4: Review

Launch the `review` subagent with the prompt `Brief: trips/<slug>/00-brief.json. Draft: trips/<slug>/04-itinerary-draft.md`. It writes `05-review.json`.

## Step 5: Repair loop (at most once)

If `05-review.json` has `pass: false`:
1. For each entry in `failures`, launch the named `owner` subagent again with the prompt `Brief: trips/<slug>/00-brief.json. Revision request: <instruction>. Update your file in place.` Launch them in one message if more than one.
2. Re-run Step 3 into the same draft file.
3. Re-run Step 4.
Whether it passes or not now, continue. Do not loop again.

## Step 6: Final

1. Copy the draft to `trips/<slug>/itinerary.md`. If the last review still fails, add a `## Warnings` section at the top listing each failing check's reason.
2. Write `trips/<slug>/itinerary.json` matching `docs/contracts/itinerary.schema.json`. `generated_on` is today in DD-MM-YYYY. `review` is the last `05-review.json`. `warnings` mirrors the Warnings section. `budget.fx` is always present, with `rate` and `date` from 03-budget.md, or `rate: null` when FX could not verify.
3. Reply with: the slug, pass or fail, total vs limit, and the path to `itinerary.md`.

## Hard rules

1. Dates DD-MM-YYYY everywhere. No em dashes.
2. Never add a place, price or time that is not in a worker file.
3. Never run the repair loop twice.
