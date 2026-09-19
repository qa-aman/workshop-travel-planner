# AI Travel Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one natural-language travel request into a reviewed, budgeted, day-by-day itinerary using five Claude Code agents, real travel APIs through an MCP server, and a Next.js page that shows the agents working.

**Architecture:** The orchestrator is the main Claude Code session (driven by `/plan-trip` in the terminal or by the Agent SDK from Next.js). It fans out to three worker subagents in parallel (destination-research, logistics, budget), synthesises a draft, sends it to an independent review subagent, runs at most one repair loop, and writes `trips/<slug>/itinerary.md` + `itinerary.json`. Workers get facts only from a Python MCP server (`travel-tools`) wrapping Google Places, Google Routes, Frankfurter and Open-Meteo.

**Tech Stack:** Claude Code 2.1.278 (`.claude/agents`, `.claude/skills`, `.mcp.json`), Python 3.12 via uv + `mcp>=2` + `httpx` + `pytest`, Next.js 14 App Router + TypeScript + MUI + Zustand + `@anthropic-ai/claude-agent-sdk`.

**Spec:** `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md`

## Global Constraints

1. Dates in every file, fixture, UI string and mock: `DD-MM-YYYY`. Never ISO or US format. Before handover run the grep in Task 16 and fix every hit.
2. No em dashes anywhere. No emojis.
3. Facts in agent reports come from tool results. A tool error becomes the literal phrase `could not verify` in the report, never a value from memory.
4. Review agent has no MCP servers and no Write access to the plan.
5. Free-tier protection: every MCP tool response is cached 24h on disk under `mcp/travel-tools/.cache/`.
6. MCP server refuses to start without a Google key. Code reads `GOOGLE_MAPS_API_KEY`, falling back to `GOOGLE_MAPS_API` (the name already used in the repo `.env`, verified 19-09-2026).
12. UI build standard (Tasks 12 to 16): every implementer that writes or changes a React component must load the `frontend-design:frontend-design` skill before writing the first component and follow it. The MUI kit is the floor, the skill sets the visual bar: intentional typography, spacing, surfaces and states, nothing that reads as a templated default. Added 19-09-2026 at Aman's instruction.
11. Decision and spec discipline, applies to every task: (a) any choice a reasonable engineer could have made differently gets a row in `docs/decisions.md` (newest first, next `D-0NN`) in the same commit. (b) Any deviation from `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md` requires editing the spec AND adding a row to `docs/superpowers/specs/changelog.md` in the same commit, with the reason and the trigger. A task that ends with a spec deviation and no changelog row is not complete. (c) `docs/tech-stack.md` and `docs/architecture.md` are updated when a library, API, tool name or component changes.
10. Google Routes API returns no TRANSIT routes anywhere in Japan (verified 19-09-2026: London transit works, Tokyo to Kyoto, Tokyo intra-city and lat/lng requests all return `{}`). Rail data for Japan is therefore seeded from the official JR Central smartEX fare PDF, and intra-city timing uses Routes API `WALK` mode, which does work in Japan.
7. Commit messages: lowercase, imperative, under 72 chars, end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
8. Python: `uv` manages the venv, Python 3.12. Node: 26, npm.
9. Do not create README files.

---

## File map

| Path | Responsibility |
|---|---|
| `CLAUDE.md` | Project rules + orchestrator procedure (the main session's behaviour) |
| `.mcp.json` | Registers `travel-tools` stdio server |
| `.env.example` | `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY` |
| `.claude/agents/destination-research.md` | Worker: places and food, crowd tactics |
| `.claude/agents/logistics.md` | Worker: stay areas, hotels, transit, day skeleton |
| `.claude/agents/budget.md` | Worker: category split and price bands |
| `.claude/agents/review.md` | Gate: six checks, pass/fail JSON |
| `.claude/skills/plan-trip/SKILL.md` | `/plan-trip "<request>"` terminal entry |
| `.claude/claude-sessions-registry.md` | ccs registry (standard template) |
| `mcp/travel-tools/server.py` | MCPServer, registers 4 tools, fail-fast on key |
| `mcp/travel-tools/travel_tools/cache.py` | `cached(key_parts, ttl_s, fn)` |
| `mcp/travel-tools/travel_tools/http.py` | `get_json`, `post_json` returning `{error}` on failure |
| `mcp/travel-tools/travel_tools/currency.py` | `convert_currency` |
| `mcp/travel-tools/travel_tools/weather.py` | `get_weather` |
| `mcp/travel-tools/travel_tools/places.py` | `search_places` |
| `mcp/travel-tools/travel_tools/walking.py` | `get_walking_route` (Routes API, WALK mode) |
| `mcp/travel-tools/travel_tools/rail.py` | `get_rail_route` (seeded Japan rail data) |
| `mcp/travel-tools/data/japan_rail.json` | Shinkansen segments, source-cited |
| `mcp/travel-tools/tests/` | pytest, fixtures under `tests/fixtures/` |
| `scripts/review_eval.sh` | Runs review agent headless on 5 fixture drafts |
| `tests/review-fixtures/` | 5 drafts + expected results |
| `trips/sample-japan/` | Committed sample run |
| `web/` | Next.js app |
| `web/lib/types.ts` | `Itinerary`, `AgentEvent`, `RunState` types |
| `web/lib/sdk-to-events.ts` | Maps SDK messages to `AgentEvent` |
| `web/app/api/plan/route.ts` | POST, runs `query()`, streams SSE |
| `web/store/run-store.ts` | Zustand store |
| `web/components/RequestForm.tsx` | Textarea + button |
| `web/components/AgentTimeline.tsx` | Five agent cards |
| `web/components/ItineraryView.tsx` | Day cards, stays, budget table, crowd strip |
| `web/app/page.tsx` | Composes the three |

---

### Task 1: Repo scaffold, env, MCP registration, project rules

**Files:**
- Create: `.gitignore`, `.env.example`, `.mcp.json`, `CLAUDE.md`, `.claude/claude-sessions-registry.md`

**Interfaces:**
- Produces: `.mcp.json` server name `travel-tools` (referenced by name in Task 9 agent frontmatter). `CLAUDE.md` orchestrator procedure (completed in Task 10).

- [ ] **Step 1: Write `.gitignore`**

```gitignore
.env
node_modules/
.next/
mcp/travel-tools/.cache/
mcp/travel-tools/.venv/
__pycache__/
.pytest_cache/
trips/*
!trips/sample-japan/
.DS_Store
```

- [ ] **Step 2: Write `.env.example`**

```bash
# Google Maps Platform key with "Places API (New)" and "Routes API" enabled.
# The code also accepts the name GOOGLE_MAPS_API.
GOOGLE_MAPS_API_KEY=
# Used by the Agent SDK from the Next.js app. Terminal use relies on your Claude Code login.
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Write `.mcp.json`**

```json
{
  "mcpServers": {
    "travel-tools": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "--project", "mcp/travel-tools", "python", "mcp/travel-tools/server.py"],
      "env": {
        "GOOGLE_MAPS_API_KEY": "${GOOGLE_MAPS_API_KEY}",
        "GOOGLE_MAPS_API": "${GOOGLE_MAPS_API}"
      }
    }
  }
}
```

- [ ] **Step 4: Write `CLAUDE.md` (rules only, orchestration section is added in Task 10)**

```markdown
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
```

- [ ] **Step 5: Write `.claude/claude-sessions-registry.md`**

```markdown
# Claude Sessions Registry

## Registered Sessions

| Name | Session ID | Description | Registered |
|---|---|---|---|

## Quick Reference

- `ccs add <name> <pid|session-id>` register this session
- `ccs update <name> "<desc>"` update description
- `ccs list` / `ccs open <name>` / `ccs sync`

## How-to

Inside a Claude Code session prefix with `!`, e.g. `! ccs add travel-planner $$`.

## Notes

The table above is maintained by the `ccs` CLI. Do not hand-edit. Run `ccs sync` if stale.
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example .mcp.json CLAUDE.md .claude/claude-sessions-registry.md
git commit -m "add repo scaffold, env template and mcp registration

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MCP project, cache and http helpers

**Files:**
- Create: `mcp/travel-tools/pyproject.toml`, `mcp/travel-tools/travel_tools/__init__.py`, `mcp/travel-tools/travel_tools/cache.py`, `mcp/travel-tools/travel_tools/http.py`
- Test: `mcp/travel-tools/tests/test_cache.py`, `mcp/travel-tools/tests/test_http.py`

**Interfaces:**
- Produces: `cache.cached(key_parts: list, ttl_s: int, fn: Callable[[], dict]) -> dict`, `http.get_json(url, params=None, headers=None) -> dict`, `http.post_json(url, body, headers=None) -> dict`. Both http helpers return `{"error": "<message>"}` instead of raising.

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "travel-tools"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["mcp>=2,<3", "httpx>=0.27"]

