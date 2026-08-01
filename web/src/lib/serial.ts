// Natural-order comparison for serials like "TP-014" / "TP-9": numeric runs
// compare as numbers so TP-9 < TP-14, unlike plain string comparison.
export function compareSerials(a: string, b: string): number {
  const tokenize = (s: string) => s.match(/\d+|\D+/g) ?? [];
  const ta = tokenize(a);
  const tb = tokenize(b);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i++) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else {
      const d = x.localeCompare(y);
      if (d !== 0) return d;
    }
  }
  return 0;
}
