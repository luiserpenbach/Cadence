# Cadence — Codebase Analysis & Implementation Plan

Analysis of the v0 foundation app (`web/`) against `CONCEPT.md`, followed by a
phased implementation plan. Written 2026-07-30 against commit `d222cd2`.

---

## 1. Where the codebase stands

The app is a Next.js 16 + React 19 + Drizzle + better-sqlite3 single-tenant
web app. Health is good for a v0 skeleton:

- `tsc --noEmit` and `eslint` pass clean; schema covers the full module map
  (parts/revs, configs, effectivity, BoM pins, procedures, tests, runs,
  results, waivers, as-built, inventory, thin procurement).
- The **read side is well developed**: config detail with BoM/tests/procedures/
  effectivity, run detail with a verification report (missing/failed/stale/
  waived), a change-impact page (BoM delta, test diff, inventory shortages,
  articles-on-prior), and a dashboard.
- The **write side is thin**: exactly four server actions exist —
  `releaseConfig`, `cutConfigFrom`, `recordTestResult`, `acknowledgeRunGaps`.
  Everything else (parts, BoMs, articles, stands, runs, waivers, as-built,
  effectivity) exists only as seed data.

So today the app *demonstrates* the concept on seeded data rather than
*executing* it. That is the right v0 starting point; the plan below is about
crossing from demo to usable tool without betraying the concept freeze.

---

## 2. Concept ↔ code gaps (ranked)

These are places where CONCEPT.md makes a locked promise the code doesn't
keep yet.

### G1. The effectivity resolution rule is not implemented (CONCEPT §4)
The concept's centerpiece — "a configuration applies when its effectivity
matches `(article, stand)`, most specific wins, equal specificity is a
conflict, no released config blocks run start" — has **no implementation**.
Runs come pre-bound from seed; there is no run-creation flow and no resolver.
This is the single highest-value missing piece: without it, "the bench wakes
up on a new released configuration" never actually happens in the product.

### G2. Staleness is never propagated (CONCEPT §6 non-negotiable)
"Config N→N+1 marks impacted tests **stale**" is represented only by a
hard-coded hint string (`impact.ts:217`) and a `stale` status that nothing
ever writes. Releasing a config based on another must actually mark prior
passing results stale for affected contexts.

### G3. No BoM/config authoring (CONCEPT §8: "BoMs are authored in Cadence")
Parts, revisions, BoM lines, required tests, procedures, and effectivity
cannot be created or edited in the UI — draft configs are immutable in
practice. `cutConfigFrom` copies BoM/tests/procedures but you cannot then
change anything, which defeats the point of cutting a config. The concept's
"first win" step 1 ("model a cryo subsystem BoM in Cadence") is not possible.

### G4. Acknowledgments don't record *which* gaps (CONCEPT §6)
"Waivers and gap acknowledgments are explicit objects (who, when, **which
gaps**...)" — but `runs.gapAcknowledged` is a single boolean with by/at/reason.
If a new gap appears after acknowledgment (new failed result, config change),
the run still shows as acknowledged: a silent green, which §6 forbids.

### G5. `superseded` status is never set
`releaseStatuses` includes `superseded` but releasing config N+1 does not
supersede N, so the config list accumulates "released" configs with no
current-vs-old distinction, and resolution (G1) would have no way to prefer
the live one.

### G6. Waivers cannot be created
The waivers table and the verification read-path exist, but there is no
action/UI to create one. Techs will (correctly) refuse to use free-text notes
as waivers.

### G7. As-built capture has no write path (first win, step 3)
`as_built_lines` exists and articles pages read it, but nothing writes it.
The four-view promise (§5) currently has only as-designed populated by hand.

### G8. Change page and dashboard are hard-wired to seed keys
`change/page.tsx:13-14` and `page.tsx:20-21` look up `CH4-FEED-N` /
`CH4-FEED-N+1` by literal key. Impact comparison should take from/to via
search params, defaulting to a config's `basedOnConfigId` lineage.

---

## 3. Correctness bugs (fix regardless of roadmap)

- **B1 — Waived-but-untested shows as "missing"** (`lib/queries.ts:73-76`).
  Waivers are only fetched when `results.length > 0`. A run with a waiver but
  zero recorded results reports the test as `missing` instead of `waived`.
- **B2 — "Latest result" is unspecified** (`lib/queries.ts:71`). Results are
  loaded with no `ORDER BY` and collapsed into a `Map`, so the winning result
  per test depends on rowid insertion order, not `recordedAt`. Works by
  accident today; breaks on any backfill/import.
