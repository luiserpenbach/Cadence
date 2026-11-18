import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import { searchAll } from "../../../lib/domain/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  ensureAppData();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ hits: searchAll(getDb(), q) });
}
