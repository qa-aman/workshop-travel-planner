# AI Travel Planner, Multi-Agent System, Design

Date: 19-09-2026
Status: approved in brainstorm, pending implementation plan
Context: NextLeap workshop, live demo. Built as a real product, not a mock.

## 1. Problem

A user types one natural-language travel request, for example:

> Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.

The system returns a day-by-day itinerary, stay areas per city, inter-city logistics, a budget breakdown against the limit, and a review that confirms the plan respects every constraint in the request.

## 2. Decisions taken in brainstorm

| Decision | Choice | Why |
|---|---|---|
| Runtime | Claude Code native: orchestrator is the main session, workers are `.claude/agents/*.md` | Agents are readable markdown, same files run in terminal and UI |
| Facts | Real APIs through an MCP server, not web search | Named tools with typed JSON in and out, deterministic enough for a demo, free tiers cover it |
| Hotels | Google Places for names, areas, ratings, price level, Budget agent applies estimated nightly bands | No free API gives real Tokyo rates without a card. Amadeus test tier has no Japan coverage for activities and hotel test is documented for `LON`/`NYC` only |
| Front end | Next.js 14 one-page app, request form, live agent timeline, itinerary view | "Watch the agents work" is the point of the demo |
| Review outcome | One repair loop, then ship with warnings | Shows evaluator-optimizer without unbounded cost |
| Fan-out | Destination, Logistics, Budget in parallel as the statement says. Budget produces price bands, Orchestrator does the sum | Avoids a hidden sequential dependency on hotel choice |

## 3. Architecture

```
Browser (Next.js page)
   | POST /api/plan {request}        <-- SSE stream back
   v
Next.js route handler -> Agent SDK query({ prompt, cwd: repo root, settingSources: ['project'] })
   v
Orchestrator (main session, CLAUDE.md + /plan-trip skill)
   1. parse request            -> trips/<slug>/00-brief.json
   2. launch in parallel:
        destination-research   -> trips/<slug>/01-destinations.md
        logistics              -> trips/<slug>/02-logistics.md
        budget                 -> trips/<slug>/03-budget.md
   3. synthesise               -> trips/<slug>/04-itinerary-draft.md
   4. review                   -> trips/<slug>/05-review.json
   5. if fail: re-run only the agent(s) named in failures with the failures as input,
      re-synthesise, re-review once
   6. final                    -> trips/<slug>/itinerary.md + itinerary.json

MCP travel-tools (Python, stdio), attached via mcpServers to the three workers
```

Pattern: orchestrator-workers for the fan-out and evaluator-optimizer for the review, as described in Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), and the lead-agent fan-out from their [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system). Deliberate difference: the review can send the plan back for exactly one repair loop.

