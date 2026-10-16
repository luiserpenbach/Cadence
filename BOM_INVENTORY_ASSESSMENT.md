# Cadence — BoM & Inventory Usability Assessment

Assessment of the v0 app (`web/`) as a tool for **hardware Bill of Materials
authoring** and **inventory management**. Written 2026-08-12 against `main`
(`de60550`, Phases 1–9 complete) after a code review and a live walkthrough of
the seeded CH4-feed demo.

This is a product evaluation, not a concept-to-code gap list. `CONCEPT.md` is
the locked product thesis; `IMPROVEMENT_PLAN.md` is the implementation history.
The question here is: **can a propulsion/thermal team actually manage BoMs and
stock in Cadence today?**

---

## 1. Verdict

**BoM: usable and effective for the v0 wedge.** A design engineer can author
parts, pin a config BoM, cut N+1 overnight, see the pin delta, and put a
resolved recipe on the floor. That loop is real, not a seed demo.

**Inventory: not yet a management system.** Stock and POs exist as read-only
tables plus a one-kit shortage check on change impact. Nothing receives,
issues, reserves, or kits. Recording as-built does not consume lots. The
pages demonstrate that inventory *could* be first-class; they do not let
anyone run a proto cage.

| Area | Usability (can a human do the job?) | Effectiveness (does the job stay true?) |
|------|--------------------------------------|------------------------------------------|
| Catalog / part identity | **Good** at proto scale | **Good** — rev vs config discipline is clear |
| Config BoM authoring | **Good** for ~10–30 pin configs | **Good** — draft-mutable, released-immutable |
| BoM change / cut-in | **Strong** | **Strong** — find-matched delta + one-shot rev cut-in |
| Floor recipe | **Good** for a machinist glance | **Partial** — no on-hand, no stand BoM, no kit |
| As-built vs as-designed | **Awkward** | **Partial** — write path exists; comparison is gated on a run |
| Inventory / lots | **Poor** — look, don't touch | **Weak** — numbers never move |
| Procurement | **Poor** — look, don't touch | **Weak** — no demand → PO → receive loop |
| Trace / genealogy | **Good** for lookup | **Good** as a read model over existing data |

Net: Cadence is already a **configuration-pinned BoM tool**. It is not yet an
**inventory tool**. That matches the concept freeze's "thin inventory /
procurement beside the spine" — but the thin layer is thinner than the freeze
describes (no kits, no reservations, no receive, no CSV).

---

## 2. Method

1. Read `CONCEPT.md` §§1–2, 8–9 (first win, CAD/PLM boundary, module map) and
   the inventory/BoM surfaces in `web/`.
2. Walked the seeded demo in the running app: Overview, Catalog, part detail,
   Configs, released + draft config BoM, Floor, Change impact, Inventory,
   Procurement, article as-built, Trace-by-lot.
3. Cross-checked write paths in `lib/actions.ts` and domain modules
   (`config-edit`, `authoring`, `rev-cut-in`, `asbuilt`, `impact`, `trace`).
   Inventory and purchase-order tables have **no server actions**.

Personas used below: design engineer, responsible engineer (RE) on overnight
cut-in, bench machinist, cage/inventory person.

---

## 3. What works (keep)

These are the reasons the BoM side already earns its keep.

### 3.1 Config-cheap BoM is the right object

A BoM in Cadence is a **pin set on a configuration**, not "the" product BoM.
That matches CONCEPT §2–3 and is visible in the UI: released configs are
immutable records; you cut a draft, edit pins, release. The draft editor is
inline (rev / qty / find + Save per row) rather than a wizard — the Phase 6
promise to keep config creation light.

### 3.2 Overnight cut-in is the best BoM workflow in the app

Two complementary paths:

- **Cut config from parent** (`/configs`) copies pins, tests, procedures, and
  effectivity. Edit the draft, release.
- **One-shot rev cut-in** (`/catalog`) drafts every *released* config that
  pins an older rev of the chosen part, swapping the pin and preserving
  qty/find. The RE reviews effectivity and releases; nothing auto-releases.

Change impact then shows a find-number-matched BoM delta (added / removed /
changed), which is the right grain for "what did we actually swap overnight."
On the seeded N → N+1, that correctly reports valve A→B and orifice 0.070 →
0.085 as two `changed` pins (same find numbers 10 and 20), not four
add/remove rows.