- **B3 — R3 self-review is allowed** (`lib/actions.ts:78`). The reviewer
  falls back to `reviewer || by`, so an empty reviewer field makes the
  releaser their own reviewer. The form's `required` attribute is the only
  guard, and it's client-side. §7 says R3 review is mandatory.
- **B4 — `releaseConfig` has no state guard** (`lib/actions.ts:57-88`). A
  released or superseded config can be "released" again, overwriting
  `releasedAt/By`. No draft→released transition check.
- **B5 — `cutConfigFrom` is not transactional and drops effectivity**
  (`lib/actions.ts:90-170`). The config insert plus three copy-loops run as
  separate statements — a duplicate `key` throws an unhandled 500 midway and
  can leave orphans (config without BoM). Effectivity rows are not copied at
  all, so a cut config silently loses its scope. Should be one
  `db.transaction`, with a friendly duplicate-key error.
- **B6 — `articlesOnPrior` is wrong and O(N) queries** (`lib/impact.ts:192-208`).
  It re-queries effectivity *inside* a filter for every article, reads only
  the first effectivity row (`.get()`), and compares serials
  lexicographically (`"TP-9" > "TP-14"`). Needs one query and a numeric
  serial comparison.
- **B7 — No input validation on any action** (`lib/actions.ts`). `zod` is a
  dependency but unused. `recordTestResult` accepts any `status` string;
  invalid inputs silently `return` with no user feedback.
- **B8 — `buildImpactReport` uses `.get()!`** (`lib/impact.ts:158-167`).
  Non-null assertions crash the page on a bad/stale config id.
- **B9 — Schema is defined twice** (`db/schema.ts` + hand-written DDL in
  `db/migrate.ts`). Two sources of truth that will drift; `drizzle-kit` is
  installed but unused. Also `ensureReady()` in `migrate.ts:203-208` is dead
  code, and storing `missing` as a `test_results.status` comment is a
  modeling smell (missing is derived, never stored).

Also worth noting: **no tests exist at all**, and there is no `typecheck`
script or CI. Domain logic (`impact.ts`, `queries.ts`) is exactly the kind of
pure-ish code that's cheap to unit test against an in-memory SQLite.

---

## 4. Suggested improvements (design-level)

1. **Extract a domain layer.** Server actions currently mix parsing, rules,
   and SQL. Introduce `lib/domain/` modules (`release.ts`, `resolution.ts`,
   `staleness.ts`, `verification.ts`) of pure functions over plain data, with
   thin action wrappers doing zod parsing + transactions. This is what makes
   the hard rules (§4 resolution, §6 staleness) testable.
2. **Model effectivity more honestly.** Today a row has `anyArticle` +
   `serialFrom/To` + an explicit-articles join table + `anyStand` + `standId`
   — with `anyArticle: true` *and* a serial range being meaningful, the flag
   doesn't mean "any". Replace with an explicit discriminator per axis
   (`article_scope: any | serial_range | explicit`, `stand_scope: any |
   explicit`) so the resolver (G1) can compute specificity without guessing.
   Add a numeric `serialSeq` to articles so ranges compare correctly (B6).
3. **Make acknowledgments first-class.** A `run_gap_acks` table
   (run, who, when, reason, plus ack lines referencing the acknowledged
   `(testDefinitionId, status)` snapshot). Verification then reports a gap as
   acknowledged only if it's covered by an ack line — new gaps re-warn
   automatically. Solves G4 without hard gates.
4. **Action feedback.** Use `useActionState` and return
   `{ ok, error, fieldErrors }` from actions instead of silent returns, so
   invalid input and duplicate keys surface in the UI.
5. **Single schema source of truth.** Generate SQL migrations with
   `drizzle-kit generate` from `schema.ts`; `migrate()` applies the journal.
   Delete the DDL string.
6. **Test harness + CI.** Vitest with a `:memory:` SQLite factory that runs
   migrations + a tiny fixture builder. Unit-test verification, impact,
   resolution, staleness. GitHub Actions: `tsc --noEmit`, `eslint`, `vitest`,
   `next build`.
7. **Keep config creation light** (§3 discipline). Authoring UI should be
   inline row-editing on the draft config detail page — not a wizard. Draft
   configs editable; released configs immutable (enforced server-side).

---

## 5. Implementation plan

Ordered so each phase leaves the app releasable. Phases 1–2 are prerequisites
for everything after; 3–5 deliver the concept's "first win" loop end-to-end.

