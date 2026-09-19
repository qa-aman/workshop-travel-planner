# Tech Stack

Date: 19-09-2026. Derived from `docs/superpowers/plans/implementation-plan.md`. Every version and free-tier figure below was checked on that date.

## 1. Summary

| Layer | Choice | Version | Why this and not the alternative |
|---|---|---|---|
| Agent runtime | Claude Code, filesystem agents in `.claude/agents/` | 2.1.278 | Agents are markdown a PM can read. The same files run from the terminal and from the web app. Rejected: agents defined in TypeScript (loses the terminal path and the readable-file demo moment). |
| Orchestration entry | `.claude/skills/plan-trip/SKILL.md` | n/a | One command in the terminal, one prompt string from the SDK. The procedure lives in one file. |
| Web to agents bridge | `@anthropic-ai/claude-agent-sdk` (TypeScript) | bundled with Claude Code 2.1.278 | Loads `.claude/agents`, `.mcp.json` and `CLAUDE.md` via `settingSources: ["project"]`. `forwardSubagentText: true` gives per-agent messages tagged with `parent_tool_use_id`. Rejected: shelling out to `claude -p` (no structured message stream). |
| Tool server | Model Context Protocol, Python SDK `mcp` | `>=2,<3` | Named tools with typed inputs, visible in the UI as `search_places("quiet temples", "Kyoto")`. Rejected: Bash + curl scripts (shell noise in the UI, harder to permission). |
| Python runtime | Python via uv | 3.12, uv 0.10 | Machine default is 3.9, uv pins 3.12 per project with no global change. |
| HTTP client | `httpx` | `>=0.27` | Sync, simple, mockable with `respx` in tests. |
| Python tests | `pytest` + `respx` | `>=8`, `>=0.21` | Recorded fixtures, offline, free. One live suite behind `LIVE_API_TESTS=1`. |
| Web framework | Next.js, App Router | 14 | Route handler streams SSE from the SDK generator. Matches the standard stack for this workspace. |
| UI kit | MUI | latest 5.x | Cards, chips, tables without hand-rolled CSS. |
| State | Zustand | latest 4.x | One store holds the run: agent status, tool calls, itinerary. |
| Web tests | Vitest | latest | Unit tests on the SDK-to-event mapper only. UI glue is not tested. |
| Node | Node.js | 26.8 | Installed on the machine. |

## 2. External APIs

| Need | API | Auth | Free tier | Verified on 19-09-2026 |
|---|---|---|---|---|
| Temples, food areas, sights, hotels | [Google Places API (New), Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) | `GOOGLE_MAPS_API_KEY` (repo `.env` uses the name `GOOGLE_MAPS_API`, code accepts both) | 5,000 Text Search Pro calls per month, then $32 per 1,000 ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)) | Returned Kiyomizu-dera, To-ji, Tenryu-ji for "quiet temples in Kyoto" |
| Walking time between anchors | [Google Routes API, WALK mode](https://developers.google.com/maps/documentation/routes/compute_route_directions) | same key | 10,000 Compute Routes Essentials calls per month, then $5 per 1,000 | Senso-ji to Ueno Park: 1,911 m, 29 min |
| Shinkansen between cities | Seeded file `mcp/travel-tools/data/japan_rail.json`, sourced from the official [JR Central smartEX fare table](https://smart-ex.jp/en/product/plan/service/) | none | n/a | Tokyo to Kyoto, Nozomi reserved ordinary, regular season: ¥13,970. Hikari: ¥13,650 |
| USD to JPY | [Frankfurter](https://www.frankfurter.dev/) | none | Free, no key | 1 USD = 157.89 JPY on 18-09-2026 |
| Weather for dated trips | [Open-Meteo](https://open-meteo.com/en/docs) | none | Free, no key | Kyoto forecast returned |

### Why Google Routes transit mode is not used

Routes API transit returns an empty response for every request inside Japan. Tested on 19-09-2026 with the repo key: London King's Cross to Paddington returned a Hammersmith & City Line route with the identical request shape, while Tokyo Station to Kyoto Station, Asakusa to Shibuya, and a lat/lng pair in Tokyo all returned `{}`. Drive and walk modes work in Japan. Google's coverage table is JS-rendered so the Japan row could not be quoted, but a Google developer forum thread reports `TRANSIT` missing from `available_travel_modes` in Japan ([discuss.google.dev](https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267)). The agents therefore give walking minutes from the tool and say "could not verify" for any metro or bus timing.

### Rejected APIs, with the reason

1. Amadeus Self-Service test tier: Tours and Activities test data covers Bangalore, Barcelona, Berlin, Dallas, London, New York, Paris and San Francisco only ([source](https://github.com/amadeus4dev/data-collection/blob/master/data/tours.md)). Hotel Search test data is documented for `LON` and `NYC` ([source](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/test-data/)). Production needs a card on file.
2. Overpass (OpenStreetMap): returned HTTP 406 on two attempts from this machine. Not reliable enough for a live demo.
3. Geoapify Places: 3,000 credits per day, no card ([pricing](https://www.geoapify.com/pricing/)). Kept as a documented fallback for places if the Google key is unavailable. Not wired in v1.
4. Real hotel prices: no free API gives bookable Tokyo rates without a card. Hotels use Places names, ratings and `price_level`, and the Budget agent applies estimated nightly bands labelled as estimates.

## 3. Models per agent

| Agent | Model | Reason |
|---|---|---|
| Orchestrator (main session) | Sonnet | Merges worker files against a template. Changed from Opus on 19-09-2026 after the first dry run cost $6.41 with $4.71 on Opus (D-019). Start the terminal with `claude --model sonnet`. |
| destination-research | Sonnet | Tool calling and extraction. |
| logistics | Sonnet | Tool calling and extraction. |
| budget | Sonnet | Arithmetic over bands, one FX call. |
| review | Opus | Independent judgement, no tools, six checks. |

## 4. Environment and secrets

```
.env                 GOOGLE_MAPS_API (existing), ANTHROPIC_API_KEY (for the web app)
.env.example         committed template
web/.env.local       copy for Next.js, gitignored
```

The MCP server refuses to start without a Google key. The terminal path uses the Claude Code login. The web path uses `ANTHROPIC_API_KEY` through the Agent SDK.

## 5. Cost envelope for one run

| Item | Calls per run | Monthly free | Runs before cost |
|---|---|---|---|
| Places Text Search | about 12 to 16 | 5,000 | about 300 |
| Routes WALK | about 6 to 10 | 10,000 | about 1,000 |
| Frankfurter, Open-Meteo | 1 to 3 | unlimited | n/a |
| Claude tokens | 1 Opus session + 3 Sonnet + 1 Opus subagent, one optional repair loop | n/a | billed per run |

Every API response is cached on disk for 24 hours (`mcp/travel-tools/.cache/`), so repeated demo runs of the same request cost zero API calls after the first.

## 6. Commands

| Task | Command |
|---|---|
| Plan a trip from the terminal | `claude` then `/plan-trip Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.` |
| MCP unit tests | `cd mcp/travel-tools && uv run pytest -q` |
| MCP live smoke | `set -a && source .env && set +a && cd mcp/travel-tools && LIVE_API_TESTS=1 uv run pytest tests/test_live.py -q` |
| Check Claude Code sees the server | `claude mcp list` |
| Review agent eval | `./scripts/review_eval.sh` |
| Web app | `cd web && npm run dev` then http://localhost:3000 |
| Web unit tests | `cd web && npm test` |
| Date format audit | see Task 16 of the implementation plan |
