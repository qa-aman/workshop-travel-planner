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
        const raw =
          typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? (block.content as { type: string; text?: string }[])
                  .filter((c) => c.type === "text")
                  .map((c) => String(c.text ?? ""))
                  .join("\n")
              : JSON.stringify(block.content);
        out.push({ type: "summary", agent: who, lines: raw.split("\n").filter(Boolean).slice(0, 3) });
        out.push({ type: "status", agent: who, status: "done" });
      }
    }
  } else if (msg.type === "result") {
    const r = msg as { subtype: string; result?: string; is_error?: boolean };
    const text = r.result ?? "";
    const slug = text.match(/\btrips\/([a-z0-9]+(?:-[a-z0-9]+)+-[0-9a-f]{4})\b/)?.[1] ?? null;
    out.push({ type: "result", slug, ok: r.subtype === "success" && !r.is_error, error: r.is_error ? r.result : undefined });
  }
  return out;
}
