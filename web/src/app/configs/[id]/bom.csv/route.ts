import { getConfigBundle } from "../../../../lib/queries";
import { exportBomCsv } from "../../../../lib/domain/bom-csv";
import { ensureAppData } from "../../../../lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  ensureAppData();
  const bundle = getConfigBundle(id);
  if (!bundle) {
    return new Response("Not found", { status: 404 });
  }
  const csv = exportBomCsv(id) ?? "";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${bundle.config.key}.csv"`,
    },
  });
}
