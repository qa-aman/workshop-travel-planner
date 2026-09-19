# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AI Travel Planner

Multi-agent travel planner built for a NextLeap workshop. Orchestrator = this session. Workers = `.claude/agents/`.
Facts come from the `travel-tools` MCP server, never from memory.

## Rules

1. Dates in every output: DD-MM-YYYY.
2. No em dashes, no emojis.
3. A tool error is reported as "could not verify <thing>". Never invent a place, price or time.
4. Every run writes to `trips/<slug>/`. Slug = lowercase destination and cities joined by hyphens plus a 4-char hash, e.g. `japan-tokyo-kyoto-a1f3`.
5. Prices are estimates unless a tool returned them. Say which.
6. Decisions go in `docs/decisions.md` the moment they are made. Any deviation from the spec in `docs/superpowers/specs/` is written into the spec and logged in `docs/superpowers/specs/changelog.md` in the same commit, with the reason.
7. Every correction from Aman is recorded in `docs/feedback.md` in the same turn, as a class of mistake with the check that prevents it. Read that file before starting work.
8. Commits: lowercase imperative, under 72 chars, trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## How the system fits together

One request, five agents, one MCP server, artifacts on disk. The full picture is in `docs/architecture.md`, the reasoning in `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md`.

1. **Entry points.** Terminal: `/plan-trip "<request>"` (`.claude/skills/plan-trip/SKILL.md`). Web: `web/app/api/plan/route.ts` calls the Agent SDK `query()` with `cwd` = repo root and `settingSources: ["project"]`, so it runs the same skill, agents and `.mcp.json` as the terminal. There is one procedure, in the skill file. Do not duplicate it in code or here.
2. **Fan-out.** The orchestrator (main session, Opus) writes `trips/<slug>/00-brief.json`, then launches `destination-research`, `logistics` and `budget` (Sonnet) in one message so they run in parallel. Each writes its own file (`01-`, `02-`, `03-`) and returns three lines. The orchestrator synthesises `04-itinerary-draft.md` from the three files.
3. **Gate.** `review` (Opus) reads only the brief and the draft, has no MCP tools, and writes `05-review.json` with six pass/fail checks. On fail the orchestrator re-runs only the agents named in `failures[]`, once, then ships `itinerary.md` and `itinerary.json` with warnings if still failing.
4. **Facts.** `mcp/travel-tools/server.py` exposes five tools: `search_places` (Google Places Text Search), `get_walking_route` (Google Routes, WALK mode), `get_rail_route` (seeded `data/japan_rail.json` from the official JR Central fare table), `convert_currency` (Frankfurter), `get_weather` (Open-Meteo). Google Routes has no transit data for Japan, which is why rail is seeded and agents never state a metro or bus time. Every response is cached 24h in `mcp/travel-tools/.cache/`. Every tool returns `{"error": ...}` instead of raising.
5. **Contracts.** JSON shapes for the brief, the review and the itinerary live in `docs/contracts/`. Agent files, the skill, the review fixtures and `web/lib/types.ts` all follow them. Change a shape there first.
6. **Web.** `web/lib/sdk-to-events.ts` maps SDK messages to per-agent events using `parent_tool_use_id`. `web/store/run-store.ts` holds one run. Subagent output arrives per message, not per token, so the timeline updates at message granularity.

## Commands

| Task | Command |
|---|---|
| Plan a trip from the terminal | `claude` then `/plan-trip Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.` |
| MCP unit tests (offline, fixtures) | `cd mcp/travel-tools && uv run pytest -q` |
| One MCP test | `cd mcp/travel-tools && uv run pytest tests/test_places.py::test_search_places_maps_fields -q` |
| MCP live smoke (spends real calls) | `set -a && source .env && set +a && cd mcp/travel-tools && LIVE_API_TESTS=1 uv run pytest tests/test_live.py -q` |
| Run the MCP server by hand | `uv run --project mcp/travel-tools python mcp/travel-tools/server.py` (reads the Google key from the environment or repo `.env`) |
| Check Claude Code sees the server | `claude mcp list` |
| Review agent eval (runs `claude -p` five times) | `./scripts/review_eval.sh` |
| Web dev server | `cd web && npm run dev` then http://localhost:3000 |
| Web unit tests | `cd web && npm test` |
| Date format audit before handover | `grep -rnE "[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* [0-9]{1,2},? [0-9]{4}" web/app web/components web/lib web/store trips/sample-japan .claude docs/contracts` |

Environment: `.env` at repo root holds `GOOGLE_MAPS_API_KEY` (code also accepts `GOOGLE_MAPS_API`) and `ANTHROPIC_API_KEY` (web path only, the terminal uses the Claude Code login). Python is 3.12 via uv, Node 26.

## Where things are decided

| File | What it holds |
|---|---|
| `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md` | The approved design. Binding. |
| `docs/superpowers/specs/changelog.md` | Every change to the spec after approval, with the reason and trigger. |
| `docs/superpowers/plans/implementation-plan.md` | The 16-task build plan with tests and code. |
| `docs/decisions.md` | Every decision a reasonable engineer could have made differently. |
| `docs/feedback.md` | Every correction from Aman, as a class with a check. |
| `docs/tech-stack.md` | Libraries, versions, APIs with verified free tiers, rejected APIs. |
| `docs/architecture.md` | Diagrams, components, data flow, failure table, testing map. |

## Orchestration

The planning procedure lives in `.claude/skills/plan-trip/SKILL.md`. Both the terminal (`/plan-trip`) and the web app (Agent SDK) run that procedure. Do not duplicate it here. Agent contracts are in `docs/contracts/`.
