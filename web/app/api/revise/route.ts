import { hasGoogleMapsKey, runAgentStream } from "@/lib/agent-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { slug, request } = (await req.json()) as { slug?: string; request?: string };
  if (!slug || slug.trim().length === 0) {
    return new Response(JSON.stringify({ error: "slug is required" }), { status: 400 });
  }
  // Shorter minimum than /api/plan's 10 (a valid revision, e.g. "end after day 3", is
  // naturally terser than a full trip brief), deliberate, not copy-paste drift.
  if (!request || request.trim().length < 5) {
    return new Response(JSON.stringify({ error: "request is required" }), { status: 400 });
  }
  if (!(await hasGoogleMapsKey())) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_MAPS_API_KEY is not set. Add it to .env at the repo root." }),
      { status: 500 },
    );
  }
  return runAgentStream(`/revise-trip ${slug.trim()} ${request.trim()}`, "revise-trip", slug.trim());
}
