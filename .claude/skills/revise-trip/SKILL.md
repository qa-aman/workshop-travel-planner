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
