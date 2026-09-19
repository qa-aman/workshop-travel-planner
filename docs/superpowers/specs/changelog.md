# Spec Changelog

Every change to `19-09-2026-travel-planner-multi-agent-design.md` after its approval is logged here, newest first. The rule: if the build deviates from the spec, edit the spec and add a row here in the same commit. A change in the spec without a row here, or a row here without the spec edit, is a defect.

Each row answers: when, which section, what changed, why, what triggered it, and the decision ID in `docs/decisions.md` if there is one.

| Date | Section | Change | Why | Trigger | Decision |
|---|---|---|---|---|---|
| 19-09-2026 | 9 Testing | Worker and orchestrator eval added | Nothing evaluated the three workers or the orchestrator, only the review agent | Aman asked whether evals existed after the first dry run | D-024 |
| 19-09-2026 | 4 Agents | Orchestrator model changed from Opus to Sonnet. Review stays Opus | First dry run cost $6.41, $4.71 of it Opus. The orchestrator merges worker files against a template, which does not need Opus | Aman's instruction after reading the dry-run results page | D-019 |
| 19-09-2026 | 5 MCP travel-tools, 3 Architecture, 4 Agents, 10 Success criteria | `get_transit_route` (Google Routes TRANSIT) replaced by `get_walking_route` (Routes WALK) and `get_rail_route` (seeded from the official JR Central smartEX fare table). Logistics agent tool list and inter-city output updated. Success criterion 1 now traces the Tokyo to Kyoto leg to `get_rail_route` | Routes API returns no transit routes inside Japan. Control test: London transit works with the identical request, Tokyo to Kyoto, Tokyo intra-city and lat/lng requests return `{}`. WALK mode works in Tokyo (Senso-ji to Ueno Park, 1,911 m, 29 min) | Live probe with the repo key during plan writing, at the user's request to check API access | D-009 |
| 19-09-2026 | 5 MCP travel-tools, 7 Repo layout (implied) | Environment variable: code accepts `GOOGLE_MAPS_API_KEY` and falls back to `GOOGLE_MAPS_API` | The repo `.env` already used the shorter name | Found while probing the key | D-010 |
| 19-09-2026 | (process, no spec section) | This changelog and `docs/decisions.md` created. Plan Global Constraint 11 and `CLAUDE.md` now require both to be updated with every deviation | Subagents executing the plan do not see the conversation where decisions were made, so the reason must live in a file | User instruction before execution started | D-011 |
| 19-09-2026 | all | Spec approved after four-section review in brainstorm | Baseline | Brainstorm session | D-001 to D-008 |
