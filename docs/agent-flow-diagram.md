# Agent Flow: AI Travel Planner

Date: 19-09-2026. Reflects the built system after Task 11 (Sonnet orchestrator, five MCP tools, one repair loop). Diagrams are Mermaid and render on GitHub, in VS Code preview, and in Obsidian.

## 1. Control flow

**Summary:** one request enters, the orchestrator fans out to three workers in parallel, merges their files into a draft, sends it through an independent review gate, repairs at most once, and ships.

```mermaid
flowchart TD
    U([Traveller types request]) --> O1

    subgraph ORCH [Orchestrator, main Claude Code session, Sonnet]
        O1[Step 1 Parse request<br>writes 00-brief.json]
        O3[Step 3 Synthesise<br>merges 01 02 03 into<br>04-itinerary-draft.md]
        O5{Review passed}
        O5b[Step 5 Repair once<br>re-run only the owners<br>named in failures]
        O6[Step 6 Ship<br>itinerary.md<br>itinerary.json]
    end

    O1 --> FAN

    subgraph FAN [Step 2 Fan-out, three subagents in parallel, Sonnet]
        D[destination-research<br>temples, food areas, sights<br>crowd tactic on every row]
        L[logistics<br>stay areas, hotels, night split<br>Shinkansen, walking minutes]
        B[budget<br>category split, price bands<br>USD and JPY, cuts and upgrades]
    end

    D -->|01-destinations.md| O3
    L -->|02-logistics.md| O3
    B -->|03-budget.md| O3

    O3 --> R

    subgraph GATE [Step 4 Review gate, Sonnet, no tools]
        R[review<br>reads only brief and draft<br>six pass or fail checks<br>writes 05-review.json]
    end

    R --> O5
    O5 -- yes --> O6
    O5 -- no, first time --> O5b
    O5b --> FAN
    O5b -.->|re-synthesise then re-review once| O3
    O5 -- no, second time --> W[Ship with Warnings section]
    W --> O6
    O6 --> OUT([itinerary shown in terminal or web UI])

    style U fill:#2196F3,color:#fff
    style OUT fill:#4CAF50,color:#fff
    style R fill:#FF9800,color:#fff
    style W fill:#EF5350,color:#fff
    style O5b fill:#FF9800,color:#fff
```

**Key callouts:**
1. The three workers never talk to each other. They share only the brief in and files out.
2. The review agent has Read and Write but no MCP tools, and is never shown the worker files, only the brief and the draft. Independence is by prompt and by the absence of MCP tools, not by withholding Write, which it needs to write `05-review.json`.
3. The repair loop runs exactly once. A second failure ships with a `Warnings` section instead of looping.
4. On the second pass the orchestrator re-runs only the agents named in `failures[].owner`. An `owner` of `orchestrator` means it fixes the draft itself.

## 2. Data flow: who calls which tool, who writes which file

**Summary:** facts enter only through the `travel-tools` MCP server. Every fact carries a source label: `tool`, `seed`, `estimate`, or `could not verify`.

```mermaid
flowchart LR
    subgraph AGENTS [Agents]
        D[destination-research]
        L[logistics]
        B[budget]
        O[orchestrator]
        R[review]
    end

    subgraph MCP [travel-tools MCP server, Python]
        T1[search_places]
        T2[get_walking_route]
        T3[get_rail_route]
        T4[convert_currency]
        T5[get_weather]
    end

    subgraph EXT [Outside]
        G1[Google Places<br>Text Search]
        G2[Google Routes<br>WALK mode]
        J[(japan_rail.json<br>seeded from JR Central)]
        F[Frankfurter]
        M[Open-Meteo]
    end

    subgraph FILES [trips slug folder]
        F0[(00-brief.json)]
        F1[(01-destinations.md)]
        F2[(02-logistics.md)]
        F3[(03-budget.md)]
        F4[(04-itinerary-draft.md)]
        F5[(05-review.json)]
        F6[(itinerary.md<br>itinerary.json)]
    end

    O -->|writes| F0
    F0 -->|read by| D
    F0 -->|read by| L
    F0 -->|read by| B

    D --> T1
    D --> T5
    L --> T1
    L --> T2
    L --> T3
    B --> T4

    T1 --> G1
    T2 --> G2
    T3 --> J
    T4 --> F
    T5 --> M

    D -->|writes| F1
    L -->|writes| F2
    B -->|writes| F3
    F1 --> O
    F2 --> O
    F3 --> O
    O -->|writes| F4
    F0 --> R
    F4 --> R
    R -->|writes| F5
    F5 --> O
    O -->|writes| F6

    style R fill:#FF9800,color:#fff
    style J fill:#2196F3,color:#fff
```

