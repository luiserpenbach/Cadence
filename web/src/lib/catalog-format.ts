export const MIN_PART_NUMBER_DIGITS = 1;
export const MAX_PART_NUMBER_DIGITS = 12;

export type CatalogPrefix = {
  prefix: string;
  length: number;
};

export function latestRevision(revs: string[]): string | null {
  if (revs.length === 0) return null;
  return (
    revs
      .slice()
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      )
      .at(-1) ?? null
  );
}

export function nextPartNumber(
  existing: string[],
  prefix: string,
  length: number,
): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(\\d+)$`);
  let max = 0;
  for (const pn of existing) {
    const m = pn.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const digits = String(max + 1);
  const width = Math.max(
    1,
    Math.min(MAX_PART_NUMBER_DIGITS, Math.floor(length) || 1),
  );
  return prefix + (digits.length >= width ? digits : digits.padStart(width, "0"));
}