[dependency-groups]
dev = ["pytest>=8", "respx>=0.21"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Create the venv and empty package**

```bash
cd mcp/travel-tools && uv python install 3.12 && uv sync && mkdir -p travel_tools tests/fixtures && touch travel_tools/__init__.py tests/__init__.py
```

- [ ] **Step 3: Write failing cache test `tests/test_cache.py`**

```python
import time
from travel_tools import cache


def test_cached_calls_fn_once_within_ttl(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    calls = []

    def fn():
        calls.append(1)
        return {"v": 1}

    assert cache.cached(["a", 1], 60, fn) == {"v": 1}
    assert cache.cached(["a", 1], 60, fn) == {"v": 1}
    assert len(calls) == 1


def test_cached_refetches_after_ttl(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    calls = []

    def fn():
        calls.append(1)
        return {"v": len(calls)}

    cache.cached(["b"], 60, fn)
    old = time.time() - 120
    for p in tmp_path.iterdir():
        import os
        os.utime(p, (old, old))
    assert cache.cached(["b"], 60, fn) == {"v": 2}


def test_cached_does_not_store_errors(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.cached(["c"], 60, lambda: {"error": "boom"})
    assert list(tmp_path.iterdir()) == []
```

- [ ] **Step 4: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_cache.py -q`
Expected: FAIL, `cannot import name 'cache'` or `module has no attribute 'cached'`.

- [ ] **Step 5: Write `travel_tools/cache.py`**

```python
import hashlib
import json
import time
from pathlib import Path
from typing import Callable

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"


def _key(parts: list) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def cached(key_parts: list, ttl_s: int, fn: Callable[[], dict]) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{_key(key_parts)}.json"
    if path.exists() and time.time() - path.stat().st_mtime < ttl_s:
        return json.loads(path.read_text())
    result = fn()
    if "error" not in result:
        path.write_text(json.dumps(result))
    return result
```

- [ ] **Step 6: Run, expect pass**

Run: `cd mcp/travel-tools && uv run pytest tests/test_cache.py -q`
Expected: 3 passed.

- [ ] **Step 7: Write failing http test `tests/test_http.py`**

```python
import httpx
import respx
from travel_tools import http


@respx.mock
def test_get_json_returns_body():
    respx.get("https://x.test/a").mock(return_value=httpx.Response(200, json={"ok": 1}))
    assert http.get_json("https://x.test/a") == {"ok": 1}


@respx.mock
def test_get_json_returns_error_on_http_error():
    respx.get("https://x.test/a").mock(return_value=httpx.Response(403, text="denied"))
    out = http.get_json("https://x.test/a")
    assert out["error"].startswith("HTTP 403")


@respx.mock
def test_post_json_returns_error_on_network_failure():
    respx.post("https://x.test/p").mock(side_effect=httpx.ConnectError("down"))
    out = http.post_json("https://x.test/p", {"q": 1})
    assert "down" in out["error"]
```

- [ ] **Step 8: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_http.py -q`
Expected: FAIL on import.

- [ ] **Step 9: Write `travel_tools/http.py`**

```python
import httpx

TIMEOUT = 20.0


def get_json(url: str, params: dict | None = None, headers: dict | None = None) -> dict:
    try:
        r = httpx.get(url, params=params, headers=headers, timeout=TIMEOUT)
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as e:  # network, timeout, bad json
        return {"error": f"{type(e).__name__}: {e}"}


def post_json(url: str, body: dict, headers: dict | None = None) -> dict:
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=TIMEOUT)
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code}: {r.text[:200]}"}
        return r.json()
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
```

- [ ] **Step 10: Run all, expect pass, commit**

Run: `cd mcp/travel-tools && uv run pytest -q`
Expected: 6 passed.

```bash
git add mcp/travel-tools/pyproject.toml mcp/travel-tools/uv.lock mcp/travel-tools/travel_tools mcp/travel-tools/tests
git commit -m "add travel-tools mcp package with cache and http helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `convert_currency` tool (Frankfurter)

**Files:**
- Create: `mcp/travel-tools/travel_tools/currency.py`
- Test: `mcp/travel-tools/tests/test_currency.py`

**Interfaces:**
- Consumes: `http.get_json`, `cache.cached`
- Produces: `convert_currency(amount: float, from_currency: str, to_currency: str) -> dict` returning `{"amount": float, "rate": float, "date": "DD-MM-YYYY", "from": str, "to": str}` or `{"error": str}`.

- [ ] **Step 1: Write failing test**

```python
import httpx
import respx
from travel_tools import cache, currency


@respx.mock
def test_convert_currency_returns_converted_amount(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.frankfurter.dev/v1/latest").mock(
        return_value=httpx.Response(200, json={"amount": 1.0, "base": "USD", "date": "2026-09-18", "rates": {"JPY": 157.89}})
    )
    out = currency.convert_currency(100, "USD", "JPY")
    assert out["amount"] == 15789.0
    assert out["rate"] == 157.89
    assert out["date"] == "18-09-2026"


@respx.mock
def test_convert_currency_propagates_error(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.frankfurter.dev/v1/latest").mock(return_value=httpx.Response(500, text="x"))
    assert "error" in currency.convert_currency(1, "USD", "JPY")
```

- [ ] **Step 2: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_currency.py -q`
Expected: FAIL on import.

- [ ] **Step 3: Write `travel_tools/currency.py`**

```python
from travel_tools.cache import cached
from travel_tools.http import get_json

URL = "https://api.frankfurter.dev/v1/latest"


def _to_ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}-{m}-{y}"


def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    src, dst = from_currency.upper(), to_currency.upper()

    def fetch() -> dict:
        data = get_json(URL, params={"base": src, "symbols": dst})
        if "error" in data:
            return data
        if dst not in data.get("rates", {}):
            return {"error": f"no rate for {src}->{dst}"}
        return {"rate": data["rates"][dst], "date": _to_ddmmyyyy(data["date"])}

    base = cached(["fx", src, dst], 24 * 3600, fetch)
    if "error" in base:
        return base
    return {
        "amount": round(amount * base["rate"], 2),
        "rate": base["rate"],
        "date": base["date"],
        "from": src,
        "to": dst,
    }
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `cd mcp/travel-tools && uv run pytest tests/test_currency.py -q`
Expected: 2 passed.

```bash
git add mcp/travel-tools/travel_tools/currency.py mcp/travel-tools/tests/test_currency.py
git commit -m "add convert_currency tool backed by frankfurter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `get_weather` tool (Open-Meteo)

**Files:**
- Create: `mcp/travel-tools/travel_tools/weather.py`
- Test: `mcp/travel-tools/tests/test_weather.py`

**Interfaces:**
- Produces: `get_weather(lat: float, lon: float, start_date: str, end_date: str) -> dict`. Dates in and out are `DD-MM-YYYY`. Returns `{"days": [{"date": "DD-MM-YYYY", "max_c": float, "min_c": float, "rain_mm": float}]}` or `{"error"}`.

- [ ] **Step 1: Write failing test**

```python
import httpx
import respx
from travel_tools import cache, weather


@respx.mock
def test_get_weather_maps_days(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    respx.get("https://api.open-meteo.com/v1/forecast").mock(
        return_value=httpx.Response(200, json={
            "daily": {
                "time": ["2026-10-01", "2026-10-02"],
                "temperature_2m_max": [24.1, 22.0],
                "temperature_2m_min": [15.0, 14.2],
                "precipitation_sum": [0.0, 3.5],
            }
        })
    )
    out = weather.get_weather(35.01, 135.77, "01-10-2026", "02-10-2026")
    assert out["days"][1] == {"date": "02-10-2026", "max_c": 22.0, "min_c": 14.2, "rain_mm": 3.5}


def test_get_weather_rejects_bad_date_format(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert "error" in weather.get_weather(35.0, 135.0, "2026-10-01", "2026-10-02")
```

- [ ] **Step 2: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_weather.py -q`

- [ ] **Step 3: Write `travel_tools/weather.py`**

```python
import re

from travel_tools.cache import cached
from travel_tools.http import get_json

URL = "https://api.open-meteo.com/v1/forecast"
DDMMYYYY = re.compile(r"^\d{2}-\d{2}-\d{4}$")


def _to_iso(d: str) -> str:
    dd, mm, yyyy = d.split("-")
    return f"{yyyy}-{mm}-{dd}"


def _to_ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}-{m}-{y}"


def get_weather(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    if not (DDMMYYYY.match(start_date) and DDMMYYYY.match(end_date)):
        return {"error": "dates must be DD-MM-YYYY"}

    def fetch() -> dict:
        data = get_json(URL, params={
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "start_date": _to_iso(start_date),
            "end_date": _to_iso(end_date),
            "timezone": "auto",
        })
        if "error" in data:
            return data
        d = data.get("daily", {})
        days = [
            {"date": _to_ddmmyyyy(t), "max_c": mx, "min_c": mn, "rain_mm": rain}
            for t, mx, mn, rain in zip(
                d.get("time", []), d.get("temperature_2m_max", []),
                d.get("temperature_2m_min", []), d.get("precipitation_sum", []),
            )
        ]
        return {"days": days}

    return cached(["wx", round(lat, 2), round(lon, 2), start_date, end_date], 6 * 3600, fetch)
```

- [ ] **Step 4: Run, expect pass, commit**

```bash
cd mcp/travel-tools && uv run pytest tests/test_weather.py -q
git add mcp/travel-tools/travel_tools/weather.py mcp/travel-tools/tests/test_weather.py
git commit -m "add get_weather tool backed by open-meteo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `search_places` tool (Google Places Text Search, New)

**Files:**
- Create: `mcp/travel-tools/travel_tools/places.py`, `mcp/travel-tools/tests/fixtures/places_kyoto_temples.json`
- Test: `mcp/travel-tools/tests/test_places.py`

**Interfaces:**
- Produces: `search_places(query: str, city: str, place_type: str | None = None, max_results: int = 8) -> dict` returning `{"places": [{"name", "area", "lat", "lon", "rating", "user_ratings_total", "price_level", "types", "maps_url"}]}` or `{"error"}`. Reads `GOOGLE_MAPS_API_KEY` from env.

Endpoint per official doc: `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` and `X-Goog-FieldMask`, body `textQuery`, optional `includedType`, `pageSize` (1-20).

- [ ] **Step 1: Write fixture `tests/fixtures/places_kyoto_temples.json`** (shape of a real response, two places)

```json
{
  "places": [
    {
      "id": "ChIJ1",
      "displayName": {"text": "Honen-in Temple", "languageCode": "en"},
      "formattedAddress": "30 Shishigatani Goshonodancho, Sakyo Ward, Kyoto, 606-8426, Japan",
      "location": {"latitude": 35.0209, "longitude": 135.7969},
      "rating": 4.5,
      "userRatingCount": 2100,
      "types": ["buddhist_temple", "place_of_worship", "tourist_attraction"],
      "googleMapsUri": "https://maps.google.com/?cid=1"
    },
    {
      "id": "ChIJ2",
      "displayName": {"text": "Shisen-do", "languageCode": "en"},
      "formattedAddress": "27 Ichijoji Monguchicho, Sakyo Ward, Kyoto, 606-8154, Japan",
      "location": {"latitude": 35.0424, "longitude": 135.7929},
      "rating": 4.4,
      "userRatingCount": 900,
      "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
      "types": ["buddhist_temple", "tourist_attraction"],
      "googleMapsUri": "https://maps.google.com/?cid=2"
    }
  ]
}
```

- [ ] **Step 2: Write failing test `tests/test_places.py`**

```python
import json
from pathlib import Path

import httpx
import respx
from travel_tools import cache, places

FIX = Path(__file__).parent / "fixtures" / "places_kyoto_temples.json"


@respx.mock
def test_search_places_maps_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    route = respx.post("https://places.googleapis.com/v1/places:searchText").mock(
        return_value=httpx.Response(200, json=json.loads(FIX.read_text()))
    )
    out = places.search_places("quiet temples", "Kyoto", place_type="buddhist_temple", max_results=5)
    body = json.loads(route.calls[0].request.content)
    assert body == {"textQuery": "quiet temples in Kyoto", "includedType": "buddhist_temple", "pageSize": 5}
    assert route.calls[0].request.headers["X-Goog-Api-Key"] == "k"
    assert "places.displayName" in route.calls[0].request.headers["X-Goog-FieldMask"]
    p = out["places"][1]
    assert p["name"] == "Shisen-do"
    assert p["area"] == "Sakyo Ward"
    assert p["price_level"] == "inexpensive"
    assert p["lat"] == 35.0424
    assert out["places"][0]["price_level"] is None


def test_search_places_requires_key(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    assert "error" in places.search_places("x", "Tokyo")
```

- [ ] **Step 3: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_places.py -q`

- [ ] **Step 4: Write `travel_tools/places.py`**

```python
import os

from travel_tools.cache import cached
from travel_tools.http import post_json

URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.rating", "places.userRatingCount", "places.priceLevel", "places.types",
    "places.googleMapsUri",
])
PRICE = {
    "PRICE_LEVEL_FREE": "free",
    "PRICE_LEVEL_INEXPENSIVE": "inexpensive",
    "PRICE_LEVEL_MODERATE": "moderate",
    "PRICE_LEVEL_EXPENSIVE": "expensive",
    "PRICE_LEVEL_VERY_EXPENSIVE": "very_expensive",
}


def _area(address: str) -> str:
    # "30 Shishigatani..., Sakyo Ward, Kyoto, 606-8426, Japan" -> "Sakyo Ward"
    parts = [p.strip() for p in address.split(",")]
    return parts[-4] if len(parts) >= 4 else (parts[0] if parts else "")


def _map(p: dict) -> dict:
    loc = p.get("location", {})
    return {
        "name": p.get("displayName", {}).get("text", ""),
        "area": _area(p.get("formattedAddress", "")),
        "lat": loc.get("latitude"),
        "lon": loc.get("longitude"),
        "rating": p.get("rating"),
        "user_ratings_total": p.get("userRatingCount"),
        "price_level": PRICE.get(p.get("priceLevel")),
        "types": p.get("types", []),
        "maps_url": p.get("googleMapsUri"),
    }


def search_places(query: str, city: str, place_type: str | None = None, max_results: int = 8) -> dict:
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        return {"error": "GOOGLE_MAPS_API_KEY not set"}
    n = max(1, min(int(max_results), 20))
    body: dict = {"textQuery": f"{query} in {city}", "pageSize": n}
    if place_type:
        body["includedType"] = place_type

    def fetch() -> dict:
        data = post_json(URL, body, headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELD_MASK,
        })
        if "error" in data:
            return data
        return {"places": [_map(p) for p in data.get("places", [])]}

    return cached(["places", body], 24 * 3600, fetch)
```

- [ ] **Step 5: Run, expect pass, commit**

```bash
cd mcp/travel-tools && uv run pytest tests/test_places.py -q
git add mcp/travel-tools/travel_tools/places.py mcp/travel-tools/tests/test_places.py mcp/travel-tools/tests/fixtures/places_kyoto_temples.json
git commit -m "add search_places tool backed by google places text search

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `get_walking_route` (Routes API, WALK) and `get_rail_route` (seeded Japan rail)

**Why two tools instead of one transit tool:** Routes API transit returns empty for Japan (Global Constraint 10). Walking mode works and is what the day skeleton needs (anchor to anchor inside one zone). Inter-city rail comes from a seeded, source-cited file.

**Files:**
- Create: `mcp/travel-tools/travel_tools/walking.py`, `mcp/travel-tools/travel_tools/rail.py`, `mcp/travel-tools/data/japan_rail.json`, `mcp/travel-tools/tests/fixtures/routes_walk_asakusa_ueno.json`
- Test: `mcp/travel-tools/tests/test_walking.py`, `mcp/travel-tools/tests/test_rail.py`

**Interfaces:**
- Produces: `get_walking_route(origin: str, destination: str) -> dict` returning `{"duration_min": int, "distance_m": int, "source": "tool"}` or `{"error"}`.
- Produces: `get_rail_route(origin_city: str, destination_city: str) -> dict` returning `{"line", "train", "duration_min", "fare_jpy_reserved", "fare_jpy_hikari", "notes", "source", "source_url"}` or `{"error"}`.

Endpoint per official doc: `POST https://routes.googleapis.com/directions/v2:computeRoutes`, body `{origin:{address}, destination:{address}, travelMode:"WALK"}`, header `X-Goog-FieldMask: routes.duration,routes.distanceMeters`.

- [ ] **Step 1: Write fixture `tests/fixtures/routes_walk_asakusa_ueno.json`** (a real response captured 19-09-2026)

```json
{"routes": [{"distanceMeters": 1911, "duration": "1733s"}]}
```

- [ ] **Step 2: Write failing test `tests/test_walking.py`**

