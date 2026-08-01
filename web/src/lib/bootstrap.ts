import { migrate } from "../db/migrate";

let ready = false;

// Migrations run on first touch; demo data is opt-in via `npm run db:seed`.
export function ensureAppData() {
  if (ready) return;
  migrate();
  ready = true;
}
