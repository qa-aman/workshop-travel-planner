import { create } from "zustand";
import { AGENT_IDS, type AgentEvent, type AgentId, type Itinerary, type RunState } from "@/lib/types";

const emptyAgents = () =>
  Object.fromEntries(AGENT_IDS.map((id) => [id, { status: "waiting", toolCalls: [], text: "", summary: [] }])) as unknown as RunState["agents"];

interface Actions {
  start: (request: string) => Promise<void>;
  apply: (e: AgentEvent) => void;
  loadTrip: (slug: string) => Promise<void>;
  reset: () => void;
  initFromUrl: () => void;
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
      if (e.ok && e.slug) {
        set({ slug: e.slug, phase: "done", error: null });
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("trip", e.slug);
          window.history.replaceState(null, "", url.toString());
        }
        void get().loadTrip(e.slug);
      } else if (e.ok && !e.slug) {
        set({ slug: e.slug, phase: "error", error: "Run finished but no trip folder was named" });
      } else {
        set({ slug: e.slug, phase: "error", error: e.error ?? null });
      }
    }
  },

  start: async (request) => {
    get().reset();
    set({ phase: "running" });
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request }) });
      if (!res.ok || !res.body) {
        let message = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // body was not JSON, keep the HTTP status message
        }
        set({ phase: "error", error: message, agents: { ...get().agents, orchestrator: { ...get().agents.orchestrator, status: "failed" } } });
        return;
      }
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ phase: "error", error: message, agents: { ...get().agents, orchestrator: { ...get().agents.orchestrator, status: "failed" } } });
    }
  },

  initFromUrl: () => {
    if (typeof window === "undefined") return;
    const trip = new URLSearchParams(window.location.search).get("trip");
    if (trip) void get().loadTrip(trip);
  },

  loadTrip: async (slug) => {
    const res = await fetch(`/api/trips/${slug}`);
    if (res.ok) {
      const itinerary = (await res.json()) as Itinerary;
      const s = get();
      const agents = Object.fromEntries(
        AGENT_IDS.map((id) => [id, { ...s.agents[id], status: "done" }]),
      ) as unknown as RunState["agents"];
      set({ slug, itinerary, phase: "done", agents });
    }
  },
}));
