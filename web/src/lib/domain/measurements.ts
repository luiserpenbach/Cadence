export type LimitEval =
  | { status: "pass" | "fail"; detail: string }
  | { status: null; detail: string };

export function evaluateMeasurement(
  measured: number,
  limits: { unit: string; limitMin: number | null; limitMax: number | null },
): LimitEval {
  const unit = limits.unit.trim();
  const suffix = unit ? ` ${unit}` : "";
  const hasMin = limits.limitMin != null && Number.isFinite(limits.limitMin);
  const hasMax = limits.limitMax != null && Number.isFinite(limits.limitMax);
  if (!hasMin && !hasMax) {
    return { status: null, detail: `${measured}${suffix}` };
  }
  const minOk = !hasMin || measured >= (limits.limitMin as number);
  const maxOk = !hasMax || measured <= (limits.limitMax as number);
  const range = [
    hasMin ? String(limits.limitMin) : "…",
    hasMax ? String(limits.limitMax) : "…",
  ].join("–");
  if (minOk && maxOk) {
    return {
      status: "pass",
      detail: `${measured}${suffix} within ${range}${suffix}`,
    };
  }
  return {
    status: "fail",
    detail: `${measured}${suffix} outside ${range}${suffix}`,
  };
}

export function parseMeasured(raw: string): number | null {
  const match = raw.trim().match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