Verified against official docs:
1. The Agent SDK loads `.claude/agents/` filesystem agents, programmatic agents with the same name take precedence. [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)
2. Subagent frontmatter supports `mcpServers`, as a name reference to a server in `.mcp.json` or inline. [Subagents](https://code.claude.com/docs/en/sub-agents)
3. Token-level stream events are emitted for the main session only. Subagent output arrives as complete messages carrying `parent_tool_use_id`. [Streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output). Consequence: the UI shows per-agent status, tool calls and finished outputs, not a typewriter of every agent's text.

## 4. Agents

| Agent | Model | Tools | Input | Output contract |
|---|---|---|---|---|
| orchestrator (main session, `/plan-trip`) | sonnet | Agent, Read, Write | raw request | `00-brief.json` with destination, days, cities, budget_usd, likes[], avoids[], dates if given. Launches workers, synthesises, writes `itinerary.md` and `itinerary.json` |
| destination-research | sonnet | travel-tools: search_places, get_weather. Write | brief | `01-destinations.md`: per city 6-10 candidates tagged must-do or nice-to-have, each with name, area, why it fits the likes, crowd tactic (time of day, lesser-known alternative, or "peak, included because must-do"), Places rating, price level. Food areas listed separately. Facts come from tool results, not memory |
| logistics | sonnet | travel-tools: search_places (hotels), get_walking_route, get_rail_route. Write | brief | `02-logistics.md`: 2 stay areas per city with 2 hotel examples each (name, rating, price level), night split across cities, inter-city Shinkansen with seeded minutes and fare, day-sequence skeleton grouped by area with walking minutes between anchors |
| budget | sonnet | travel-tools: convert_currency. Read, Write | brief | `03-budget.md`: category split (stay, transport, food, activities, buffer), price bands per category in USD and JPY at today's rate, 2-3 "if over, cut here" alternatives. Every number labelled estimate or tool-verified |
| review | opus | Read only. No MCP, no Write to the plan | draft itinerary + brief | `05-review.json`: six checks, each pass or fail with a one-line reason, `failures[]` naming the owning agent. Checks: fits the day count, includes every requested city, total within budget, matches likes, every item carries a crowd tactic, travel time realistic |

Rules that hold across agents:
1. Review sees only the draft and the brief. It never sees worker reports and has no tools to fix anything. Independence by construction.
2. Each worker writes its file and returns a 3-line summary to the orchestrator. Keeps orchestrator context small, gives the UI something to show the moment a worker finishes.
3. A tool error or empty result becomes "could not verify X" in the report. Never filled from memory.
4. Sonnet for workers and for the orchestrator, Opus for review only. Changed 19-09-2026 after the first dry run cost $6.41, of which $4.71 was Opus, most of it the orchestrator's synthesis turns. The orchestrator's job is mechanical merging against a template, the review is the only place judgement sits.

## 5. MCP travel-tools

Python, FastMCP, stdio. Registered in `.mcp.json` at repo root as `travel-tools`.

| Tool | Backed by | Free tier (verified 19-09-2026) | Returns |
|---|---|---|---|
| `search_places(query, city, place_type?, max_results=8)` | [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) | 5,000 calls/month, then $32 per 1,000 ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)) | `[{name, area, lat, lon, rating, user_ratings_total, price_level, types, maps_url}]` |
| `get_walking_route(origin, destination)` | [Google Routes API, WALK mode](https://developers.google.com/maps/documentation/routes/compute_route_directions) | 10,000 calls/month, then $5 per 1,000 | `{duration_min, distance_m, source:"tool"}` |
| `get_rail_route(origin_city, destination_city)` | Seeded `data/japan_rail.json` from the official [JR Central smartEX fare table](https://smart-ex.jp/en/product/plan/service/) (ordinary reserved, regular season) | n/a, local file | `{train, duration_min, fare_jpy_reserved, fare_jpy_hikari, source:"seed", source_url}` |
| `convert_currency(amount, from, to)` | [Frankfurter](https://www.frankfurter.dev/) | Free, no key | `{amount, rate, date}` |
| `get_weather(lat, lon, start_date, end_date)` | [Open-Meteo](https://open-meteo.com/en/docs) | Free, no key | daily max, min, precipitation |

Behaviour:
1. Fail-fast: the server refuses to start without `GOOGLE_MAPS_API_KEY`.
2. Every tool returns `{error: "..."}` on API failure instead of raising, so the agent can report "could not verify".
3. Responses cached in `mcp/.cache/<sha256 of args>.json` for 24 hours. Protects the free tier across repeated demo runs.
4. `get_weather` is called only when the brief has dates.

Amendment 19-09-2026, after live probing with the repo key: Google Routes API returns no TRANSIT routes anywhere in Japan (London transit works with the identical request, Tokyo to Kyoto, Tokyo intra-city and lat/lng requests all return `{}`). The original `get_transit_route` tool is replaced by `get_walking_route` (Routes WALK mode, verified: Senso-ji to Ueno Park 1,911 m, 29 min) and `get_rail_route` (seeded from the official JR Central table: Tokyo to Kyoto Nozomi reserved ¥13,970, Hikari ¥13,650). Agents never state a metro or bus time for Japan, they give walking time or "could not verify".

Rejected sources, with the reason recorded so nobody re-evaluates them:
1. Amadeus Self-Service test tier: Tours and Activities test cities are Bangalore, Barcelona, Berlin, Dallas, London, New York, Paris, San Francisco ([source](https://github.com/amadeus4dev/data-collection/blob/master/data/tours.md)). Hotel Search test documented for `LON`/`NYC` ([source](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/test-data/)). Production needs a card.
2. Overpass (OpenStreetMap): returned 406 on two attempts from this machine, unreliable for a live demo.
3. Geoapify Places: 3,000 credits/day, no card, kept as a documented fallback for places if the Google key is ever unavailable. Not wired in v1.

## 6. Front end

`web/`, Next.js 14 App Router, TypeScript, MUI, Zustand. One page.

1. Request: textarea prefilled with the Japan example, a "Plan my trip" button.
2. Agent timeline: five cards (Orchestrator, Destination, Logistics, Budget, Review). Each shows state (waiting, running, revising, done, failed), tool calls as they happen (`search_places("quiet temples", "Kyoto")`), and the 3-line summary when done. Review card renders the six checks as a checklist.
3. Itinerary: rendered from `itinerary.json`. Day cards with morning, afternoon, evening, area, transit minutes. Stay section per city. Budget table with total against the limit, overage in red. A "how we handled crowds" strip.
4. Wiring: `POST /api/plan` calls `query()` from `@anthropic-ai/claude-agent-sdk` with `cwd` = repo root and `settingSources: ['project']`. Streams SDK messages to the browser as SSE. Messages grouped into cards by `parent_tool_use_id`. Zustand store holds run state.
5. A finished trip reloads from `trips/<slug>/itinerary.json` on refresh.

Dates everywhere in DD-MM-YYYY.

Out of scope for v1: booking, accounts, a list of past trips, embedded maps, PDF export.

## 7. Repo layout

```
workshop-travel-planner/
  CLAUDE.md                       orchestrator behaviour + project rules
  .mcp.json                       travel-tools registration
  .env.example                    GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY
  .claude/
    agents/                       destination-research.md, logistics.md, budget.md, review.md
    skills/plan-trip/SKILL.md     /plan-trip "<request>", terminal entry point
    claude-sessions-registry.md
  mcp/travel-tools/               server.py, tools/{places,routes,currency,weather}.py, tests/, .cache/
  web/                            app/page.tsx, app/api/plan/route.ts, components/, store/
  trips/                          one folder per run, gitignored except trips/sample-japan/
  docs/superpowers/specs/         this document
```

## 8. Error handling

1. Google key missing or invalid: MCP does not start, UI shows one clear message, nothing runs half-way.
2. Tool failure or empty result: `{error}` returned, agent writes "could not verify X". Review treats an unverified must-do as a warning, not a fail.
3. Worker agent error or timeout: orchestrator marks the section "unavailable" and proceeds. Review fails the related check, which triggers the single repair loop on that agent.
4. Over budget after the repair loop: itinerary ships with the overage in red and Budget's cheaper alternatives listed. Never silently trimmed.
5. SSE drop: the run continues on disk, the page reloads from `itinerary.json`.

## 9. Testing

1. MCP tools: unit tests on recorded fixtures (one Tokyo Places response, one Tokyo to Kyoto transit response), offline and free. One live smoke test behind `LIVE_API_TESTS=1`.
2. Review agent: five fixture drafts (clean, over budget, missing Kyoto, six days, no crowd tactics) with the expected pass or fail per check.
3. End to end: one committed sample run `trips/sample-japan/` from the real example request, used by the UI in dev without API spend. Before handover the real flow is driven in a browser and every card is checked to update.
4. No tests for UI glue or the orchestrator prompt beyond the sample run.

## 10. Success criteria

1. The example request produces, in one run, an itinerary that passes all six review checks, with every place name traceable to a `search_places` result and the Tokyo to Kyoto leg traceable to a `get_rail_route` result.
2. The same run works from the terminal (`/plan-trip`) and from the web page, using the same agent files.
3. A full run stays within free API tiers, under 4 minutes, and every intermediate artifact is readable in `trips/<slug>/`.
