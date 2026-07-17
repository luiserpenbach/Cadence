# Cadence web app

Next.js app implementing the v0 concept freeze: design-first hardware configuration control for cryogenic propulsion and thermal management bench proto.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- SQLite via `better-sqlite3` + Drizzle ORM
- Seeded cryo CH4-feed sample data on first boot

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run db:seed   # migrate + seed if empty
npm run build
npm run lint
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
