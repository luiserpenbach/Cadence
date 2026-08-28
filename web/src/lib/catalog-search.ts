export type CatalogSearchRow = {
  partNumber: string;
  name: string;
  category: string;
  sourcing: string;
  kind: string;
  description: string;
};

export function matchCatalogQuery(row: CatalogSearchRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay =
    `${row.partNumber} ${row.name} ${row.category} ${row.sourcing} ${row.kind} ${row.description}`.toLowerCase();
  return hay.includes(needle);
}
