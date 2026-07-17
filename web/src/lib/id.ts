import { nanoid } from "nanoid";

export function id(prefix?: string) {
  const n = nanoid(10);
  return prefix ? `${prefix}_${n}` : n;
}
