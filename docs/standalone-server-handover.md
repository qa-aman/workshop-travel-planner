# Phase 2: a standalone server with no dependency on Claude Code

Date: 19-09-2026. Status: deferred until the v1 build (Tasks 12 to 16) is done. Decision D-023 in `docs/decisions.md`.

## 1. Why this exists

v1 runs on Claude Code by design (D-001): the orchestrator is a Claude Code session, the four agents are `.claude/agents/*.md` subagents, `/plan-trip` is a skill, and the web app drives Claude Code through the Agent SDK. That is the workshop's teaching point. It also means the product can only run where Claude Code runs and can only call Claude models.

Phase 2 removes that dependency: the same product as a plain local server you start with one command, on any model provider with function calling, Gemini included.

## 2. What "no dependency on Claude Code" means in this codebase

| Layer | v1 (today) | Phase 2 (standalone server) |
|---|---|---|
| Orchestrator | `/plan-trip` skill, run by a Claude Code session | A Python function (FastAPI): parse brief, fan out with `asyncio.gather`, synthesise, review, one repair loop. About 300 to 400 lines |
| The four agents | `.claude/agents/*.md`, run by Claude Code | The same markdown becomes the system prompt of four API calls. Files stay readable, the runtime is your code |
| Tools | MCP server, called by Claude Code | Same Python functions (`search_places`, `get_walking_route`, `get_rail_route`, `convert_currency`, `get_weather`) called directly, no MCP process. Exposed to the model as function-calling tool definitions |
| Model provider | Claude only | Any model with function calling: Claude API, Gemini API, others |
| Web app | Next.js calls the Agent SDK | Next.js calls the FastAPI server over SSE, or FastAPI serves the page itself |
| Auth | Claude Code login (covered by the plan) | An API key of the chosen provider, billed per token |
| Terminal path | `/plan-trip` in Claude Code | Gone, or a thin `python -m planner "<request>"` CLI |

## 3. What carries over untouched (about 70% of v1)

1. `mcp/travel-tools/travel_tools/*.py` and its 21 tests. Import the functions directly.
2. `mcp/travel-tools/data/japan_rail.json` and the 24-hour cache.
3. `docs/contracts/*.schema.json`: the brief, review and itinerary shapes.
4. The four agent prompts (strip the YAML frontmatter, keep the body).
5. `.claude/skills/plan-trip/itinerary-template.md` and the Step 3 synthesis rules and Step 6 field mapping from `SKILL.md`, which become code.
6. `tests/review-fixtures/` and `scripts/worker_eval.py` (Task 11b): both evaluate output files, not the runtime.
7. `web/lib/types.ts`, `web/components/*`, `web/store/run-store.ts`: the UI only consumes `AgentEvent` objects over SSE. Only `web/app/api/plan/route.ts` and `web/lib/sdk-to-events.ts` change.

## 4. What is lost

1. The workshop demo of real Claude Code subagents, skills and MCP in files participants can open.
2. The `/plan-trip` terminal path.
3. Model calls covered by the Claude Code plan. Phase 2 pays per token on whichever provider.
4. Reviewer independence "by construction" (the review subagent has no tools because Claude Code enforces its `tools:` list). In code, independence is a discipline: the review call must be given no tools and only the brief and draft. Write a test for it.

## 5. What is gained

1. Provider freedom. Gemini becomes a configuration choice.
2. No Claude Code on the machine that runs the server.
3. Deterministic orchestration, unit-testable line by line: parallel fan-out is `asyncio.gather`, the repair loop is an `if`, the field mapping is a function with fixtures.
4. Per-token cost visible per agent call in your own logs.

## 6. Build outline (two to three days)

| Step | Work | Reuses |
|---|---|---|
| 1 | `server/` FastAPI app, `POST /plan` streaming SSE `AgentEvent` JSON, `GET /trips/{slug}` | `web/lib/types.ts` event shape |
| 2 | `server/providers/`: one adapter interface (`complete(system, messages, tools) -> (text, tool_calls)`) with a Claude adapter and a Gemini adapter | none, about 80 lines each |
| 3 | `server/tools.py`: wrap the five `travel_tools` functions as tool definitions (name, description, JSON schema) | `travel_tools/*` |
| 4 | `server/agents.py`: load the four prompts from `.claude/agents/*.md` (body only), run a tool-calling loop per agent, write the same `01-`, `02-`, `03-`, `05-` files | agent markdown |
| 5 | `server/orchestrator.py`: brief parse, `asyncio.gather` fan-out, synthesise from the template, review, one repair, write `itinerary.md` and `itinerary.json` | SKILL.md steps, template, contracts |
| 6 | `web/app/api/plan/route.ts` becomes a proxy to `POST /plan`, `sdk-to-events.ts` is deleted, the store is unchanged | UI as is |
| 7 | Tests: provider adapters with recorded responses, orchestrator with stubbed agents, review independence (no tools passed), `worker_eval.py` over a real run | fixtures, eval |

## 7. Restrictions to check before starting

1. Gemini function-calling tool schemas differ from Claude's (`parameters` vs `input_schema`). The adapter hides this; do not leak provider shapes into `agents.py`.
2. Gemini free-tier rate limits are low. A run makes about 20 model calls in parallel bursts. Check quota before a demo.
3. The "official sources only" rule still applies: hotel and place facts come from Google Places, never from the model's memory, on any provider.
4. Keep the `could not verify` contract. It is what makes the output trustworthy, and it is provider-independent.

## 8. Decision to take when starting

Which provider first. Claude API adapter first proves the refactor with known-good behaviour, then Gemini adapter proves provider freedom. Doing Gemini first mixes two unknowns.