### 3.3 Floor recipe is the right consumption surface

`/floor` resolves `(article, stand)` live and shows the article BoM the
machinist should build to, plus a change banner when the article's last run
was on a different config. No-config and conflict states are in plain
language. This is more useful than sending someone to `/configs`.

### 3.4 Catalog identity is honest

Parts carry sourcing (`make | buy | cots`) and kind (`component | assembly`),
revisions are created with an explicit "only when the artifact changes"
prompt, and part detail has **where-used** across configs. Attachments are
correctly framed as metadata, not pins. That is the CAD/PLM boundary the
freeze locked.

### 3.5 Trace already treats lots as identifiers

`/trace?q=LOT-V50B` returns on-hand (2 @ PROTO-CAGE), the part-rev, and the
supplier PO. Installed serials/lots on as-built lines link into the same
page. Genealogy is ahead of inventory *operations*.

---

## 4. BoM — detailed findings

### 4.1 Authoring loop (design engineer)

**Can do today**

1. Create a part + first rev from `/catalog` (sourcing + kind on create).
2. Create an empty draft config or cut from a parent.
3. Add / edit / remove BoM pins on the draft (part-rev picker, qty, find).
4. Release (R3 goes through two-person review).
5. See the pin set on Floor and on the released config page.

**Friction**

| Issue | Why it hurts |
|-------|----------------|
| Catalog is a flat part×rev table | 12 parts already feel long; no search, filter, or grouping by part. A 200-part cryo cart will be unusable. |
| Part is write-once | Name, category, sourcing, kind, and `description` cannot be edited after create. `description` is not even on the create form (seed writes it; the UI never does). |
| In-place edit cannot change *part* | `BomLineEditor` only offers sibling revs of the current part number. Swapping orifice 0.070 → 0.085 is remove-and-re-add, which is the dance Phase 6 claimed to kill — it only died for *rev* swaps. |
| Per-row Save | Qty/find/rev each need their own submit. Fine for 8 pins; clumsy for 40. |
| Add-pin picker is every part-rev in one `<select>` | No typeahead. Duplicate pins are allowed (no unique on `(config, find)` or `(config, part_rev)`). |
| BoM line `notes` exist in schema and are copied on cut-in | Never shown or edited in the UI. |
| No CSV import | CONCEPT §8: "BoMs are authored in Cadence (UI / **CSV**)". UI only. |
| No alternates | CONCEPT §3: config = pin set + procedures + tests + **allowed alternates**. A substitute on the bench has nowhere to live except a free-text as-built note. |
| `assembly` is a badge | No part-to-part structure. An assembly BoM cannot explode. Called out as post-v0 in schema comments; still a real limit the moment someone models a manifold as an assembly. |
| EBOM vs MBOM is one list | Module map names both; the product has one pin list per config. Fine for bench proto if named honestly; confusing if a user expects manufacturing vs engineering views. |

**Effectiveness caveats**

- `diffBom` keys lines by `findNumber || partNumber`. Two pins of the same
  part with empty find numbers collapse into one Map entry; the delta lies.
  Seed data always sets find numbers, so the demo hides this.
- Released BoM is a clean read-only table (Find, Part, Rev, Qty, Name). Draft
  BoM hides Find as a column and stuffs rev/qty/find into one editor cell —
  harder to scan, and the column headers change between states.

### 4.2 Floor and as-built (machinist / tech)

Floor shows the article recipe well. Gaps:

- **No on-hand next to each pin.** The machinist cannot tell whether the cage
  has the valve B they are about to install.
- **Stand BoM is omitted.** Stand procedures render; stand pins (manifold,
  DAQ, stand PTs) do not. A stand-side kit is invisible on the floor screen.
- **No pick / kit / issue action.** "Build to" is a document, not a
  transaction.

As-built capture on `/articles/[id]` works as a log: pick part-rev, qty,
serial/lot, optional run. Problems:

- **As-designed vs as-built is gated on a bound run**, not on the as-built
  lines themselves. Seeded TP-014 has a full as-built kit and still shows
  "no bound run yet" / "Bind a run to compare against a released config"
  because those lines have `run_id = null`. The four-view promise (CONCEPT
  §5) is blocked by a join the user did not know they needed.
