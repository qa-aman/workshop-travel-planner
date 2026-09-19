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

  it("joins array tool_result content from every text block, ignoring non-text blocks", () => {
    const map = new Map([["t1", "budget" as const]]);
    const msg = {
      type: "user",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [
              { type: "text", text: "1" },
              { type: "text", text: "2\n3" },
            ],
          },
        ],
      },
    } as never;
    expect(toAgentEvents(msg, map)).toEqual([
      { type: "summary", agent: "budget", lines: ["1", "2", "3"] },
      { type: "status", agent: "budget", status: "done" },
    ]);
  });

  it("extracts the slug from the trips/<slug>/itinerary.md path, and returns null with no fallback when that path is absent", () => {
    const withPath = {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Done. See trips/japan-tokyo-kyoto-a8b5/itinerary.md",
    } as never;
    expect(toAgentEvents(withPath, new Map())).toEqual([
      { type: "result", slug: "japan-tokyo-kyoto-a8b5", ok: true, error: undefined },
    ]);

    const withoutPath = {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "could-not-verify-dead end",
    } as never;
    expect(toAgentEvents(withoutPath, new Map())).toEqual([{ type: "result", slug: null, ok: true, error: undefined }]);
  });
});
