---
name: revise-trip
description: Revise an existing trip in trips/<slug>/ for a date shift, a duration change (extend or shorten), or a mid-trip cutoff (ending the trip early). Use when the user asks to change, revise, update, push back, extend, shorten, or end early a trip that was already planned, says /revise-trip, or gives a request like "push my Japan trip back by a week" or "I want to end the France trip after day 3". Never for a brand new trip, use /plan-trip for that.
---

# /revise-trip

You are the Orchestrator, running a revision instead of a fresh plan. Follow these steps in order. Announce each step in one line as you start it.

## Step 1: Load the existing trip

Read `trips/<slug>/00-brief.json` and `trips/<slug>/itinerary.json`. If either is missing, stop and tell the user no trip exists at that slug, list the slugs under `trips/` that do exist.

## Step 2: Classify

Compute today's date in DD-MM-YYYY (use the date you are told the current date is, never guess). Launch the `trip-revision` subagent with the prompt `Slug: trips/<slug>/. Today: <DD-MM-YYYY>. Revision request: <the user's request verbatim>.` It writes `trips/<slug>/revision-plan.json`.

Read `revision-plan.json`. If `needs_user_input` is non-empty, stop and ask the user each listed question. Do not guess any of them, per the same "never invent" rule as `/plan-trip`. Wait for the answer, then re-run this step with the answer folded into the revision request.

## Step 3: Apply changes, in this order: date-shift, then cutoff, then duration-change

Combined requests can produce more than one `changes[]` entry (per `trip-revision.md` rule 6). Apply them in this fixed order regardless of the order they appear in `revision-plan.json`, so later steps always see a day list that is already shifted and already cut: `date-shift` first, `cutoff` second, `duration-change` third. This order matters because duration-change's "last existing day" math (Step 5) has to run against the trip as it stands after any shift or cutoff, not before.

### 3a. Date-shift entries

For each `changes[]` entry with `type: "date-shift"`: add `shift_days` to every day's existing `date`. No day is added or removed, `affected_days` covers every day.

### 3b. Cutoff entries

For each `changes[]` entry with `type: "cutoff"`:
1. Remove every day after `cutoff_day`. Days at or before `cutoff_day` are untouched otherwise, copied as-is into the revised plan.
2. Identify each city that now has zero remaining days anywhere in the kept days, and remove its entry from `stays[]`.
3. Remove every `intercity[]` leg whose position in the day sequence falls after `cutoff_day` (the leg's own day, not the cities it names, since the same two cities can appear in more than one leg on a multi-visit itinerary such as Tokyo, Kyoto, Tokyo). A leg at or before `cutoff_day` is kept even if one of its cities no longer has any days remaining after the cutoff, since the leg itself already happened.

## Step 4: Apply duration-change entries

For each `changes[]` entry with `type: "duration-change"`:

### 4a. Extension (`delta_days` positive)

First check `target_city` against `stays[].city` in the (already shifted/cut) itinerary to decide which of the two branches below applies. `target_city` is never `null` here, per `trip-revision.md` rule 4 the classifier only leaves it `null` when it already stopped at Step 2 for `needs_user_input`.

**Existing city** (`target_city` already appears in `stays[]`):
1. If `target_city` is the last city in the day sequence, the new days are appended after the current last day: dates are the next `delta_days` consecutive dates after that last day's date, day numbers continue the existing numbering, and they extend that city's `stays[].nights`.
2. If `target_city` is not the last city, the new days are inserted immediately after that city's own last day in the sequence, not at the end of the trip. Doing this requires: (a) renumbering every day after the insertion point by `+delta_days`, (b) shifting the `date` of every day after the insertion point later by `delta_days` (each new date is the previous day's date plus one, continuing the sequence, the shift preserves the gap between consecutive days), (c) increasing `target_city`'s `stays[].nights` by `delta_days`, and (d) moving any `intercity[]` leg that departs from `target_city` so it still departs on the day immediately after the now-later last day of `target_city`'s stay.

**New city** (`target_city` does not appear in `stays[]`, per spec section 10.8): always appended at the end of the trip, never inserted mid-sequence, since nothing in the request states a position for a city that was never part of the plan. This means: (a) the new days get the next `delta_days` consecutive dates after the current last day's date, with day numbers continuing the existing numbering, no renumbering of any earlier day is needed since nothing is inserted before them, (b) a new `stays[]` entry for `target_city` with `nights: delta_days` (not an increment, this city has no prior stay), area and hotel examples to be filled by `logistics` below, (c) a new `intercity[]` leg from the itinerary's current last city to `target_city`, duration/fare/source to be filled by `logistics` below, positioned as the first of the new days.

Either branch: new days always get `reverify.destination_research: true`, `logistics: true`, `budget: true` per the classifier, so launch `destination-research`, `logistics`, and `budget` in one message (same as `/plan-trip` Step 5's repair loop) with the prompt `Brief: trips/<slug>/00-brief.json. Revision: <reason from the revision-plan entry>. Affected days: <affected_days, using the renumbered day numbers>. New dates: <the new dates for those days>. City: <target_city>. <For a new city, add:> This city is new to the trip, also find a stay area and 2 example hotels, and the rail/transit connection from <the itinerary's previous last city> to <target_city>. Update your file (01-destinations.md / 02-logistics.md / 03-budget.md) in place, adding content for these new days only, leave every other day's content untouched, and say what you changed.` Wait for all of them.

### 4b. Shortening (`delta_days` negative)

1. Remove the trailing days named in `affected_days` (the last `abs(delta_days)` days of the trip, or of `target_city`'s stay if `target_city` is set, per the classifier's `reason`).
2. If this empties a city's remaining days entirely, apply the same cleanup as cutoff Step 3b.2-3: remove that city's `stays[]` entry and any `intercity[]` leg whose position falls after the new last day.
3. `reverify.budget: true` always for a shortening, so launch `budget` (same repair-loop pattern as 4a step 4) to recompute the total. `destination_research` and `logistics` stay untouched, per the classifier, no new content is needed to remove days.

## Step 5: Re-synthesise

Re-run `/plan-trip` Step 3's synthesis rules against the (possibly updated) `01-destinations.md`, `02-logistics.md`, `03-budget.md`, but only rewrite the days and budget lines that changed. Days untouched by Step 3 or Step 4 keep their exact existing content. Recompute the Budget section's totals for the current day count and city set, same midpoint-of-band method as `/plan-trip` Step 3 rule 4. Write the result to `trips/<slug>/04-itinerary-draft.md`.

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
