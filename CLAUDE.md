# AI Travel Planner

Multi-agent travel planner. Orchestrator = this session. Workers = `.claude/agents/`.
Facts come from the `travel-tools` MCP server, never from memory.

## Rules

1. Dates in every output: DD-MM-YYYY.
2. No em dashes, no emojis.
3. A tool error is reported as "could not verify <thing>". Never invent a place, price or time.
4. Every run writes to `trips/<slug>/`. Slug = lowercase destination and cities joined by hyphens plus a 4-char hash, e.g. `japan-tokyo-kyoto-a1f3`.
5. Prices are estimates unless a tool returned them. Say which.
6. Decisions go in `docs/decisions.md` the moment they are made. Any deviation from the spec in `docs/superpowers/specs/` is written into the spec and logged in `docs/superpowers/specs/changelog.md` in the same commit, with the reason.

## Commands

- Terminal: `/plan-trip "Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds."`
- MCP tests: `cd mcp/travel-tools && uv run pytest -q`
- Web: `cd web && npm run dev`
