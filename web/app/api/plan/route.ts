import { hasGoogleMapsKey, runAgentStream } from "@/lib/agent-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { request } = (await req.json()) as { request?: string };
  if (!request || request.trim().length < 10) {
    return new Response(JSON.stringify({ error: "request is required" }), { status: 400 });
  }
  if (!(await hasGoogleMapsKey())) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set. Add it to .env at the repo root." }),
      { status: 500 },
    );
  }
  return runAgentStream(`/plan-trip ${request.trim()}`, "plan-trip", null);
}
