import { seedIfEmpty } from "../db/seed";
import { migrate } from "../db/migrate";

let ready = false;

export function ensureAppData() {
  if (ready) return;
  migrate();
  seedIfEmpty();
  ready = true;
}
