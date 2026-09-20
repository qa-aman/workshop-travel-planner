import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { toAgentEvents } from "@/lib/sdk-to-events";
import type { AgentEvent, AgentId } from "@/lib/types";

export const REPO_ROOT = path.resolve(process.cwd(), "..");

export async function hasGoogleMapsKey(): Promise<boolean> {
  if (process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API) return true;
  try {
    const envText = await readFile(path.join(REPO_ROOT, ".env"), "utf8");
    return /^(GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API)=/m.test(envText);
  } catch {
    return false;
  }
}

/**
 * Runs a Claude Code prompt through the Agent SDK and streams its AgentEvents back as SSE.
 * Shared by /api/plan and /api/revise, the only differences between the two routes are the
 * prompt string, which skill to preload, and what slug to report on a failed run.
 */
export function runAgentStream(promptString: string, skillName: string, slugOnError: string | null): Response {
  const encoder = new TextEncoder();
  // Contract (spec section 8.5): a client disconnect must never stop the planner run.
  // The browser can close the SSE connection at any time (tab close, navigation, network
  // drop); the ReadableStream's `cancel()` fires when that happens. From that point on,
  // `controller.enqueue()` throws, so `send` becomes a no-op instead of throwing back into
  // the `for await` loop below. The loop keeps draining `q` to completion regardless of
  // `closed`, so the orchestrator finishes its run and writes `trips/<slug>/` to disk even
  // with nobody listening. `controller.close()` is only called if the stream was never
  // cancelled, since closing an already-cancelled controller throws.
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
          prompt: promptString,
          options: {
            cwd: REPO_ROOT,
            settingSources: ["project"],
            model: "claude-sonnet-5",
            skills: [skillName],
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
        send({ type: "result", slug: slugOnError, ok: false, error: err instanceof Error ? err.message : String(err) });
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
