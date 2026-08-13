<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single-service app. All commands run from `web/` (Node 22). Standard scripts live in `web/package.json` and mirror `.github/workflows/ci.yml` (`typecheck`, `lint`, `test`, `build`); the update script already runs `npm ci`.

- Run the dev server with `npm run dev` (Next.js on http://localhost:3000). Use a persistent/tmux session — the process is long-running.
- Storage is local SQLite at `web/data/cadence.db` (gitignored). Migrations in `web/drizzle/` run automatically on first request via `ensureAppData()`, so no manual migrate step is needed to boot the app.
- A fresh DB starts empty. Load the CH4-feed demo dataset with `npm run db:seed` (idempotent: seeds only if empty). Deleting `web/data/cadence.db*` resets to empty.
- No environment variables or external services are required.
