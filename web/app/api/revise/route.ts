import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toAgentEvents } from "@/lib/sdk-to-events";
import type { AgentEvent, AgentId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "..");

async function hasGoogleMapsKey(): Promise<boolean> {
  if (process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API) return true;
  try {
    const envText = await readFile(path.join(REPO_ROOT, ".env"), "utf8");
    return /^(GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API)=/m.test(envText);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const { slug, request } = (await req.json()) as { slug?: string; request?: string };
  if (!slug || slug.trim().length === 0) {
    return new Response(JSON.stringify({ error: "slug is required" }), { status: 400 });
  }
  if (!request || request.trim().length < 5) {
    return new Response(JSON.stringify({ error: "request is required" }), { status: 400 });
  }
  if (!(await hasGoogleMapsKey())) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set. Add it to .env at the repo root." }),
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  // Same disconnect contract as /api/plan (spec section 8.5): a dropped SSE connection
  // must never stop the revision run, see web/app/api/plan/route.ts for the full note.
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const agentByToolUseId = new Map<string, AgentId>();
      send({ type: "status", agent: "orchestrator", status: "running" });
      try {
        const q = query({
          prompt: `/revise-trip ${slug.trim()} ${request.trim()}`,
          options: {
            cwd: REPO_ROOT,
            settingSources: ["project"],
            model: "claude-sonnet-5",
            skills: ["revise-trip"],
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
        send({ type: "status", agent: "orchestrator", status: "failed" });
        send({ type: "result", slug: slug.trim(), ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            closed = true;
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