```python
import json
from pathlib import Path

import httpx
import respx
from travel_tools import cache, walking

FIX = Path(__file__).parent / "fixtures" / "routes_walk_asakusa_ueno.json"


@respx.mock
def test_get_walking_route_maps_duration_and_distance(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    route = respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(
        return_value=httpx.Response(200, json=json.loads(FIX.read_text()))
    )
    out = walking.get_walking_route("Senso-ji, Tokyo, Japan", "Ueno Park, Tokyo, Japan")
    body = json.loads(route.calls[0].request.content)
    assert body == {"origin": {"address": "Senso-ji, Tokyo, Japan"}, "destination": {"address": "Ueno Park, Tokyo, Japan"}, "travelMode": "WALK"}
    assert out == {"duration_min": 29, "distance_m": 1911, "source": "tool"}


@respx.mock
def test_get_walking_route_empty_is_error(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    respx.post("https://routes.googleapis.com/directions/v2:computeRoutes").mock(return_value=httpx.Response(200, json={}))
    assert "error" in walking.get_walking_route("A", "B")


def test_get_walking_route_accepts_legacy_env_name(tmp_path, monkeypatch):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_MAPS_API", "k")
    assert walking.api_key() == "k"
```

- [ ] **Step 3: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_walking.py -q`

- [ ] **Step 4: Write `travel_tools/walking.py`**

```python
import os

from travel_tools.cache import cached
from travel_tools.http import post_json

URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
FIELD_MASK = "routes.duration,routes.distanceMeters"


def api_key() -> str | None:
    return os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_MAPS_API")


def _seconds(s: str | None) -> int:
    return int(str(s or "0s").rstrip("s"))


def get_walking_route(origin: str, destination: str) -> dict:
    key = api_key()
    if not key:
        return {"error": "GOOGLE_MAPS_API_KEY not set"}
    body = {"origin": {"address": origin}, "destination": {"address": destination}, "travelMode": "WALK"}

    def fetch() -> dict:
        data = post_json(URL, body, headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELD_MASK,
        })
        if "error" in data:
            return data
        routes_ = data.get("routes") or []
        if not routes_:
            return {"error": f"no walking route from {origin} to {destination}"}
        r = routes_[0]
        return {
            "duration_min": round(_seconds(r.get("duration")) / 60),
            "distance_m": int(r.get("distanceMeters", 0)),
            "source": "tool",
        }

    return cached(["walk", body], 24 * 3600, fetch)
```

Also change `places.py` (Task 5) to use the same helper: replace `key = os.environ.get("GOOGLE_MAPS_API_KEY")` with `from travel_tools.walking import api_key` and `key = api_key()`. Re-run `tests/test_places.py`.

- [ ] **Step 5: Run, expect pass**

Run: `cd mcp/travel-tools && uv run pytest tests/test_walking.py tests/test_places.py -q`
Expected: 5 passed.

- [ ] **Step 6: Write `mcp/travel-tools/data/japan_rail.json`**

Fares are from the official JR Central smartEX reserved-seat fare table (ordinary car, reserved seat, regular season, one-way adult), PDF linked from https://smart-ex.jp/en/product/plan/service/ , read 19-09-2026. Nozomi timing is the published fastest scheduled time. Check https://global.jr-central.co.jp/en/info/timetable/ if it needs updating.

```json
{
  "source": "JR Central smartEX fare overview, ordinary car reserved seat, regular season, one-way adult",
  "source_url": "https://smart-ex.jp/en/product/plan/service/",
  "read_on": "19-09-2026",
  "season_note": "Off-peak minus 200 JPY, peak plus 200 JPY, super peak plus 400 JPY, per the same table.",
  "segments": [
    {
      "from": "Tokyo", "to": "Kyoto", "line": "Tokaido Shinkansen", "train": "Nozomi",
      "duration_min": 135, "fare_jpy_reserved": 13970, "fare_jpy_hikari": 13650,
      "notes": "Nozomi is all-reserved during New Year, Golden Week and Obon. Hikari takes about 160 min and is covered by the JR Pass."
    },
    {
      "from": "Tokyo", "to": "Shin-Osaka", "line": "Tokaido Shinkansen", "train": "Nozomi",
      "duration_min": 150, "fare_jpy_reserved": 14520, "fare_jpy_hikari": 14170,
      "notes": ""
    },
    {
      "from": "Kyoto", "to": "Shin-Osaka", "line": "Tokaido Shinkansen", "train": "Nozomi",
      "duration_min": 15, "fare_jpy_reserved": 3260, "fare_jpy_hikari": 3260,
      "notes": "Local JR Kyoto Line is about 30 min and much cheaper."
    }
  ]
}
```

Segments are symmetric: the tool must answer Kyoto to Tokyo from the Tokyo to Kyoto row.

- [ ] **Step 7: Write failing test `tests/test_rail.py`**

```python
from travel_tools import rail


def test_get_rail_route_tokyo_kyoto():
    out = rail.get_rail_route("Tokyo", "Kyoto")
    assert out["train"] == "Nozomi"
    assert out["duration_min"] == 135
    assert out["fare_jpy_reserved"] == 13970
    assert out["source"] == "seed"
    assert out["source_url"].startswith("https://smart-ex.jp")


def test_get_rail_route_is_symmetric():
    assert rail.get_rail_route("kyoto", "TOKYO")["fare_jpy_reserved"] == 13970


def test_get_rail_route_unknown_pair():
    out = rail.get_rail_route("Tokyo", "Sapporo")
    assert "error" in out and "could not verify" in out["error"]
```

- [ ] **Step 8: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_rail.py -q`

- [ ] **Step 9: Write `travel_tools/rail.py`**

```python
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "japan_rail.json"


def _load() -> dict:
    return json.loads(DATA.read_text())


def get_rail_route(origin_city: str, destination_city: str) -> dict:
    data = _load()
    a, b = origin_city.strip().lower(), destination_city.strip().lower()
    for seg in data["segments"]:
        pair = {seg["from"].lower(), seg["to"].lower()}
        if pair == {a, b}:
            return {
                "line": seg["line"],
                "train": seg["train"],
                "duration_min": seg["duration_min"],
                "fare_jpy_reserved": seg["fare_jpy_reserved"],
                "fare_jpy_hikari": seg["fare_jpy_hikari"],
                "notes": seg["notes"],
                "season_note": data["season_note"],
                "source": "seed",
                "source_url": data["source_url"],
                "read_on": data["read_on"],
            }
    return {"error": f"could not verify rail route {origin_city} to {destination_city}: not in seed data"}
```

- [ ] **Step 10: Run, expect pass, commit**

```bash
cd mcp/travel-tools && uv run pytest -q
git add mcp/travel-tools/travel_tools/walking.py mcp/travel-tools/travel_tools/rail.py mcp/travel-tools/travel_tools/places.py mcp/travel-tools/data mcp/travel-tools/tests
git commit -m "add walking route and seeded japan rail tools

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: MCP server assembly, fail-fast, live smoke test

**Files:**
- Create: `mcp/travel-tools/server.py`
- Test: `mcp/travel-tools/tests/test_server.py`, `mcp/travel-tools/tests/test_live.py`

**Interfaces:**
- Produces: MCP tools named exactly `search_places`, `get_walking_route`, `get_rail_route`, `convert_currency`, `get_weather` on server `travel-tools`. Claude Code exposes them as `mcp__travel-tools__search_places` etc. (used in agent `tools:` lists in Task 9).

- [ ] **Step 1: Write failing test `tests/test_server.py`**

```python
import subprocess
import sys
from pathlib import Path

import pytest

SERVER = Path(__file__).parent.parent / "server.py"


def test_server_refuses_to_start_without_key(monkeypatch):
    env = {"PATH": "/usr/bin:/bin"}
    p = subprocess.run([sys.executable, str(SERVER)], env=env, capture_output=True, text=True, timeout=20)
    assert p.returncode == 2
    assert "GOOGLE_MAPS_API_KEY" in p.stderr