### Phase 1 — Foundations & bug fixes (small)
*Goal: trustworthy base; no behavior redesign.*

1. Add `typecheck` script; add Vitest + in-memory SQLite test factory; add CI
   workflow (typecheck, lint, test, build).
2. Fix B1 (always fetch waivers), B2 (`ORDER BY recordedAt` + take latest per
   test), B8 (null-check + `notFound()`), B6 (single effectivity query,
   numeric serial compare helper).
3. Fix B3/B4 in `releaseConfig`: reject non-draft configs; require a reviewer
   distinct from the releaser for R3 (server-side).
4. Fix B5: wrap `cutConfigFrom` in `db.transaction`, copy effectivity rows
   (and explicit-article links), catch duplicate-key and report it.
5. Introduce zod schemas for all four existing actions (B7) and the
   `{ ok, error }` action-state pattern on one page (run detail) as the
   template.
6. Adopt drizzle-kit migrations; delete the DDL string and dead code (B9).
7. Tests: verification report (incl. B1/B2 regressions), impact diff, release
   guards, cut-config copy.

### Phase 2 — Lifecycle correctness (small/medium)
*Goal: config lifecycle matches §3/§6.*

1. On release of a config with `basedOnConfigId`, mark the base config
   `superseded` (same transaction) (G5).
2. Staleness propagation (G2): on release of N+1, for every run bound to the
   superseded config whose article/stand is inside N+1's effectivity, insert
   `stale` results for tests shared between N and N+1 (reusing
   `diffRequiredTests().shared`). Pure function + unit tests first.
3. Replace the run-level ack boolean with `run_gap_acks` + ack lines (G4);
   migrate existing column; verification distinguishes
   `acknowledged-gap` from unacknowledged, per gap.
4. Waiver creation form on run detail (G6): reason + approver required,
   binds `(run, testDefinition)`; shows in verification as today.

### Phase 3 — Resolution engine + run creation (medium; the wedge)
*Goal: the bench binds runs by rule, not by seed.*

1. Effectivity schema cleanup (improvement #2): explicit scope
   discriminators + `serialSeq`; data migration from current rows.
2. `lib/domain/resolution.ts`: `resolveConfig(kind, articleId, standId)` →
   `{ config } | { conflict: Config[] } | { none }`, implementing the locked
   most-specific-wins rule over **released, non-superseded** configs.
   Exhaustive unit tests (exact match, article-only, stand-only, conflict,
   none).
3. "New run" flow on `/runs`: pick article + stand → the resolver proposes
   article & stand configs; equal-specificity conflict is displayed and
   blocks (designer must fix effectivity); no released config blocks
   creation with a clear "no config" message (distinct from missing tests,
   per §4).
4. Run lifecycle actions: start (`planned → in_progress`, warn+ack on gaps at
   start per §6) and complete.

### Phase 4 — Authoring (medium)
*Goal: first-win step 1 — model a BoM in Cadence.*

1. Create part + revision from `/catalog`; create article and stand.
2. Draft-config editing on config detail: add/remove/edit BoM lines
   (part-rev picker, qty, find number), required tests, procedure links,
   effectivity rows. Server-side rule: mutations rejected unless
   `status = draft`.
3. New-config-from-scratch (not just cut-from) for article and stand kinds.
4. As-built capture on article detail (G7): part-rev + serial/lot per line,
   optionally bound to a run; article page shows as-designed vs as-built
   delta (reuses `diffBom` against the bound config).

### Phase 5 — Generalized change view & polish (small)
1. `/change?from=…&to=…` with config pickers, defaulting to the newest
   released config and its `basedOnConfigId` (G8); dashboard derives its
   "active delta" the same way instead of literal keys.
2. Empty states for a fresh database (seed becomes optional demo data via
   `db:seed` only).
3. Procedure versioning on edit (bump version, keep old row) so released
   configs keep pointing at the text they released with.

### Explicitly deferred (per concept freeze)
Hard gating by risk class, CAD/PLM import, date effectivity, multi-site,
rate production, auth/multi-user (keep free-text identity fields for v0, but
they're centralized behind one `identity` input component so wiring real
users later is one change).

---

## 6. Suggested order of attack

Phase 1 and 2 are one continuous stretch of work (~the current codebase's
size again). Phase 3 is the differentiating feature and should not slip
behind Phase 4 authoring convenience: a run you can *bind by rule* on seeded
configs proves the concept; authoring merely removes the seed crutch.
