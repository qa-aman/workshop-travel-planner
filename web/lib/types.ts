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
  url?: string | null;
}
export interface Day { day: number; date?: string | null; city: string; area: string; slots: Slot[] }
export interface Stay { city: string; nights: number; area: string; why: string; est_nightly_usd?: number | null; examples: { name: string; rating?: number | null; price_level?: string | null; url?: string | null }[] }
export interface Intercity { from: string; to: string; mode: string; duration_min: number; fare_usd?: number | null; source: string }
export interface BudgetLine { category: "stay" | "transport" | "food" | "activities" | "buffer"; usd: number; basis: string }
export interface Budget { limit_usd: number; total_usd: number; within_budget: boolean; lines: BudgetLine[]; alternatives?: string[]; fx?: { rate: number | null; date: string; currency: string | null } }

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