**Key callouts:**
1. Google Routes has no transit data for Japan, so rail comes from a seeded file with the official JR Central fare (`seed`), and intra-city moves are walking minutes (`tool`). Agents never state a metro or bus time.
2. Google Places returns no price level for hotels, so stay prices are estimate bands from the budget agent, labelled as such.
3. Every tool response is cached on disk for 24 hours, weather 6 hours, so repeated demo runs cost no API calls.
4. The orchestrator never adds a place, price or time that is not in a worker file.

## 3. Responsibilities

| Agent | Model | Tools | Reads | Writes | Returns | Must never |
|---|---|---|---|---|---|---|
| orchestrator | Sonnet (main session) | Agent, Read, Write | request, then 01 02 03, then 05 | 00-brief.json, 04-itinerary-draft.md, itinerary.md, itinerary.json | slug, pass or fail, total vs limit | invent a fact, loop the repair twice |
| destination-research | Sonnet | search_places, get_weather | 00-brief.json | 01-destinations.md: 6 to 10 candidates per city, 3 to 4 must-do, crowd tactic and source on every row | 3 lines | plan days, pick hotels, price anything |
| logistics | Sonnet | search_places (lodging), get_walking_route, get_rail_route | 00-brief.json | 02-logistics.md: one base area per city, 2 hotel examples per area, night split, Shinkansen with seeded fare, day skeleton with walking minutes | 3 lines | state a metro or bus time, pick temples, sum a budget |
| budget | Sonnet | convert_currency | 00-brief.json, 02-logistics.md if present | 03-budget.md: category split, price bands USD and JPY, cuts if over, upgrades if under | 3 lines | total the itinerary, pick places |
| review | Sonnet | Read, Write only | 00-brief.json, 04-itinerary-draft.md | 05-review.json: six checks, failures with owner and instruction | PASS or FAIL with ids | see worker files, rewrite the plan, suggest places |

## 4. The six review checks

| Check id | Passes when | Failure owner |
|---|---|---|
| days_fit | exactly N day headings, none empty | logistics or orchestrator |
| cities_included | every requested city has a full day | logistics |
| within_budget | total recomputed from the budget lines is at or under the limit | budget |
| matches_likes | every day has a slot matching a like | destination-research |
| avoids_crowds | every venue slot has a concrete crowd tactic | destination-research |
| travel_time_realistic | no day over 90 min intra-city, inter-city day allots rail time plus 60 | logistics |

## 5. Run sequence over time

**Summary:** the same flow as a timeline, including where the parallelism is and where the loop closes.

```mermaid
sequenceDiagram
    participant U as Traveller
    participant O as Orchestrator (Sonnet)
    participant D as destination-research
    participant L as logistics
    participant B as budget
    participant M as travel-tools MCP
    participant R as review (Sonnet)

    U->>O: request
    O->>O: 00-brief.json
    par three background subagents
        O->>D: brief path
        O->>L: brief path
        O->>B: brief path
    end
    D->>M: search_places x4 or more per city
    L->>M: search_places lodging, get_rail_route, get_walking_route
    B->>M: convert_currency 1 USD to JPY
    D-->>O: 01-destinations.md, 3 lines
    L-->>O: 02-logistics.md, 3 lines
    B-->>O: 03-budget.md, 3 lines
    O->>O: 04-itinerary-draft.md
    O->>R: brief path, draft path
    R-->>O: 05-review.json, PASS or FAIL
    alt FAIL, first time
        O->>D: revision request naming check, slot and time of day
        O->>O: re-synthesise
        O->>R: re-review, last time
        R-->>O: PASS or FAIL
    end
    O->>O: itinerary.md, itinerary.json, Warnings if still failing
    O-->>U: slug, verdict, total vs limit
```

## 6. Measured on the first dry run (19-09-2026)

| Measure | Value |
|---|---|
| Wall time | 7 minutes |
| Subagents spawned | 7 (destination 2, logistics 2, budget 1, review 2, because the repair loop fired) |
| Review result | 5 of 6, shipped with one warning |
| Cost with an Opus orchestrator | $6.41, of which Opus $4.71 |
| Orchestrator model after that run | Sonnet (D-019) |