- Recording as-built does **not** decrement `inventory_lots`. The cage and
  the article diverge silently.
- No edit/delete of a mistaken as-built line.
- The as-built part picker is the entire catalog, not "pins on the resolved
  config" — easy to log the wrong rev.

### 4.3 Change impact (RE)

The BoM delta panel is the most effective BoM *read* in the product. The
inventory panel next to it overclaims:

> "Enough on hand for one kit of CH4-FEED-N+1."

That check is: for each pin on the *target* config, `sum(qty_on_hand) >=
line.qty`. It does not consider:

- How many articles are in the cut-in (N+1 covers TP-017 and TP-018 — two
  kits, not one).
- Stock already installed on other articles.
- Open PO qty (the demo PO is still `ordered` while valve B already shows
  2 on hand — the two facts are unrelated).
- Stand-config pins (stand equipment is not in inventory at all; see §5).
- Reservations or kits (tables do not exist).

**Articles still on prior** is also wrong for the seeded effectivity model.
N+1 uses `article_scope = explicit` (TP-017, TP-018), so `serial_from` is
null. `buildImpactReport` only treats `serialFrom` cut-ins as "prior."
TP-014/015/016 remain on N, but Overview and Change impact both report
**"0 still on N."** The dashboard metric is a false green.

---

## 5. Inventory & procurement — detailed findings

### 5.1 What exists

Schema:

- `inventory_lots` — `partRevisionId`, `qtyOnHand`, `location` (default
  `PROTO-CAGE`), `lotCode`
- `purchase_orders` / `purchase_order_lines` — number, supplier, status
  (`open | ordered | received`), qty, unit cost

UI:

- `/inventory` — a single table of seed lots. No create, adjust, transfer,
  split, or receive. Lot codes are not links (Trace can look them up if you
  already know the code).
- `/procurement` — one seed PO card. No create, add line, mark ordered, or
  receive-to-stock.

Seed inventory is article-side only. Stand pins `MNF-STAND-B`, `DAQ-CH16`,
`SNS-STAND-PT` have **zero** lots. A shortage check against the stand config
would be 3/3 short; nobody ever runs that check because the default delta is
article N → N+1.

### 5.2 Concept freeze vs shipped

| CONCEPT promise | Shipped |
|-----------------|---------|
| Stock, lots, kits, reservations (proto-scale) | Lots + qty only |
| Thin PO / receive | PO display only |
| Demand signal so inventory isn't fake | Shortage count on change impact; no PO from shortage |
| First win step 6: delta + impact includes **kits** | Copy only; no kit object |
| CSV BoM authoring | None |

The page subtitles still advertise the freeze ("enough to kit builds",
"simple POs so inventory isn't fake"). The UI cannot kit and cannot receive,
so those sentences currently overpromise.

### 5.3 Operational gaps (cage person)

A proto-cage workflow that does not exist:

1. See demand from a released config / cut-in (partial: one-kit shortage).
2. Open a PO for the short rev.
3. Receive the PO → create/increment lots at a location.
4. Reserve or kit for a specific article + config.
5. Issue to the bench; as-built consumes the lot.
6. Return / scrap / adjust.

Today every step except (1) is a spreadsheet. Because (5) does not consume,
even a future receive flow would drift unless as-built and inventory share a
transaction.

### 5.4 Trace vs operations

Trace is the one inventory-adjacent surface that feels finished: lot → stock
+ supplier trail. It also exposes the fake loop: `LOT-V50B` shows 2 on hand
*and* PO-2026-0142 × 4 still `ORDERED`. Receiving never happened; seed
inserted both rows independently.

---

## 6. Cross-cutting UX

- **Twelve-item top nav**, overflow-x on small screens. Inventory and
  Procurement sit last. For the design-first wedge that is defensible; it
  also hides how unfinished those two are.
- **No search** on catalog, inventory, configs, or articles except `/trace`.
- **Empty tables have no empty state** (`DataTable` always renders headers).
  A fresh DB's Inventory/Procurement pages are blank grids. Overview *does*
  have a good empty state.
- **`DataTable` `min-w-[640px]`** forces horizontal scroll on panels that
  don't need it (procurement lines, inventory).
- **Identity is free-text** (`m.chen` defaults on attachments). Fine for v0;
  inventory transactions will need a real actor sooner than config release
  did.