def test_server_registers_five_tools(monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    import importlib
    import server
    importlib.reload(server)
    names = {t.name for t in server.mcp._tool_manager.list_tools()}
    assert names == {"search_places", "get_walking_route", "get_rail_route", "convert_currency", "get_weather"}
```

If `server.mcp._tool_manager.list_tools()` is not the accessor in the installed `mcp` version, run `uv run python -c "from mcp.server import MCPServer; m=MCPServer('x'); print([a for a in dir(m) if 'tool' in a.lower()])"` and use the public listing method it shows. The assertion on the five names is what matters.

- [ ] **Step 2: Run, expect failure**

Run: `cd mcp/travel-tools && uv run pytest tests/test_server.py -q`

- [ ] **Step 3: Write `server.py`**

```python
import os
import sys

from mcp.server import MCPServer

from travel_tools.currency import convert_currency as _convert_currency
from travel_tools.places import search_places as _search_places
from travel_tools.rail import get_rail_route as _get_rail_route
from travel_tools.walking import api_key, get_walking_route as _get_walking_route
from travel_tools.weather import get_weather as _get_weather

if not api_key():
    print("travel-tools: GOOGLE_MAPS_API_KEY is not set. Refusing to start.", file=sys.stderr)
    sys.exit(2)

mcp = MCPServer("travel-tools")


@mcp.tool()
def search_places(query: str, city: str, place_type: str | None = None, max_results: int = 8) -> dict:
    """Search real places (temples, food streets, hotels, neighbourhoods) via Google Places.
    place_type examples: buddhist_temple, shinto_shrine, restaurant, lodging, tourist_attraction.
    Returns {"places": [...]} or {"error": "..."}. Report an error as "could not verify"."""
    return _search_places(query, city, place_type, max_results)


@mcp.tool()
def get_walking_route(origin: str, destination: str) -> dict:
    """Walking time and distance between two places or addresses via Google Routes.
    Use for anchor-to-anchor moves inside one city zone. Returns duration_min, distance_m, or {"error"}."""
    return _get_walking_route(origin, destination)


@mcp.tool()
def get_rail_route(origin_city: str, destination_city: str) -> dict:
    """Shinkansen segment between two Japanese cities from seeded, source-cited JR Central fare data.
    Returns train, duration_min, fare_jpy_reserved, fare_jpy_hikari, source_url, or {"error": "could not verify ..."}."""
    return _get_rail_route(origin_city, destination_city)


@mcp.tool()
def convert_currency(amount: float, from_currency: str, to_currency: str) -> dict:
    """Convert an amount between currencies at today's ECB rate (Frankfurter)."""
    return _convert_currency(amount, from_currency, to_currency)


@mcp.tool()
def get_weather(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    """Daily max, min and rain for a lat/lon between two DD-MM-YYYY dates (Open-Meteo)."""
    return _get_weather(lat, lon, start_date, end_date)


if __name__ == "__main__":
    mcp.run()
```

- [ ] **Step 4: Run, expect pass**

Run: `cd mcp/travel-tools && uv run pytest tests/test_server.py -q`
Expected: 2 passed.

- [ ] **Step 5: Write the live smoke test `tests/test_live.py`** (skipped unless `LIVE_API_TESTS=1`)

```python
import os

import pytest
from travel_tools import currency, places, walking

live = pytest.mark.skipif(os.environ.get("LIVE_API_TESTS") != "1", reason="set LIVE_API_TESTS=1")


@live
def test_live_places_kyoto_temples():
    out = places.search_places("quiet temples", "Kyoto", place_type="buddhist_temple", max_results=3)
    assert "places" in out and len(out["places"]) >= 1, out


@live
def test_live_walk_asakusa_ueno():
    out = walking.get_walking_route("Senso-ji, Tokyo, Japan", "Ueno Park, Tokyo, Japan")
    assert 15 <= out.get("duration_min", 0) <= 45, out


@live
def test_live_fx():
    out = currency.convert_currency(1, "USD", "JPY")
    assert out["rate"] > 100, out
```

- [ ] **Step 6: Run the live smoke test once with the real key**

Run: `cd mcp/travel-tools && set -a && source ../../.env && set +a && LIVE_API_TESTS=1 uv run pytest tests/test_live.py -q`
Expected: 3 passed. Both APIs were confirmed enabled on the repo key on 19-09-2026 (Places returned Kiyomizu-dera, To-ji, Tenryu-ji, and Routes WALK returned 1,911 m / 29 min). If either returns `HTTP 403` now, the key changed. Stop and fix the key, do not work around it.

- [ ] **Step 7: Verify Claude Code sees the server**

Run from repo root: `claude mcp list`
Expected: a line containing `travel-tools` with a connected status. If it fails, run `uv run --project mcp/travel-tools python mcp/travel-tools/server.py` by hand with `GOOGLE_MAPS_API_KEY` exported and read the stderr.

- [ ] **Step 8: Commit**

```bash
git add mcp/travel-tools/server.py mcp/travel-tools/tests/test_server.py mcp/travel-tools/tests/test_live.py
git commit -m "add travel-tools mcp server with fail-fast key check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Contracts, brief schema and itinerary JSON schema

**Files:**
- Create: `docs/contracts/brief.schema.json`, `docs/contracts/itinerary.schema.json`, `docs/contracts/review.schema.json`, `docs/contracts/examples/brief.example.json`, `docs/contracts/examples/review.example.json`

**Interfaces:**
- Produces: the three JSON shapes every agent writes and the UI reads. Later tasks quote field names from here.

- [ ] **Step 1: Write `docs/contracts/brief.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TripBrief",
  "type": "object",
  "required": ["request", "destination", "days", "cities", "budget_usd", "likes", "avoids", "slug"],
  "properties": {
    "request": {"type": "string"},
    "destination": {"type": "string"},
    "days": {"type": "integer", "minimum": 1},
    "cities": {"type": "array", "items": {"type": "string"}, "minItems": 1},
    "budget_usd": {"type": "number"},
    "likes": {"type": "array", "items": {"type": "string"}},
    "avoids": {"type": "array", "items": {"type": "string"}},
    "start_date": {"type": ["string", "null"], "pattern": "^\\d{2}-\\d{2}-\\d{4}$"},
    "travellers": {"type": "integer", "default": 1},
    "slug": {"type": "string"}
  }
}
```

- [ ] **Step 2: Write `docs/contracts/examples/brief.example.json`**

```json
{
  "request": "Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.",
  "destination": "Japan",
  "days": 5,
  "cities": ["Tokyo", "Kyoto"],
  "budget_usd": 3000,
  "likes": ["food", "temples"],
  "avoids": ["crowds"],
  "start_date": null,
  "travellers": 1,
  "slug": "japan-tokyo-kyoto-a1f3"
}
```

- [ ] **Step 3: Write `docs/contracts/review.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ReviewResult",
  "type": "object",
  "required": ["pass", "checks", "failures"],
  "properties": {
    "pass": {"type": "boolean"},
    "checks": {
      "type": "array",
      "minItems": 6,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["id", "label", "pass", "reason"],
        "properties": {
          "id": {"enum": ["days_fit", "cities_included", "within_budget", "matches_likes", "avoids_crowds", "travel_time_realistic"]},
          "label": {"type": "string"},
          "pass": {"type": "boolean"},
          "reason": {"type": "string"}
        }
      }
    },
    "failures": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["check_id", "owner", "instruction"],
        "properties": {
          "check_id": {"type": "string"},
          "owner": {"enum": ["destination-research", "logistics", "budget", "orchestrator"]},
          "instruction": {"type": "string"}
        }
      }
    }
  }
}
```

- [ ] **Step 4: Write `docs/contracts/examples/review.example.json`**

```json
{
  "pass": false,
  "checks": [
    {"id": "days_fit", "label": "Fits in 5 days", "pass": true, "reason": "Days 1 to 5 present, nothing on day 6."},
    {"id": "cities_included", "label": "Includes Tokyo and Kyoto", "pass": true, "reason": "Tokyo days 1-2, Kyoto days 3-5."},
    {"id": "within_budget", "label": "Within $3,000", "pass": false, "reason": "Total estimate $3,240 exceeds $3,000 by $240."},
    {"id": "matches_likes", "label": "Matches food and temples", "pass": true, "reason": "Every day has at least one temple and one food anchor."},
    {"id": "avoids_crowds", "label": "Avoids crowds", "pass": true, "reason": "Every item carries a crowd tactic."},
    {"id": "travel_time_realistic", "label": "Travel time realistic", "pass": true, "reason": "No day exceeds 90 min of transit between anchors."}
  ],
  "failures": [
    {"check_id": "within_budget", "owner": "budget", "instruction": "Total is $240 over. Apply the first cheaper alternative from 03-budget.md and restate the bands."}
  ]
}
```

- [ ] **Step 5: Write `docs/contracts/itinerary.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Itinerary",
  "type": "object",
  "required": ["slug", "title", "generated_on", "brief", "days", "stays", "intercity", "budget", "crowd_strategy", "review"],
  "properties": {
    "slug": {"type": "string"},
    "title": {"type": "string"},
    "generated_on": {"type": "string", "pattern": "^\\d{2}-\\d{2}-\\d{4}$"},
    "brief": {"$ref": "brief.schema.json"},
    "days": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["day", "city", "area", "slots"],
        "properties": {
          "day": {"type": "integer"},
          "date": {"type": ["string", "null"], "pattern": "^\\d{2}-\\d{2}-\\d{4}$"},
          "city": {"type": "string"},
          "area": {"type": "string"},
          "slots": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["when", "name", "kind", "crowd_tactic", "transit_min_from_prev"],
              "properties": {
                "when": {"enum": ["morning", "afternoon", "evening"]},
                "name": {"type": "string"},
                "kind": {"enum": ["temple", "food", "sight", "transit", "free"]},
                "area": {"type": "string"},
                "why": {"type": "string"},
                "crowd_tactic": {"type": "string"},
                "transit_min_from_prev": {"type": ["integer", "null"]},
                "est_cost_usd": {"type": ["number", "null"]},
                "source": {"enum": ["tool", "seed", "estimate", "could not verify"]}
              }
            }
          }
        }
      }
    },
    "stays": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["city", "nights", "area", "why", "examples"],
        "properties": {
          "city": {"type": "string"},
          "nights": {"type": "integer"},
          "area": {"type": "string"},
          "why": {"type": "string"},
          "est_nightly_usd": {"type": ["number", "null"]},
          "examples": {"type": "array", "items": {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}, "rating": {"type": ["number", "null"]}, "price_level": {"type": ["string", "null"]}}}}
        }
      }
    },
    "intercity": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to", "mode", "duration_min", "source"],
        "properties": {
          "from": {"type": "string"}, "to": {"type": "string"}, "mode": {"type": "string"},
          "duration_min": {"type": "integer"}, "fare_usd": {"type": ["number", "null"]},
          "source": {"enum": ["tool", "seed", "estimate", "could not verify"]}
        }
      }
    },
    "budget": {
      "type": "object",
      "required": ["limit_usd", "total_usd", "within_budget", "lines", "fx"],
      "properties": {
        "limit_usd": {"type": "number"},
        "total_usd": {"type": "number"},
        "within_budget": {"type": "boolean"},
        "lines": {"type": "array", "items": {"type": "object", "required": ["category", "usd", "basis"], "properties": {"category": {"enum": ["stay", "transport", "food", "activities", "buffer"]}, "usd": {"type": "number"}, "basis": {"type": "string"}}}},
        "alternatives": {"type": "array", "items": {"type": "string"}},
        "fx": {"type": "object", "properties": {"rate": {"type": "number"}, "date": {"type": "string"}}}
      }
    },
    "crowd_strategy": {"type": "array", "items": {"type": "string"}},
    "review": {"$ref": "review.schema.json"},
    "warnings": {"type": "array", "items": {"type": "string"}}
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add docs/contracts
git commit -m "add brief, review and itinerary json contracts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The four worker and review agents

**Files:**
- Create: `.claude/agents/destination-research.md`, `.claude/agents/logistics.md`, `.claude/agents/budget.md`, `.claude/agents/review.md`

**Interfaces:**
- Consumes: MCP tools `mcp__travel-tools__search_places`, `mcp__travel-tools__get_walking_route`, `mcp__travel-tools__get_rail_route`, `mcp__travel-tools__convert_currency`, `mcp__travel-tools__get_weather`. Brief at `trips/<slug>/00-brief.json`.
- Produces: `01-destinations.md`, `02-logistics.md`, `03-budget.md`, `05-review.json` (shape from Task 8). Each worker's final chat reply is exactly 3 lines.

Frontmatter fields are the documented ones: `name`, `description`, `tools`, `model`, `mcpServers`. `mcpServers: [travel-tools]` references the server registered in `.mcp.json`.

- [ ] **Step 1: Write `.claude/agents/destination-research.md`**

```markdown
---
name: destination-research
description: Finds real temples, food areas, sights and experiences for a trip brief using the travel-tools MCP. Use for the destination research step of /plan-trip. Never for logistics or pricing.
model: sonnet
tools: Read, Write, mcp__travel-tools__search_places, mcp__travel-tools__get_weather
mcpServers:
  - travel-tools
---

You are the Destination Research agent for a travel planner. You are given the path to a trip brief (`trips/<slug>/00-brief.json`). Read it first.

## What you produce

Write `trips/<slug>/01-destinations.md` with this structure, then reply with exactly three lines: (1) how many candidates per city, (2) how many are must-do, (3) any "could not verify" items.

```
# Destinations for <destination>

## <City 1>
### Must-do
| Name | Area | Why it fits (<likes>) | Crowd tactic | Rating (count) | Price level | Source |
### Nice-to-have
(same columns)
### Food areas
| Area | What to eat | Best time | Crowd tactic | Source |

## <City 2>
(same)

## Weather (only if the brief has start_date)
| Date | Max C | Min C | Rain mm |
```

## Rules

1. Every place comes from `search_places`. Call it at least 4 times per city: once per like in the brief (e.g. "quiet temples", "local food street"), once for "lesser-known <like>", once for "early morning <like>". Use `place_type` when it fits: `buddhist_temple`, `shinto_shrine`, `restaurant`, `tourist_attraction`.
2. 6 to 10 candidates per city. Mark 3 to 4 as must-do. Prefer high rating with a lower `user_ratings_total` when the brief avoids crowds.
3. Crowd tactic is mandatory on every row and must be concrete: a time ("arrive 07:30, before tour buses"), an alternative ("instead of Fushimi Inari, Honen-in"), or "peak, included because must-do".
4. Source column is `tool` for anything returned by search_places. If a call returns `{"error"}`, write the row as "could not verify <query>" with Source `could not verify`. Never fill from memory.
5. Dates DD-MM-YYYY. No em dashes.
6. If the brief has `start_date`, call `get_weather` once per city using the lat/lon of the first must-do.
7. Do not plan days, pick hotels, or price anything. That is other agents' work.
```

- [ ] **Step 2: Write `.claude/agents/logistics.md`**

```markdown
---
name: logistics
description: Chooses stay areas and example hotels, the night split across cities, the inter-city route and a per-day sequence that minimises backtracking, using the travel-tools MCP. Use for the logistics step of /plan-trip.
model: sonnet
tools: Read, Write, mcp__travel-tools__search_places, mcp__travel-tools__get_walking_route, mcp__travel-tools__get_rail_route
mcpServers:
  - travel-tools
---

You are the Logistics agent. Read `trips/<slug>/00-brief.json` first.

## What you produce

Write `trips/<slug>/02-logistics.md`, then reply with exactly three lines: (1) night split, (2) inter-city route with minutes and fare, (3) any "could not verify" items.

```
# Logistics for <destination>

## Night split
| City | Nights | Reason |

## Stay areas
### <City>
| Area | Why (fits likes/avoids) | Example hotel | Rating (count) | Price level | Source |
(2 areas per city, 2 hotels per area)

## Inter-city
| From | To | Train | Line | Duration min | Fare JPY reserved | Source (url) |

## Day skeleton
| Day | City | Base area | Morning zone | Afternoon zone | Evening zone | Est. transit min between zones |
```

## Rules

1. Hotels come from `search_places(query="<style> hotel", city, place_type="lodging")`. Two calls per city minimum: one "quiet neighbourhood hotel", one "budget hotel near station". Price level from the tool is the only price signal you give.
2. Inter-city route comes from `get_rail_route("<City A>", "<City B>")`. Report `train`, `duration_min`, `fare_jpy_reserved`, and cite `source_url`. Source column is `seed`. If it returns an error, write "could not verify" and do not guess a fare.
3. Night split: total nights = days - 1. Give the city with more must-do interest one extra night when odd.
4. The day skeleton groups each day inside one zone of the city to cut backtracking. Zone names are the `area` values from search results.
5. Minutes between zones come from `get_walking_route(origin, destination)` using two named places or stations in those zones, one call per distinct pair you use. If the walk is over 40 minutes, write "walk <n> min, or metro (time could not verify)". Mark Source `tool`. Never state a metro or bus time, Google has no transit data for Japan.
6. Any tool error becomes "could not verify". Never invent a train time or a hotel.
7. Dates DD-MM-YYYY. No em dashes.
8. Do not pick specific temples or restaurants, and do not sum a budget.
```

- [ ] **Step 3: Write `.claude/agents/budget.md`**

```markdown
---
name: budget
description: Splits the trip budget into categories and produces per-category price bands in USD and JPY at today's rate, plus cheaper alternatives, using the travel-tools MCP. Use for the budget step of /plan-trip.
model: sonnet
tools: Read, Write, mcp__travel-tools__convert_currency
mcpServers:
  - travel-tools
---

You are the Budget agent. Read `trips/<slug>/00-brief.json` first. If `trips/<slug>/02-logistics.md` exists, read it for the inter-city fare and price levels, otherwise work from the brief alone.

## What you produce

Write `trips/<slug>/03-budget.md`, then reply with exactly three lines: (1) the category split, (2) the FX rate and date used, (3) the biggest risk to the budget.

```
# Budget for <destination>, limit $<budget_usd>

## FX
1 USD = <rate> JPY on <DD-MM-YYYY> (Frankfurter)

## Category split (target)
| Category | Share | USD | JPY |
| stay | 35% | ... | ... |
| transport | 15% | ... | ... |
| food | 25% | ... | ... |
| activities | 15% | ... | ... |
| buffer | 10% | ... | ... |

## Price bands (estimates unless marked tool)
| Item | Low USD | High USD | Basis | Source |
| Hotel night, quiet area, 3-star | ... | ... | price_level moderate | estimate |
| Shinkansen Tokyo-Kyoto one way | ... | ... | fare_jpy from logistics | tool / estimate |
| Meals per day (street + one sit-down) | ... | ... | | estimate |
| Temple entry each | ... | ... | | estimate |
| Local transit per day | ... | ... | | estimate |

## If over budget, cut here (in order)
1. ...
2. ...
3. ...
```

## Rules

1. Call `convert_currency(1, "USD", "JPY")` once and use that rate everywhere. Put the date in DD-MM-YYYY.
2. Every band row says `estimate` unless the number came from a tool result in 02-logistics.md (then `tool`).
3. Price bands are ranges, never a single number. The orchestrator does the final sum.
4. Alternatives must be concrete and ordered by savings: e.g. "move Tokyo stay from Ginza to Asakusa, saves about $40 per night".
5. Never total the itinerary yourself. Never pick places.
6. No em dashes.
```

- [ ] **Step 4: Write `.claude/agents/review.md`**

```markdown
---
name: review
description: Independent quality gate for a draft itinerary. Reads only the brief and the draft, returns six pass/fail checks as JSON. Use for the review step of /plan-trip. Has no tools to fix anything.
model: opus
tools: Read, Write
---

You are the Review agent. You are given two paths: `trips/<slug>/00-brief.json` and `trips/<slug>/04-itinerary-draft.md`. Read both. Do not read any other file. You have no travel tools on purpose.

## What you produce

Write `trips/<slug>/05-review.json` matching exactly this shape, then reply with one line: `PASS` or `FAIL: <comma-separated failing check ids>`.

```json
{
  "pass": true,
  "checks": [
    {"id": "days_fit", "label": "Fits in <days> days", "pass": true, "reason": "..."},
    {"id": "cities_included", "label": "Includes <cities>", "pass": true, "reason": "..."},
    {"id": "within_budget", "label": "Within $<budget_usd>", "pass": true, "reason": "..."},
    {"id": "matches_likes", "label": "Matches <likes>", "pass": true, "reason": "..."},
    {"id": "avoids_crowds", "label": "Avoids <avoids>", "pass": true, "reason": "..."},
    {"id": "travel_time_realistic", "label": "Travel time realistic", "pass": true, "reason": "..."}
  ],
  "failures": [
    {"check_id": "...", "owner": "destination-research | logistics | budget | orchestrator", "instruction": "one sentence the owner can act on"}
  ]
}
```

## How to judge each check

1. `days_fit`: exactly `days` day headings, numbered 1..days, no day empty.
2. `cities_included`: every city in the brief has at least one full day.
3. `within_budget`: the draft's budget total is <= `budget_usd`. Recompute the total from the draft's budget lines yourself, do not trust the stated total.
4. `matches_likes`: every day has at least one slot whose kind maps to a like (temples -> temple, food -> food). A day with none fails.
5. `avoids_crowds`: every slot has a non-empty, concrete crowd tactic. "Avoid crowds" or "go early" alone is not concrete. Any missing or vague tactic fails.
6. `travel_time_realistic`: no single day has more than 90 minutes of intra-city transit between slots, and the inter-city day allots the full inter-city duration plus 60 minutes.

## Rules

1. `pass` is true only if all six checks pass.
2. One failure entry per failing check. `owner` is the agent whose output caused it. Budget overage -> `budget`. Vague crowd tactic -> `destination-research`. Transit or day-count problems -> `logistics`. Structural problems in the draft itself -> `orchestrator`.
3. Reasons cite numbers from the draft ("total $3,240 vs limit $3,000").
4. Slots marked "could not verify" are a warning, not a fail, unless they are the only temple or food item on a day.
5. Never rewrite the plan. Never suggest places. No em dashes.
```

- [ ] **Step 5: Verify Claude Code loads all four**

Run from repo root: `claude agents` (or start `claude` and type `/agents`).
Expected: `destination-research`, `logistics`, `budget`, `review` listed under project agents. If a name is missing, the YAML is invalid, check for a tab or a stray colon.

- [ ] **Step 6: Commit**

```bash
git add .claude/agents
git commit -m "add destination, logistics, budget and review agents

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Orchestrator procedure and `/plan-trip` skill

**Files:**
- Modify: `CLAUDE.md` (append orchestration section)
- Create: `.claude/skills/plan-trip/SKILL.md`, `.claude/skills/plan-trip/itinerary-template.md`

**Interfaces:**
- Consumes: agents from Task 9, contracts from Task 8.
- Produces: `trips/<slug>/00-brief.json`, `04-itinerary-draft.md`, `itinerary.md`, `itinerary.json`. The SDK path (Task 12) sends the same prompt the skill uses, so keep the procedure in the skill body and reference it from CLAUDE.md.

- [ ] **Step 1: Write `.claude/skills/plan-trip/SKILL.md`**

```markdown
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
2. Every slot copies its crowd tactic and Source from the destinations file.
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
2. Write `trips/<slug>/itinerary.json` matching `docs/contracts/itinerary.schema.json`. `generated_on` is today in DD-MM-YYYY. `review` is the last `05-review.json`. `warnings` mirrors the Warnings section.
3. Reply with: the slug, pass or fail, total vs limit, and the path to `itinerary.md`.

## Hard rules

1. Dates DD-MM-YYYY everywhere. No em dashes.
2. Never add a place, price or time that is not in a worker file.
3. Never run the repair loop twice.
```

- [ ] **Step 2: Write `.claude/skills/plan-trip/itinerary-template.md`**

```markdown
# <Title: N days in <destination>: <cities>>

Generated on DD-MM-YYYY. Budget $<limit>. Likes: <likes>. Avoids: <avoids>.

## Warnings
(only if the final review failed, one numbered line per failing check)

## Where you stay
| City | Nights | Area | Why | Example hotels (rating, price level) | Est. per night USD |

## Getting between cities
| From | To | Mode | Line | Duration min | Fare USD | Source |

## Day 1: <City>, <area>
| When | What | Kind | Why it fits | Crowd tactic | Transit min from previous | Est. USD | Source |
| morning | | | | | | | |
| afternoon | | | | | | | |
| evening | | | | | | | |

(repeat per day)

## How we handled crowds
1. ...

## Budget
| Category | USD | Basis |
| stay | | <nights> x midpoint <band> |
| transport | | train + <days> x local transit |
| food | | <days> x midpoint |
| activities | | <n> temple entries x midpoint |
| buffer | | 10% |
| **Total** | | vs limit $<limit> |

If over: (alternatives from budget file, in order)
```

- [ ] **Step 3: Append to `CLAUDE.md`**

```markdown

## Orchestration

The planning procedure lives in `.claude/skills/plan-trip/SKILL.md`. Both the terminal (`/plan-trip`) and the web app (Agent SDK) run that procedure. Do not duplicate it here. Agent contracts are in `docs/contracts/`.
```

- [ ] **Step 4: Dry-run the flow once in the terminal**

Run: `claude` in repo root, then `/plan-trip Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.`
Expected: three subagents launch in one message, four worker files plus `05-review.json`, `itinerary.md` and `itinerary.json` appear under `trips/japan-tokyo-kyoto-<hash>/`. Note wall time. If the fan-out is sequential, edit Step 2 wording to "You must call the Agent tool three times in a single response".

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/skills/plan-trip
git commit -m "add plan-trip orchestrator skill and itinerary template

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Review agent fixtures and headless eval

**Files:**
- Create: `tests/review-fixtures/brief.json`, five drafts `tests/review-fixtures/<case>/04-itinerary-draft.md`, `tests/review-fixtures/expected.json`, `scripts/review_eval.sh`

**Interfaces:**
- Consumes: `review` agent (Task 9) via `claude -p`.
- Produces: a script that exits non-zero when any fixture's pass/fail per check differs from expected.

- [ ] **Step 1: Write `tests/review-fixtures/brief.json`** (copy of `docs/contracts/examples/brief.example.json` with slug `fixture`).

- [ ] **Step 2: Write the five drafts.** Each is a full `04-itinerary-draft.md` in the Task 10 template shape. Start from the real draft produced in Task 10 Step 4 (copy it to `clean/`), then derive:
  1. `clean/`: unchanged, all six should pass.
  2. `over-budget/`: change the stay line so Total = limit + 300.
  3. `missing-kyoto/`: replace every Kyoto day with a Tokyo day.
  4. `six-days/`: add a `## Day 6` section.
  5. `no-crowd-tactics/`: blank the Crowd tactic column on every Day 2 row.

- [ ] **Step 3: Write `tests/review-fixtures/expected.json`**

```json
{
  "clean":            {"days_fit": true,  "cities_included": true,  "within_budget": true,  "matches_likes": true, "avoids_crowds": true,  "travel_time_realistic": true},
  "over-budget":      {"days_fit": true,  "cities_included": true,  "within_budget": false, "matches_likes": true, "avoids_crowds": true,  "travel_time_realistic": true},
  "missing-kyoto":    {"days_fit": true,  "cities_included": false, "within_budget": true,  "matches_likes": true, "avoids_crowds": true,  "travel_time_realistic": true},
  "six-days":         {"days_fit": false, "cities_included": true,  "within_budget": true,  "matches_likes": true, "avoids_crowds": true,  "travel_time_realistic": true},
  "no-crowd-tactics": {"days_fit": true,  "cities_included": true,  "within_budget": true,  "matches_likes": true, "avoids_crowds": false, "travel_time_realistic": true}
}
```

- [ ] **Step 4: Write `scripts/review_eval.sh`**

```bash
#!/usr/bin/env bash
# Runs the review agent headless on each fixture and compares pass/fail per check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/tests/review-fixtures"
fail=0
for case_dir in "$FIX"/*/; do
  name="$(basename "$case_dir")"
  work="$ROOT/trips/fixture-$name"
  rm -rf "$work" && mkdir -p "$work"
  cp "$FIX/brief.json" "$work/00-brief.json"
  cp "$case_dir/04-itinerary-draft.md" "$work/04-itinerary-draft.md"
  claude -p "Use the review subagent. Brief: trips/fixture-$name/00-brief.json. Draft: trips/fixture-$name/04-itinerary-draft.md" \
    --allowedTools "Agent,Read,Write" --max-turns 12 >/dev/null
  python3 - "$name" "$work/05-review.json" "$FIX/expected.json" <<'PY' || fail=1
import json, sys
name, got_path, exp_path = sys.argv[1:]
got = {c["id"]: c["pass"] for c in json.load(open(got_path))["checks"]}
exp = json.load(open(exp_path))[name]
diff = {k: (exp[k], got.get(k)) for k in exp if exp[k] != got.get(k)}
print(f"{name}: {'OK' if not diff else 'MISMATCH ' + json.dumps(diff)}")
sys.exit(1 if diff else 0)
PY
done
exit $fail
```

- [ ] **Step 5: Run it**

Run: `chmod +x scripts/review_eval.sh && ./scripts/review_eval.sh`
Expected: five `OK` lines, exit 0. If a check mismatches, tighten the wording of that check in `.claude/agents/review.md` (not the fixture) and re-run. Two rounds maximum, then report the disagreement.

- [ ] **Step 6: Commit**

```bash
git add tests/review-fixtures scripts/review_eval.sh
git commit -m "add review agent fixtures and headless eval script

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11b: Worker and orchestrator evals over a real run folder

**Why:** Task 11 evaluates only the review agent. Nothing checks the three workers' files or the orchestrator's output. This task adds a mechanical eval that runs over any `trips/<slug>/` folder and fails on a structural defect. It is a hygiene gate (structure and contracts), not a quality judgement (see L-032 in the global ledger).

**Files:**
- Create: `scripts/worker_eval.py`, `scripts/tests/test_worker_eval.py`, `scripts/tests/fixtures/run-ok/` (a copy of the Task 10 dry-run folder, with the slug replaced by `run-ok`), `scripts/tests/fixtures/run-bad/` (derived from run-ok with five deliberate defects)
- Modify: `docs/superpowers/specs/19-09-2026-travel-planner-multi-agent-design.md` section 9 (add the worker and orchestrator eval line), `docs/superpowers/specs/changelog.md` (one row), `docs/decisions.md` (D-018)

**Interfaces:**
- Consumes: `docs/contracts/*.schema.json`, the file layout the agents write (`00-brief.json`, `01-destinations.md`, `02-logistics.md`, `03-budget.md`, `04-itinerary-draft.md`, `05-review.json`, `itinerary.md`, `itinerary.json`), optionally the `--output-format json` log of a `claude -p` run.
- Produces: `python3 scripts/worker_eval.py trips/<slug> [--run-log <file.json>]` printing one `PASS`/`FAIL` line per check and exiting 1 on any FAIL. Used by Task 16 as the handover gate.

Run with `uv run --project mcp/travel-tools --with jsonschema python scripts/worker_eval.py ...` so `jsonschema` is available without adding it to the MCP package.

- [ ] **Step 1: Write the failing test `scripts/tests/test_worker_eval.py`**

```python
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "worker_eval.py"
FIX = Path(__file__).parent / "fixtures"


def run(folder, *extra):
    return subprocess.run(
        ["uv", "run", "--project", "mcp/travel-tools", "--with", "jsonschema", "python", str(SCRIPT), str(folder), *extra],
        cwd=ROOT, capture_output=True, text=True,
    )


def test_ok_run_passes_every_check():
    p = run(FIX / "run-ok")
    assert p.returncode == 0, p.stdout + p.stderr
    assert "FAIL" not in p.stdout
    assert p.stdout.count("PASS") >= 12


def test_bad_run_fails_the_five_seeded_defects():
    p = run(FIX / "run-bad")
    assert p.returncode == 1
    fails = [line for line in p.stdout.splitlines() if line.startswith("FAIL")]
    ids = {line.split()[1] for line in fails}
    assert ids == {"dest.crowd_tactic", "dest.source", "logi.nights", "budget.fx", "itin.days"}, fails


def test_missing_folder_is_a_clean_failure():
    p = run(FIX / "does-not-exist")
    assert p.returncode == 2
    assert "not found" in p.stderr
```

- [ ] **Step 2: Build the fixtures**

`run-ok`: copy the dry-run folder from Task 10 (`cp -r trips/<slug> scripts/tests/fixtures/run-ok`) and replace the slug string inside `00-brief.json` and `itinerary.json` with `run-ok`. It must already pass every check below; if it does not, the defect is in the agents or the skill, fix that first (as a Task 10 fix round), never the checker.

`run-bad`: copy `run-ok` to `run-bad`, then introduce exactly these five defects:
1. `01-destinations.md`: blank the Crowd tactic cell of one Must-do row (leave the pipes).
2. `01-destinations.md`: change one row's Source cell to `memory`.
3. `02-logistics.md`: change one Nights value so the sum is `days` instead of `days - 1`.
4. `03-budget.md`: change the FX line to `1 USD = 157.89 JPY on 2026-09-18 (Frankfurter)` (ISO date).
5. `itinerary.md`: add a `## Day 6: Kyoto, Gion` heading with one empty table row.

- [ ] **Step 3: Run, expect failure**

Run: `uv run --project mcp/travel-tools --with jsonschema python -m pytest scripts/tests -q`
Expected: FAIL, script not found.

- [ ] **Step 4: Write `scripts/worker_eval.py`**

```python
"""Structural eval over one trips/<slug>/ folder. Hygiene gate, not a quality judgement."""
import argparse
import json
import re
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "docs" / "contracts"
DDMMYYYY = re.compile(r"\b\d{2}-\d{2}-\d{4}\b")
ISO = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")

results: list[tuple[str, str, str]] = []


def check(cid: str, ok: bool, detail: str) -> None:
    results.append(("PASS" if ok else "FAIL", cid, detail))


def table_rows(md: str, heading: str) -> list[list[str]]:
    """Rows of the first markdown table under a heading that starts with `heading` (any level)."""
    m = re.search(rf"^#+\s*{re.escape(heading)}.*?$", md, re.M)
    if not m:
        return []
    body = md[m.end():]
    nxt = re.search(r"^#+\s", body, re.M)
    if nxt:
        body = body[: nxt.start()]
    rows = []
    for line in body.splitlines():
        if line.startswith("|") and not re.match(r"^\|\s*-", line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
    return rows[1:] if rows else []  # drop header


def col(rows: list[list[str]], header_rows: list[list[str]], name: str) -> list[str]:
    """Values of column `name` (case-insensitive prefix match on the header row)."""
    if not header_rows:
        return []
    hdr = [h.lower() for h in header_rows[0]]
    idx = next((i for i, h in enumerate(hdr) if h.startswith(name.lower())), None)
    if idx is None:
        return []
    return [r[idx] if idx < len(r) else "" for r in rows]


def section_tables(md: str, heading: str) -> tuple[list[list[str]], list[list[str]]]:
    m = re.search(rf"^#+\s*{re.escape(heading)}.*?$", md, re.M)
    if not m:
        return [], []
    body = md[m.end():]
    nxt = re.search(r"^#+\s", body, re.M)
    if nxt:
        body = body[: nxt.start()]
    header = []
    rows = []
    for line in body.splitlines():
        if line.startswith("|") and not re.match(r"^\|\s*-", line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not header:
                header = [cells]
            else:
                rows.append(cells)
    return rows, header


def eval_brief(folder: Path) -> dict:
    brief = json.loads((folder / "00-brief.json").read_text())
    schema = json.loads((CONTRACTS / "brief.schema.json").read_text())
    try:
        jsonschema.validate(brief, schema)
        check("brief.schema", True, "00-brief.json validates")
    except jsonschema.ValidationError as e:
        check("brief.schema", False, f"00-brief.json: {e.message}")
    return brief


def eval_destinations(folder: Path, brief: dict) -> None:
    md = (folder / "01-destinations.md").read_text()
    total_bad_tactic = 0
    total_bad_source = 0
    for city in brief["cities"]:
        city_md = md.split(f"## {city}", 1)[1] if f"## {city}" in md else ""
        nxt = re.search(r"^## ", city_md, re.M)
        if nxt:
            city_md = city_md[: nxt.start()]
        must, must_h = section_tables(city_md, "Must-do")
        nice, nice_h = section_tables(city_md, "Nice-to-have")
        n = len(must) + len(nice)
        check(f"dest.count.{city}", 6 <= n <= 10, f"{city}: {n} candidates (need 6 to 10)")
        check(f"dest.mustdo.{city}", 3 <= len(must) <= 4, f"{city}: {len(must)} must-do (need 3 to 4)")
        for rows, hdr in ((must, must_h), (nice, nice_h)):
            for tactic in col(rows, hdr, "Crowd"):
                if len(tactic.strip()) < 8:
                    total_bad_tactic += 1
            for src in col(rows, hdr, "Source"):
                if src.strip().lower() not in ("tool", "could not verify"):
                    total_bad_source += 1
    check("dest.crowd_tactic", total_bad_tactic == 0, f"{total_bad_tactic} rows with an empty or vague crowd tactic")
    check("dest.source", total_bad_source == 0, f"{total_bad_source} rows with Source not in (tool, could not verify)")


def eval_logistics(folder: Path, brief: dict) -> None:
    md = (folder / "02-logistics.md").read_text()
    rows, hdr = section_tables(md, "Night split")
    nights = [int(x) for x in col(rows, hdr, "Nights") if x.strip().isdigit()]
    check("logi.nights", sum(nights) == brief["days"] - 1, f"nights sum {sum(nights)} vs days-1 = {brief['days'] - 1}")
    rows, hdr = section_tables(md, "Inter-city")
    srcs = [s.lower() for s in col(rows, hdr, "Source")]
    check("logi.intercity", len(rows) >= 1 and all(("seed" in s or "could not verify" in s) for s in srcs), f"{len(rows)} inter-city rows, sources {srcs}")
    for city in brief["cities"]:
        rows, hdr = section_tables(md, city)
        check(f"logi.hotels.{city}", len(rows) >= 4, f"{city}: {len(rows)} hotel rows (need 4: 2 areas x 2 hotels)")


def eval_budget(folder: Path) -> None:
    md = (folder / "03-budget.md").read_text()
    fx = re.search(r"1 USD = (.+?) JPY on (\S+)", md)
    ok = bool(fx) and (DDMMYYYY.fullmatch(fx.group(2).rstrip(".,)")) is not None or "could not verify" in fx.group(1))
    check("budget.fx", ok, f"FX line: {fx.group(0) if fx else 'missing'}")
    rows, hdr = section_tables(md, "Category split")
    shares = [int(s.rstrip("%")) for s in col(rows, hdr, "Share") if s.rstrip("%").isdigit()]
    check("budget.shares", sum(shares) == 100, f"category shares sum {sum(shares)}")
    check("budget.no_iso", not ISO.search(md), "no ISO dates in 03-budget.md")


def eval_itinerary(folder: Path, brief: dict) -> None:
    md = (folder / "itinerary.md").read_text()
    days = re.findall(r"^## Day (\d+)", md, re.M)
    check("itin.days", [int(d) for d in days] == list(range(1, brief["days"] + 1)), f"day headings {days} vs 1..{brief['days']}")
    check("itin.no_iso", not ISO.search(md), "no ISO dates in itinerary.md")
    data = json.loads((folder / "itinerary.json").read_text())
    schema = json.loads((CONTRACTS / "itinerary.schema.json").read_text())
    resolver = jsonschema.RefResolver(base_uri=CONTRACTS.as_uri() + "/", referrer=schema)
    try:
        jsonschema.validate(data, schema, resolver=resolver)
        check("itin.schema", True, "itinerary.json validates")
    except jsonschema.ValidationError as e:
        check("itin.schema", False, f"itinerary.json: {e.message} at {list(e.absolute_path)}")
    review = json.loads((folder / "05-review.json").read_text())
    check("review.six", len(review.get("checks", [])) == 6, f"{len(review.get('checks', []))} review checks")


def eval_run_log(path: Path) -> None:
    """Orchestrator check: at least one assistant message carried three Agent tool_use blocks."""
    raw = json.loads(path.read_text())
    msgs = raw if isinstance(raw, list) else raw.get("messages", [raw])
    best = 0
    for m in msgs:
        content = (m.get("message") or {}).get("content") or m.get("content") or []
        if isinstance(content, list):
            n = sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Agent")
            best = max(best, n)
    check("orch.parallel", best >= 3, f"max Agent calls in one assistant message: {best} (need 3)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--run-log")
    a = ap.parse_args()
    folder = Path(a.folder)
    if not folder.is_dir():
        print(f"run folder not found: {folder}", file=sys.stderr)
        return 2
    brief = eval_brief(folder)
    eval_destinations(folder, brief)
    eval_logistics(folder, brief)
    eval_budget(folder)
    eval_itinerary(folder, brief)
    if a.run_log:
        eval_run_log(Path(a.run_log))
    for status, cid, detail in results:
        print(f"{status} {cid}: {detail}")
    return 1 if any(s == "FAIL" for s, _, _ in results) else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run, expect pass**

Run: `uv run --project mcp/travel-tools --with jsonschema python -m pytest scripts/tests -q`
Expected: 3 passed. If `run-ok` fails a check, read the failing line: if the agent output is genuinely missing the thing (for example no Source column), that is a real defect in the agent or the skill and goes back as a Task 10 fix round; if the checker's table parsing is wrong for a valid layout, fix the checker and say which.

- [ ] **Step 6: Wire it into the spec and the docs**

1. Spec section 9, add line 5: `5. Worker and orchestrator structure: scripts/worker_eval.py over any trips/<slug>/ folder (candidate counts, crowd tactics, sources, night split, FX format, day headings, itinerary.json schema, six review checks, parallel fan-out from the run log). Hygiene gate, run before handover.`
2. `docs/superpowers/specs/changelog.md`: one row, section 9, "worker and orchestrator eval added", why: nothing evaluated the three workers or the orchestrator, trigger: Aman asked whether evals existed after the first dry run, decision D-018.
3. `docs/decisions.md`: D-018 row: mechanical structural eval over run folders, options: LLM-judge eval vs mechanical, why: structure is what can be checked deterministically and it is where the last three review findings lived, cost: says nothing about quality, applied in `scripts/worker_eval.py`, Task 16.
4. `CLAUDE.md` Commands table: add a row `| Structural eval of a run | uv run --project mcp/travel-tools --with jsonschema python scripts/worker_eval.py trips/<slug> |`.

- [ ] **Step 7: Commit**

```bash
git add scripts/worker_eval.py scripts/tests docs/superpowers/specs docs/decisions.md CLAUDE.md
git commit -m "add worker and orchestrator structural eval

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Next.js scaffold, types, SDK-to-event mapper

**Files:**
- Create: `web/` via `create-next-app`, `web/lib/types.ts`, `web/lib/sdk-to-events.ts`, `web/lib/sdk-to-events.test.ts`, `web/.env.local` (gitignored, copy of root `.env`)

**Interfaces:**
- Produces: `AgentId`, `AgentEvent`, `RunState`, `Itinerary` types. `toAgentEvents(msg: SDKMessage, agentByToolUseId: Map<string, AgentId>): AgentEvent[]`.

- [ ] **Step 1: Scaffold**

```bash
cd web 2>/dev/null || npx --yes create-next-app@14 web --typescript --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm
cd web && npm install @anthropic-ai/claude-agent-sdk @mui/material @emotion/react @emotion/styled zustand && npm install -D vitest
```

Add to `web/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write `web/lib/types.ts`**

```ts
export type AgentId = "orchestrator" | "destination-research" | "logistics" | "budget" | "review";
export const AGENT_IDS: AgentId[] = ["orchestrator", "destination-research", "logistics", "budget", "review"];

export type AgentStatus = "waiting" | "running" | "revising" | "done" | "failed";

export type AgentEvent =
  | { type: "status"; agent: AgentId; status: AgentStatus }
  | { type: "tool_call"; agent: AgentId; tool: string; args: Record<string, unknown> }
  | { type: "text"; agent: AgentId; text: string }
  | { type: "summary"; agent: AgentId; lines: string[] }
  | { type: "step"; text: string }
  | { type: "result"; slug: string | null; ok: boolean; error?: string };

export interface ReviewCheck { id: string; label: string; pass: boolean; reason: string }
export interface Review { pass: boolean; checks: ReviewCheck[]; failures: { check_id: string; owner: string; instruction: string }[] }

export interface Slot {
  when: "morning" | "afternoon" | "evening";
  name: string; kind: "temple" | "food" | "sight" | "transit" | "free";
  area?: string; why?: string; crowd_tactic: string;
  transit_min_from_prev: number | null; est_cost_usd?: number | null;
  source?: "tool" | "seed" | "estimate" | "could not verify";
}
export interface Day { day: number; date?: string | null; city: string; area: string; slots: Slot[] }
export interface Stay { city: string; nights: number; area: string; why: string; est_nightly_usd?: number | null; examples: { name: string; rating?: number | null; price_level?: string | null }[] }
export interface Intercity { from: string; to: string; mode: string; duration_min: number; fare_usd?: number | null; source: string }
export interface BudgetLine { category: "stay" | "transport" | "food" | "activities" | "buffer"; usd: number; basis: string }
export interface Budget { limit_usd: number; total_usd: number; within_budget: boolean; lines: BudgetLine[]; alternatives?: string[]; fx?: { rate: number; date: string } }

export interface Itinerary {
  slug: string; title: string; generated_on: string;
  brief: { request: string; destination: string; days: number; cities: string[]; budget_usd: number; likes: string[]; avoids: string[] };
  days: Day[]; stays: Stay[]; intercity: Intercity[]; budget: Budget;
  crowd_strategy: string[]; review: Review; warnings?: string[];
}

export interface RunState {
  phase: "idle" | "running" | "done" | "error";
  agents: Record<AgentId, { status: AgentStatus; toolCalls: { tool: string; args: Record<string, unknown> }[]; text: string; summary: string[] }>;
  steps: string[];
  slug: string | null;
  itinerary: Itinerary | null;
  error: string | null;
}
```

- [ ] **Step 3: Write failing test `web/lib/sdk-to-events.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { toAgentEvents } from "./sdk-to-events";

const assistant = (content: unknown[], parent: string | null = null) =>
  ({ type: "assistant", parent_tool_use_id: parent, message: { content } }) as never;

describe("toAgentEvents", () => {
  it("maps an Agent tool_use in the main session to a running status and remembers the id", () => {
    const map = new Map<string, "orchestrator" | "destination-research" | "logistics" | "budget" | "review">();
    const ev = toAgentEvents(assistant([{ type: "tool_use", id: "t1", name: "Agent", input: { subagent_type: "logistics", prompt: "Brief: x" } }]), map);
    expect(ev).toEqual([{ type: "status", agent: "logistics", status: "running" }]);
    expect(map.get("t1")).toBe("logistics");
  });

  it("attributes a subagent mcp tool call to its agent and strips the mcp prefix", () => {
    const map = new Map([["t1", "logistics" as const]]);
    const ev = toAgentEvents(assistant([{ type: "tool_use", id: "t9", name: "mcp__travel-tools__get_rail_route", input: { origin_city: "Tokyo", destination_city: "Kyoto" } }], "t1"), map);
    expect(ev).toEqual([{ type: "tool_call", agent: "logistics", tool: "get_rail_route", args: { origin_city: "Tokyo", destination_city: "Kyoto" } }]);
  });

  it("turns a subagent's final text into a summary", () => {
    const map = new Map([["t1", "budget" as const]]);
    const ev = toAgentEvents(assistant([{ type: "text", text: "a\nb\nc" }], "t1"), map);
    expect(ev).toEqual([{ type: "text", agent: "budget", text: "a\nb\nc" }]);
  });

  it("marks the agent done when the main session receives its tool_result", () => {
    const map = new Map([["t1", "budget" as const]]);
    const msg = { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "1\n2\n3" }] } } as never;
    expect(toAgentEvents(msg, map)).toEqual([
      { type: "summary", agent: "budget", lines: ["1", "2", "3"] },
      { type: "status", agent: "budget", status: "done" },
    ]);
  });

  it("emits a step for main-session text starting with 'Step'", () => {
    expect(toAgentEvents(assistant([{ type: "text", text: "Step 2: Fan out" }]), new Map())).toEqual([
      { type: "text", agent: "orchestrator", text: "Step 2: Fan out" },
      { type: "step", text: "Step 2: Fan out" },
    ]);
  });
});
```

- [ ] **Step 4: Run, expect failure**

Run: `cd web && npm test`
Expected: FAIL, module not found.

- [ ] **Step 5: Write `web/lib/sdk-to-events.ts`**

```ts
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, AgentId } from "./types";

const KNOWN: AgentId[] = ["destination-research", "logistics", "budget", "review"];
const MCP_PREFIX = "mcp__travel-tools__";

function contentOf(msg: unknown): unknown[] {
  const m = msg as { message?: { content?: unknown } };
  const c = m.message?.content;
  return Array.isArray(c) ? c : [];
}

export function toAgentEvents(msg: SDKMessage, agentByToolUseId: Map<string, AgentId>): AgentEvent[] {
  const out: AgentEvent[] = [];
  const parent = (msg as { parent_tool_use_id?: string | null }).parent_tool_use_id ?? null;
  const agent: AgentId = parent ? (agentByToolUseId.get(parent) ?? "orchestrator") : "orchestrator";

  if (msg.type === "assistant") {
    for (const block of contentOf(msg) as { type: string; [k: string]: unknown }[]) {
      if (block.type === "tool_use") {
        const name = String(block.name);
        const input = (block.input ?? {}) as Record<string, unknown>;
        if (name === "Agent" && !parent) {
          const sub = String(input.subagent_type ?? "");
          if ((KNOWN as string[]).includes(sub)) {
            agentByToolUseId.set(String(block.id), sub as AgentId);
            out.push({ type: "status", agent: sub as AgentId, status: "running" });
          }
        } else {
          out.push({ type: "tool_call", agent, tool: name.startsWith(MCP_PREFIX) ? name.slice(MCP_PREFIX.length) : name, args: input });
        }
      } else if (block.type === "text") {
        const text = String(block.text);
        out.push({ type: "text", agent, text });
        if (!parent && /^Step \d/.test(text.trim())) out.push({ type: "step", text: text.trim().split("\n")[0] });
      }
    }
  } else if (msg.type === "user" && !parent) {
    for (const block of contentOf(msg) as { type: string; [k: string]: unknown }[]) {
      if (block.type === "tool_result") {
        const id = String(block.tool_use_id);
        const who = agentByToolUseId.get(id);
        if (!who) continue;
        const raw = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        out.push({ type: "summary", agent: who, lines: raw.split("\n").filter(Boolean).slice(0, 3) });
        out.push({ type: "status", agent: who, status: "done" });
      }
    }
  } else if (msg.type === "result") {
    const r = msg as { subtype: string; result?: string; is_error?: boolean };
    const slug = (r.result ?? "").match(/[a-z]+(?:-[a-z]+)+-[0-9a-f]{4}/)?.[0] ?? null;
    out.push({ type: "result", slug, ok: r.subtype === "success" && !r.is_error, error: r.is_error ? r.result : undefined });
  }
  return out;
}
```

- [ ] **Step 6: Run, expect pass, commit**

Run: `cd web && npm test`
Expected: 5 passed.

```bash
git add web
git commit -m "scaffold next.js app with types and sdk event mapper

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `/api/plan` route: run the orchestrator and stream SSE

**Files:**
- Create: `web/app/api/plan/route.ts`, `web/app/api/trips/[slug]/route.ts`

**Interfaces:**
- Consumes: `toAgentEvents`, the `/plan-trip` skill.
- Produces: `POST /api/plan` body `{request: string}` streaming `text/event-stream` where each event is `data: <JSON AgentEvent>\n\n`. `GET /api/trips/<slug>` returns `trips/<slug>/itinerary.json`.

- [ ] **Step 1: Write `web/app/api/plan/route.ts`**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import { toAgentEvents } from "@/lib/sdk-to-events";
import type { AgentEvent, AgentId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function POST(req: Request) {
  const { request } = (await req.json()) as { request?: string };
  if (!request || request.trim().length < 10) {
    return new Response(JSON.stringify({ error: "request is required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      const agentByToolUseId = new Map<string, AgentId>();
      send({ type: "status", agent: "orchestrator", status: "running" });
      try {
        const q = query({
          prompt: `/plan-trip ${request.trim()}`,
          options: {
            cwd: REPO_ROOT,
            settingSources: ["project"],
            skills: ["plan-trip"],
            forwardSubagentText: true,
            permissionMode: "acceptEdits",
            allowedTools: ["Agent", "Read", "Write", "Skill", "mcp__travel-tools__*"],
            maxTurns: 80,
          },
        });
        for await (const msg of q) {
          for (const e of toAgentEvents(msg, agentByToolUseId)) send(e);
        }
        send({ type: "status", agent: "orchestrator", status: "done" });
      } catch (err) {
        send({ type: "result", slug: null, ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

- [ ] **Step 2: Write `web/app/api/trips/[slug]/route.ts`**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]+$/.test(params.slug)) return new Response("bad slug", { status: 400 });
  const file = path.resolve(process.cwd(), "..", "trips", params.slug, "itinerary.json");
  try {
    return new Response(await readFile(file, "utf8"), { headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
```

- [ ] **Step 3: Smoke the route with curl**

Run: `cd web && npm run dev` in one terminal, then in another:
`curl -N -X POST localhost:3000/api/plan -H 'Content-Type: application/json' -d '{"request":"Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds."}' | head -40`
Expected: a stream of `data: {"type":"status",...}` lines, with `tool_call` events naming `search_places`, `get_rail_route` and `get_walking_route`, and a final `result` with a slug. Then `curl localhost:3000/api/trips/<slug>` returns JSON.

If no `tool_call` events from subagents appear, `forwardSubagentText` is doing its job for text but tool blocks are missing: check the installed SDK version is >= 0.3.219 (`npm ls @anthropic-ai/claude-agent-sdk`).

- [ ] **Step 4: Commit**

```bash
git add web/app/api
git commit -m "add plan and trips api routes streaming agent events

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Zustand store and agent timeline UI

**Files:**
- Create: `web/store/run-store.ts`, `web/components/RequestForm.tsx`, `web/components/AgentTimeline.tsx`, `web/app/providers.tsx`
- Modify: `web/app/layout.tsx`, `web/app/page.tsx`

**Interfaces:**
- Produces: `useRunStore()` with `start(request)`, `apply(event)`, `loadTrip(slug)`, `reset()`.

- [ ] **Step 1: Write `web/store/run-store.ts`**

```ts
import { create } from "zustand";
import { AGENT_IDS, type AgentEvent, type AgentId, type Itinerary, type RunState } from "@/lib/types";

const emptyAgents = () =>
  Object.fromEntries(AGENT_IDS.map((id) => [id, { status: "waiting", toolCalls: [], text: "", summary: [] }])) as RunState["agents"];

interface Actions {
  start: (request: string) => Promise<void>;
  apply: (e: AgentEvent) => void;
  loadTrip: (slug: string) => Promise<void>;
  reset: () => void;
}

export const useRunStore = create<RunState & Actions>((set, get) => ({
  phase: "idle", agents: emptyAgents(), steps: [], slug: null, itinerary: null, error: null,

  reset: () => set({ phase: "idle", agents: emptyAgents(), steps: [], slug: null, itinerary: null, error: null }),

  apply: (e) => {
    const s = get();
    if (e.type === "status") {
      const prev = s.agents[e.agent];
      const status = e.status === "running" && prev.status === "done" ? "revising" : e.status;
      set({ agents: { ...s.agents, [e.agent]: { ...prev, status } } });
    } else if (e.type === "tool_call") {
      set({ agents: { ...s.agents, [e.agent]: { ...s.agents[e.agent], toolCalls: [...s.agents[e.agent].toolCalls, { tool: e.tool, args: e.args }] } } });
    } else if (e.type === "text") {
      set({ agents: { ...s.agents, [e.agent]: { ...s.agents[e.agent], text: s.agents[e.agent].text + "\n" + e.text } } });
    } else if (e.type === "summary") {
      set({ agents: { ...s.agents, [e.agent]: { ...s.agents[e.agent], summary: e.lines } } });
    } else if (e.type === "step") {
      set({ steps: [...s.steps, e.text] });
    } else if (e.type === "result") {
      set({ slug: e.slug, phase: e.ok ? "done" : "error", error: e.error ?? null });
      if (e.ok && e.slug) void get().loadTrip(e.slug);
    }
  },

  start: async (request) => {
    get().reset();
    set({ phase: "running" });
    const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request }) });
    if (!res.ok || !res.body) { set({ phase: "error", error: `HTTP ${res.status}` }); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const p of parts) if (p.startsWith("data: ")) get().apply(JSON.parse(p.slice(6)) as AgentEvent);
    }
  },

  loadTrip: async (slug) => {
    const res = await fetch(`/api/trips/${slug}`);
    if (res.ok) set({ slug, itinerary: (await res.json()) as Itinerary, phase: "done" });
  },
}));
```

- [ ] **Step 2: Write `web/app/providers.tsx`**

```tsx
"use client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { ReactNode } from "react";

const theme = createTheme({
  palette: { mode: "light", primary: { main: "#1d4ed8" }, background: { default: "#f7f7f5" } },
  shape: { borderRadius: 12 },
  typography: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
});

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>;
}
```

Wrap `{children}` in `web/app/layout.tsx` with `<Providers>`.

- [ ] **Step 3: Write `web/components/RequestForm.tsx`**

```tsx
"use client";
import { Button, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useRunStore } from "@/store/run-store";

const EXAMPLE = "Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.";

export function RequestForm() {
  const [text, setText] = useState(EXAMPLE);
  const phase = useRunStore((s) => s.phase);
  const start = useRunStore((s) => s.start);
  return (
    <Stack spacing={2}>
      <TextField multiline minRows={3} value={text} onChange={(e) => setText(e.target.value)} label="Your trip request" fullWidth />
      <Button variant="contained" size="large" disabled={phase === "running"} onClick={() => void start(text)} sx={{ alignSelf: "flex-start" }}>
        {phase === "running" ? "Planning..." : "Plan my trip"}
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 4: Write `web/components/AgentTimeline.tsx`**

```tsx
"use client";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { AGENT_IDS, type AgentId, type AgentStatus } from "@/lib/types";
import { useRunStore } from "@/store/run-store";

const LABEL: Record<AgentId, string> = {
  orchestrator: "Orchestrator", "destination-research": "Destination Research", logistics: "Logistics", budget: "Budget", review: "Review",
};
const COLOR: Record<AgentStatus, "default" | "info" | "warning" | "success" | "error"> = {
  waiting: "default", running: "info", revising: "warning", done: "success", failed: "error",
};

function fmtArgs(args: Record<string, unknown>) {
  return Object.values(args).filter((v) => typeof v === "string" || typeof v === "number").slice(0, 3).map((v) => JSON.stringify(v)).join(", ");
}

export function AgentTimeline() {
  const agents = useRunStore((s) => s.agents);
  const itinerary = useRunStore((s) => s.itinerary);
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" } }}>
      {AGENT_IDS.map((id) => {
        const a = agents[id];
        return (
          <Card key={id} variant="outlined" sx={{ opacity: a.status === "waiting" ? 0.6 : 1 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">{LABEL[id]}</Typography>
                <Chip size="small" label={a.status} color={COLOR[a.status]} />
              </Stack>
              {a.toolCalls.map((c, i) => (
                <Typography key={i} variant="caption" component="div" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                  {c.tool}({fmtArgs(c.args)})
                </Typography>
              ))}
              {a.summary.length > 0 && (
                <Box sx={{ mt: 1 }}>{a.summary.map((l, i) => <Typography key={i} variant="body2">{l}</Typography>)}</Box>
              )}
              {id === "review" && itinerary && (
                <Box sx={{ mt: 1 }}>
                  {itinerary.review.checks.map((c) => (
                    <Typography key={c.id} variant="body2" color={c.pass ? "success.main" : "error.main"}>
                      {c.pass ? "PASS" : "FAIL"} {c.label}
                    </Typography>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 5: Write `web/app/page.tsx`** (ItineraryView is added in Task 15, leave the import out for now)

```tsx
import { Container, Stack, Typography } from "@mui/material";
import { AgentTimeline } from "@/components/AgentTimeline";
import { RequestForm } from "@/components/RequestForm";

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Typography variant="h4" component="h1">AI Travel Planner</Typography>
        <RequestForm />
        <AgentTimeline />
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 6: Drive it once in a browser**

Run `cd web && npm run dev`, open `http://localhost:3000`, click "Plan my trip".
Expected: Orchestrator chip goes `running`, three worker chips go `running` together, tool calls appear under Destination and Logistics as they happen, each worker flips to `done` with three summary lines, Review shows six PASS/FAIL lines at the end. Note anything that stays `waiting`, that is a mapping bug in Task 12, fix there.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "add run store, request form and agent timeline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Itinerary view

**Files:**
- Create: `web/components/ItineraryView.tsx`
- Modify: `web/app/page.tsx`

**Interfaces:**
- Consumes: `Itinerary` from the store.

- [ ] **Step 1: Write `web/components/ItineraryView.tsx`**

```tsx
"use client";
import { Alert, Box, Card, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useRunStore } from "@/store/run-store";

const usd = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

export function ItineraryView() {
  const it = useRunStore((s) => s.itinerary);
  if (!it) return null;
  const over = !it.budget.within_budget;
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">{it.title}</Typography>
        <Typography variant="body2" color="text.secondary">Generated on {it.generated_on}. Budget {usd(it.brief.budget_usd)}. Likes: {it.brief.likes.join(", ")}. Avoids: {it.brief.avoids.join(", ")}.</Typography>
      </Box>

      {it.warnings?.length ? <Alert severity="warning">{it.warnings.map((w, i) => <div key={i}>{i + 1}. {w}</div>)}</Alert> : null}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
        {it.stays.map((s) => (
          <Card key={s.city} variant="outlined"><CardContent>
            <Typography variant="subtitle1">{s.city}: {s.nights} nights in {s.area}</Typography>
            <Typography variant="body2" color="text.secondary">{s.why}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{s.examples.map((e) => `${e.name}${e.rating ? ` (${e.rating})` : ""}`).join(", ")}</Typography>
            {s.est_nightly_usd != null && <Typography variant="caption">About {usd(s.est_nightly_usd)} per night, estimate</Typography>}
          </CardContent></Card>
        ))}
      </Box>

      {it.intercity.map((r, i) => (
        <Alert key={i} severity="info" icon={false}>{r.from} to {r.to}: {r.mode}, {r.duration_min} min{r.fare_usd != null ? `, about ${usd(r.fare_usd)}` : ""} ({r.source})</Alert>
      ))}

      {it.days.map((d) => (
        <Card key={d.day} variant="outlined"><CardContent>
          <Typography variant="h6">Day {d.day}: {d.city}, {d.area}{d.date ? ` (${d.date})` : ""}</Typography>
          <Divider sx={{ my: 1 }} />
          {d.slots.map((s, i) => (
            <Stack key={i} direction="row" spacing={2} sx={{ py: 1 }} alignItems="flex-start">
              <Chip size="small" label={s.when} sx={{ minWidth: 88 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1">{s.name} <Typography component="span" variant="caption" color="text.secondary">{s.kind}{s.transit_min_from_prev ? `, ${s.transit_min_from_prev} min from previous` : ""}</Typography></Typography>
                {s.why && <Typography variant="body2" color="text.secondary">{s.why}</Typography>}
                <Typography variant="body2">Crowds: {s.crowd_tactic}</Typography>
                {s.source === "could not verify" && <Chip size="small" color="warning" label="could not verify" />}
              </Box>
              <Typography variant="body2">{usd(s.est_cost_usd)}</Typography>
            </Stack>
          ))}
        </CardContent></Card>
      ))}

      <Card variant="outlined"><CardContent>
        <Typography variant="h6">How we handled crowds</Typography>
        {it.crowd_strategy.map((c, i) => <Typography key={i} variant="body2">{i + 1}. {c}</Typography>)}
      </CardContent></Card>

      <Card variant="outlined"><CardContent>
        <Typography variant="h6">Budget</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Category</TableCell><TableCell align="right">USD</TableCell><TableCell>Basis</TableCell></TableRow></TableHead>
          <TableBody>
            {it.budget.lines.map((l) => <TableRow key={l.category}><TableCell>{l.category}</TableCell><TableCell align="right">{usd(l.usd)}</TableCell><TableCell>{l.basis}</TableCell></TableRow>)}
            <TableRow>
              <TableCell><b>Total</b></TableCell>
              <TableCell align="right" sx={{ color: over ? "error.main" : "success.main", fontWeight: 700 }}>{usd(it.budget.total_usd)}</TableCell>
              <TableCell>vs limit {usd(it.budget.limit_usd)}{over ? `, over by ${usd(it.budget.total_usd - it.budget.limit_usd)}` : ""}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {over && it.budget.alternatives?.length ? (
          <Box sx={{ mt: 1 }}>{it.budget.alternatives.map((a, i) => <Typography key={i} variant="body2">{i + 1}. {a}</Typography>)}</Box>
        ) : null}
        {it.budget.fx && <Typography variant="caption">1 USD = {it.budget.fx.rate} JPY on {it.budget.fx.date}</Typography>}
      </CardContent></Card>
    </Stack>
  );
}
```

- [ ] **Step 2: Add to `web/app/page.tsx`** after `<AgentTimeline />`: `<ItineraryView />` with its import.

- [ ] **Step 3: Load the sample without spending API calls**

Add a dev-only reload: in `web/app/page.tsx` nothing changes, but from the browser console run `fetch('/api/trips/<slug>')` for any finished slug and confirm it returns JSON. Then in the store, call `useRunStore.getState().loadTrip('<slug>')` from the console and confirm the itinerary renders: day cards, stays, intercity alert, budget table, crowd strip. Check the total colour flips when `within_budget` is false (edit the JSON temporarily, reload, then revert).

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "add itinerary view with days, stays, budget and crowd strip

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Sample run, end-to-end drive, date audit, handover

**Files:**
- Create: `trips/sample-japan/` (copy of a real successful run)
- Modify: `.gitignore` already whitelists it

- [ ] **Step 1: Produce the sample run through the UI**

Run the example request from the browser. When it finishes with `pass: true`, copy: `cp -r trips/<slug> trips/sample-japan` and inside it `sed -i '' "s/<slug>/sample-japan/g" trips/sample-japan/itinerary.json trips/sample-japan/00-brief.json`.

- [ ] **Step 2: Date format audit over everything handed over**

Run from repo root:
```bash
grep -rnE "[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* [0-9]{1,2},? [0-9]{4}" web/app web/components web/lib web/store trips/sample-japan .claude docs/contracts | grep -v node_modules
```
Expected hits are only: ISO strings inside API request bodies in `mcp/` (not in scope of this grep) and the `$schema` URL. Any date shown to a user, in a fixture, or in an agent file is a defect: fix it.

- [ ] **Step 3: Independent end-to-end check**

With `npm run dev` running, drive the real flow in a browser once more from a clean state and record, in `docs/handover-check.md`:
1. Wall time from click to itinerary.
2. Which agents showed `running` at the same time (must be three).
3. Count of `tool_call` lines under Destination and Logistics (must be >= 4 and >= 3).
4. Review card shows 6 lines.
5. Budget total colour matches `within_budget`.
6. Refreshing the page and calling `loadTrip` restores the itinerary.
7. `python3 ~/.claude/scripts/slop_check.py trips/sample-japan/itinerary.md` exit code.
8. `uv run --project mcp/travel-tools --with jsonschema python scripts/worker_eval.py trips/sample-japan --run-log <the run's json log>` prints no FAIL line.
If any line fails, fix the cause and re-run. Do not hand over with a failing line.

- [ ] **Step 4: Run every test suite one last time**

```bash
cd mcp/travel-tools && uv run pytest -q && cd ../../web && npm test && cd .. && ./scripts/review_eval.sh
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trips/sample-japan docs/handover-check.md
git commit -m "add sample japan run and handover check

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review against the spec

| Spec section | Task |
|---|---|
| 2 Decisions (runtime, APIs, hotels via Places, one repair loop, parallel fan-out) | 9, 10, 5 |
| 3 Architecture, artifacts in `trips/<slug>/` | 10 |
| 4 Agents, models, tool scoping, review independence, 3-line summaries | 9 |
| 5 MCP four tools, fail-fast, `{error}`, 24h cache, weather only with dates | 2 to 7, 9 rule 6 |
| 6 Front end: form, timeline with states incl. revising, tool calls, review checklist, itinerary view, SSE via SDK, reload from JSON | 12 to 15 |
| 7 Repo layout | 1, file map |
| 8 Error handling: key missing (7), tool error to "could not verify" (5, 6, 9), worker failure continues (10 Step 2 writes the section as unavailable, Step 5 covers the review-driven repair), over budget shown in red (15), SSE drop reload (14 `loadTrip`) | as listed |
| 9 Testing: MCP fixtures + live flag (2 to 7), review fixtures (11), sample run + browser drive (16) | as listed |
| 10 Success criteria | 16 Step 3 records all three |

Type consistency checked: `AgentId` values match agent `name:` fields. MCP tool names (`search_places`, `get_walking_route`, `get_rail_route`, `convert_currency`, `get_weather`) match between `server.py`, agent `tools:` lists and `MCP_PREFIX` in the mapper. Review check ids match between `review.md`, `review.schema.json`, `expected.json` and the UI.

Deviation from the spec, recorded: spec section 5 named a `get_transit_route` tool on Google Routes transit mode. Live probing on 19-09-2026 showed Routes transit returns nothing inside Japan, so it is replaced by `get_walking_route` (Routes WALK, verified working in Tokyo) plus `get_rail_route` (seeded from the official JR Central smartEX fare table). The spec is amended in the same commit.

