# Cadence web app

Next.js app implementing the v0 concept freeze: design-first hardware configuration control for cryogenic propulsion and thermal management bench proto.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via `better-sqlite3` + Drizzle ORM (migrations in `drizzle/`)
- Vitest unit tests over the domain layer

## Run

```bash
npm install
npm run db:seed   # optional: load the cryo CH4-feed demo dataset
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A fresh database starts
empty — author parts/configs from the UI, or seed the demo data first.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:generate   # drizzle-kit migration from schema changes
```

## v0 surfaces

| Route | Purpose |
|-------|---------|
| `/` | Overnight cut-in overview |
| `/catalog` | Parts & revisions |
| `/configs` | Article + stand configs, cut new draft |
| `/configs/[id]` | BoM pins, effectivity, tests, procedures, release |
| `/articles` | Proto serials |
| `/stands` | Test stands |
| `/runs` | Runs bound to article+stand configs |
| `/runs/[id]` | Verification gaps, ack, record results |
| `/change` | Config delta / blast radius |
| `/inventory` | Thin stock |
| `/procurement` | Thin POs |

See repo root [`CONCEPT.md`](../CONCEPT.md) for product decisions.