- **Single location string**, no unique constraint on `lot_code`. Two lots
  can share a code; Trace returns both, Inventory cannot tell them apart in
  the UI.

---

## 7. Persona scores

### Design engineer — "model a cryo subsystem BoM in Cadence"

**Can complete first-win step 1** for a flat ~15-pin article config.
Cannot import a spreadsheet, cannot explode an assembly, cannot declare
alternates. Catalog will not scale past the demo without search.

**Score: 7/10** for the locked v0 scale (bench proto, authored in Cadence).

### Responsible engineer — "cut Config N+1 overnight"

Rev cut-in + config cut + change-impact BoM delta is the product's strongest
loop. Trust is undercut by the false "0 articles still on N" and the
one-kit shortage that ignores how many serials the cut-in covers.

**Score: 8/10 BoM / 4/10 inventory impact.**

### Machinist — "build what's on the bench"

Floor recipe is glanceable and usually right. Missing on-hand, stand pins,
and a kit/issue step means they still walk to a whiteboard or the cage
spreadsheet.

**Score: 6/10.**

### Cage / inventory — "what's on the shelf, what did we just receive"

Cannot do the job in Cadence. Read-only seed data.

**Score: 2/10.**

---

## 8. Recommended next work (ranked)

Ordered so each step makes inventory *true* without betraying config-cheap
BoM. Do not build multi-warehouse MRP.

### P0 — Stop lying (small)

1. **Articles-on-prior** must honor `explicit` and `serial_range` effectivity
   (and the resolver's live configs), not only `serialFrom`. Fixes the
   dashboard false green.
2. **Shortage check** should state its assumption ("one kit of the target
   BoM") or, better, multiply by articles in the *to* effectivity set.
3. **As-designed vs as-built** should compare against the resolved article
   config (or latest bound run *or* latest as-built), so a unit with as-built
   and no run still shows a delta.
4. Inventory and Procurement empty states; lot codes link to `/trace`.

### P1 — Thin inventory that actually moves (medium)

The freeze's "thin" bar, not enterprise WMS:

1. **Create / adjust lot** on `/inventory` (part-rev, qty, lot code,
   location).
2. **Receive PO → lot** (status `ordered → received`, increment or create
   lots for each line). Create PO + lines from the UI, including a
   "open PO for shortages" action on `/change`.
3. **Consume on as-built** when `serialOrLot` matches a lot code (decrement;
   reject if insufficient). Optional: as-built part picker defaults to the
   resolved config pins.
4. Show **on-hand** on Floor pins and on part detail.

This is the smallest loop that makes the subtitle "so inventory isn't fake"
true.

### P2 — Proto-scale kits (medium)

A kit = `(article, config, list of lot allocations)`. Create from Floor or
from a released config; reservations hold qty; issue marks the kit consumed
and can stamp as-built lines. Matches first-win step 6 and CONCEPT §9.

### P3 — BoM authoring scale-up (medium, can parallel P1)

1. Typeahead part-rev picker; unique find numbers per config (warn on
   duplicate).
2. In-place **part** swap on a pin (not just rev), so orifice changes aren't
   remove-and-re-add.
3. CSV import/export of pins (CONCEPT §8).
4. Catalog search + group-by-part.
5. Edit part metadata after create; surface `description` and BoM line notes.
6. Allowed alternates on a pin (CONCEPT §3) — a short list of substitute
   revs the floor may install without cutting a config.

### Explicitly still out (per freeze)

Multi-warehouse, MRP, finance-grade purchasing, CAD/ECAD BoM sync, indented
EBOM/MBOM as separate documents, rate-production kitting. Assembly *trees*
remain the identity-granularity hard problem (#1 in CONCEPT §11); don't
sneak them in as inventory work.

---

## 9. Suggested order of attack

P0 is a correctness pass on surfaces that already exist — same spirit as
Phase 1 of `IMPROVEMENT_PLAN.md`. P1 is the inventory equivalent of Phase 4
authoring: the write path that turns a demonstration into a tool. P2 is the
kit object the freeze named and never modeled. P3 is BoM UX so the catalog
survives a real cryo cart.

Do not polish Procurement chrome before receive-to-stock exists. A prettier
read-only PO is still fake inventory.
