import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]+$/.test(params.slug)) return new Response("bad slug", { status: 400 });
  const file = path.resolve(process.cwd(), "..", "trips", params.slug, "itinerary.json");
  try {
    return new Response(await readFile(file, "utf8"), { headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
