# Moving to Google Cloud (Vertex AI) for the model calls

Date: 19-09-2026. Source: the official Claude Code doc [Claude Code on Google Cloud's Agent Platform](https://code.claude.com/docs/en/google-vertex-ai) (Google renamed Vertex AI to "Agent Platform", the login prompt still says "Google Vertex AI"). Every variable and command below is quoted from that page.

## 1. The short answer

1. **Yes, it can be done from Claude Code, and it is a configuration change, not a code change.** Claude Code has a built-in provider switch for Google Cloud. The terminal path, the four agents, the skill, the MCP server and the Next.js route all keep working. The only thing that changes is which endpoint the Claude model calls go to and who bills you.
2. **The models stay Claude.** Vertex serves Claude Sonnet and Opus from Google's infrastructure. This is not a way to use Gemini. See D-021 in `docs/decisions.md`.
3. **Two things you do outside Claude Code, once:** enable the API on a GCP project with billing, and request access to the Claude models in Model Garden (the doc says approval "may take 24-48 hours").

## 2. What changes and what does not

| Area | Change |
|---|---|
| `.claude/agents/*.md`, `.claude/skills/plan-trip/`, `CLAUDE.md` | None. Model aliases `sonnet` and `opus` in the agent frontmatter resolve on Vertex too. |
| `mcp/travel-tools/` | None. The MCP server never calls Claude, it calls Google Places, Routes, Frankfurter, Open-Meteo. |
| `docs/contracts/`, `trips/` | None. |
| Terminal (`claude --model sonnet` then `/plan-trip`) | Sign in once with the wizard (section 3). After that, identical. |
| Web route `web/app/api/plan/route.ts` (Task 13) | No code change. The SDK reads the same environment variables. `ANTHROPIC_API_KEY` is no longer needed. Set the Vertex variables in `web/.env.local` or the shell that runs `npm run dev`. |
| `.env.example` | Replace the `ANTHROPIC_API_KEY` line with the three Vertex variables from section 4. |
| Billing | Claude Platform invoice becomes a Google Cloud invoice on the project you choose. The doc recommends a dedicated GCP project for cost tracking. |

## 3. Steps, in order

### Once, on Google Cloud (outside Claude Code)

1. Have a GCP account with billing enabled and the `gcloud` CLI installed and logged in.
2. Enable the API on your project:
   ```bash
   gcloud config set project YOUR-PROJECT-ID
   gcloud services enable aiplatform.googleapis.com
   ```
3. Request access to the Claude models in Model Garden (search "Claude", request Sonnet and Opus). Wait for approval, the doc says 24 to 48 hours.
4. Make sure your account has the `roles/aiplatform.user` role (it includes `aiplatform.endpoints.predict`, which is what model calls need). Reference: [Agent Platform IAM](https://cloud.google.com/vertex-ai/docs/general/access-control).
5. Set up Application Default Credentials on this machine:
   ```bash
   gcloud auth application-default login
   ```

### Terminal path, inside Claude Code

6. Run `claude`. At the login prompt choose **3rd-party platform**, then **Google Vertex AI**. If already signed in, run `/login` to reach the same menu.
7. The wizard asks for credentials (pick Application Default Credentials), project and region, checks which Claude models the project can invoke, and lets you pin them. It writes the result into the `env` block of `~/.claude/settings.json`, so nothing needs exporting by hand.
8. Run `/status`. The `API provider` line must say `Google Vertex AI`, with your project, region and resolved model. If the provider line is missing, the variables are not reaching the process.
9. Run `/setup-vertex` any time to change project, region or model pins.

### Web path (Next.js, Task 13 onward)

10. Put these in `web/.env.local` (or export them in the shell that runs `npm run dev`). The Agent SDK does not load `.env` files itself, so the shell or Next.js must provide them:
    ```bash
    CLAUDE_CODE_USE_VERTEX=1
    CLOUD_ML_REGION=global
    ANTHROPIC_VERTEX_PROJECT_ID=YOUR-PROJECT-ID
    ```
    Remove `ANTHROPIC_API_KEY`. Application Default Credentials from step 5 are picked up automatically.
11. Restart `npm run dev` and run one plan. The route already passes `model: "claude-sonnet-5"`, which is a full model ID and therefore acts as a pin on Vertex.

## 4. Pin the models (recommended before the workshop)

Without pins, the doc says the `opus` alias resolves to Opus 5 and the `sonnet` alias to Sonnet 4.5 on Vertex, and Claude Code falls back to an older or lower tier at startup if the default is not enabled in your project. Pin explicitly so the demo runs the same models every time:

```bash
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-5'
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-5'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5@20251001'
```

The wizard in step 7 offers the same pins interactively. Sonnet 5 always runs with the 1M context window on Vertex, no `[1m]` suffix needed.

Region note: `CLOUD_ML_REGION=global` is the doc's recommended setting for availability. If a model does not support the global endpoint, set a per-model region such as `VERTEX_REGION_CLAUDE_HAIKU_4_5=us-east5`. Claude Code falls back to `us-east5` when nothing is set.

## 5. Restrictions and gotchas

1. **Model access is gated.** Nothing works until Model Garden approval lands. Plan for the 24 to 48 hour wait.
2. **Quota is per region.** The prerequisites list "quota allocated in desired GCP region". A brand-new project may have low Claude quota; the workshop run spawns 7 agents in one go, check quota before the session.
3. **Project ID wins over gcloud's default.** Claude Code sends requests to `ANTHROPIC_VERTEX_PROJECT_ID` even if `gcloud config` or `GOOGLE_APPLICATION_CREDENTIALS` point at another project.
4. **Opus pricing default.** The doc warns that a deployment that does not pin a primary model is billed at the Opus rate on recent versions. Our terminal command already sets `--model sonnet` and the web route passes `claude-sonnet-5`, so we are pinned, but set the `ANTHROPIC_DEFAULT_*` variables too.
5. **Not Gemini.** If the goal is a Gemini model rather than a Google bill, this path does not deliver it. That would be a rebuild outside Claude Code (D-021).
6. **claude.ai login is still not allowed for a product you give to others.** Vertex is the sanctioned way to run the web app for other people without a Claude Platform key.

## 6. Verification checklist after the switch

1. `/status` in the terminal shows `API provider: Google Vertex AI` and your project ID.
2. `claude -p "reply with the word ok" --model sonnet` returns `ok` (proves the headless path, which the web route uses).
3. `/plan-trip` example request completes end to end and `trips/<slug>/itinerary.json` validates (`scripts/worker_eval.py` once Task 11b lands).
4. Google Cloud console shows the calls under your project's Agent Platform usage.
5. Record the per-run cost from `--output-format json` (`total_cost_usd`) and compare with the $6.41 all-Opus baseline and the Sonnet-orchestrator figure from Task 16.

## 7. Effort estimate

| Step | Time |
|---|---|
| GCP project, API, IAM, ADC login | 20 minutes |
| Model Garden approval | wait, up to 48 hours |
| Claude Code wizard + `/status` | 5 minutes |
| `web/.env.local` + one web run | 10 minutes |
| Pins and quota check | 10 minutes |

No code changes. One `.env.example` edit and one row each in `docs/decisions.md` and `docs/tech-stack.md` section 4 when you do it.
