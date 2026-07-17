# Cadence — Concept Freeze

Hardware management and MES for rapid development and iteration of complex hardware — starting with cryogenic propulsion and thermal management systems.

Cadence combines market-baseline PLM/MES capabilities (BoMs, inventory, build procedures, thin procurement) with a **configuration control plane** aimed at SpaceX-like overnight hardware cut-in: system design, test evidence, and factory/bench execution share one identity model.

This document freezes product decisions from the initial concept discussion. It is the source of truth until revised.

---

## 1. Product thesis

Most tools stop at BoMs, work orders, and documents. Rapid hardware iteration fails when **design intent, configuration, build, and test** do not share one model.

Cadence treats a **Configuration** as a deployable release artifact (analogous to a software release): pinned parts/revs, procedures, and required tests, scoped by effectivity. Overnight change means the bench wakes up on a new released configuration — not tribal knowledge in spreadsheets.

### Two layers

1. **Market baseline** — parts, BoMs, inventory, procedures, as-built, thin procurement, traceability  
2. **Iteration control plane** — configurations, article + stand effectivity, change deltas/impact, system/test binding, risk classes

---

## 2. v0 wedge (locked)

| Decision | Choice |
|----------|--------|
| Primary user | Design engineers first |
| Domain | Cryogenic propulsion and thermal management |
| Scale | Bench proto (not rate production) |
| Procurement | Thin — enough to exercise basic inventory/PO flows |
| CAD/PLM import | None in v0 — BoMs authored in Cadence |
| Verification enforcement | Record-and-warn (with acknowledgments), not hard blocks |

### Explicitly out of v0

- Rate production / takt optimization  
- Full MRP and finance-grade purchasing  
- Multi-warehouse enterprise inventory  
- CAD/ECAD/PLM BoM sync  
- Operator-first MES polish as the primary UX  
- Hard gating that blocks bench runs on missing tests  

### First win

A propulsion/thermal design lead can:

1. Model a cryo subsystem BoM (and key stand equipment) in Cadence  
2. Release **Article Config N** and **Stand Config M** with procedures + required tests  
3. Build a handful of proto serials; capture as-built  
4. Bind a bench **Run** to `(article, article config, stand, stand config)`  
5. Record test results; see missing/failed/stale tests as warnings  
6. Cut **Config N+1** overnight (delta + impact: serials, kits, stale tests)  
7. Next bench day runs against the new configs without rewriting tribal process  

---

## 3. Identity model (locked): config-cheap

| Concept | Role |
|---------|------|
| **Part revision** | Changes when the *artifact* changes (geometry, material, drawing, true form/fit/function break) |
| **Configuration** | Cheap, frequent deployable unit: BoM pin set + procedures + tests (+ allowed alternates) |

Engineers iterate by cutting configurations. Part revisions stay relatively rare and meaningful.

### When to bump a part rev

- New machine drawing / PCB spin / casting change  
- Material or finish that breaks interchangeability  
- Interface that invalidates mates (flange, pinout, thread)

### When to cut a new config (often without a part rev)

- Swap to an already-released alternate rev  
- Add/remove a bracket, orifice, sensor already in catalog  
- Procedure step / torque / purge sequence change  
- Test limit or required bench campaign change  
- Effectivity cut-in for a proto serial batch or stand  

### Discipline

- Configurations are **cheap to create**, **gated to release** (`Draft` → `Released`)  
- Risk class (below) decides how hard the release gate is  
- If creating a config feels like a committee ECO, people will abuse part revs again — UX must keep config creation light  

---

## 4. Effectivity model (locked)

Effectivity has two first-class axes:

| Axis | Meaning | Examples |
|------|---------|----------|
| **Article** | Which physical proto unit | `TP-014`, or range `TP-017+` |
| **Stand** | Which test bench / facility setup | `STAND-B`, `COLD-FLOW-1` |

A configuration applies when its effectivity matches the **execution context** `(article, stand)`.

### Two config kinds

Cryo benches blur article-under-test and stand plumbing. Keep them separate.

| Kind | Owns | Changes when |
|------|------|--------------|
| **Article config** | Proto/flight-like hardware recipe | Valve rev, orifice, MLI, article procedures/tests |
| **Stand config** | Bench infrastructure mated for the run | Manifold, stand sensors, DAQ cal, stand purge sequence |

### Run binding

```text
Run = Article serial + Article config + Stand + Stand config
```

As-built / as-tested answer: what was on the unit, what was on the stand, what evidence was produced.

Overnight deploy can cut either an article config or a stand config without forcing a fake part rev on the other.

### Resolution rule

Most specific wins:

1. Exact `(article, stand)` match  
2. Else article match + stand = any  
3. Else stand match + article = any  
4. Else no released config → block build/test start (no config is different from missing *tests*)  

Overlaps with equal specificity → **conflict; do not auto-pick**. Designer must resolve.

### Deferred effectivity

Date-only cut-in as primary, multi-site enterprise effectivity, and full vehicle-level trees are out of v0 (add when articles install into larger parents).

---

## 5. Four views on every serial

| View | Meaning |
|------|---------|
| **As-designed** | Target article config at release |
| **As-planned** | What the work order / run intended (may lag design) |
| **As-built** | Actual parts/revs installed (article + relevant stand mates) |
| **As-tested** | Evidence against the verification matrix for that run context |

Rapid iteration lives in the deltas between these four. Genealogy stores **config IDs + part rev pins**.

---

## 6. Verification (locked): record-and-warn

Tests are first-class and always produce structured evidence. In v0 they do **not** hard-block designers from running.

| Gate | v0 behavior |
|------|-------------|
| Config release | Soft — can release with incomplete/draft test matrix |
| Run start | **Record-and-warn** — show missing/failed/stale required tests; allow proceed with explicit acknowledge |
| Unit acceptance | Warn-heavy — status shows gaps; acceptance may proceed with warning (tighten later) |
| Stand config use | Same record-and-warn pattern as run start |

### Non-negotiables even in warn mode

- Required tests are declared on article config and stand config  
- Results bind to `(serial, stand, config IDs, test definition, timestamp)`  
- Config N→N+1 marks impacted tests **stale**  
- UI always surfaces: missing / failed / stale / waived / acknowledged-gap  
- **Waivers** and **gap acknowledgments** are explicit objects (who, when, which gaps, optional reason) — no silent green  

Later, enforcement can flip to hard-gate by risk class without rewriting the model.

---

## 7. Risk classes (locked): R0–R3

| Class | Examples (cryo / thermal) | v0 enforcement |
|-------|---------------------------|----------------|
| **R0 — Doc/process** | Typo, step clarification, non-functional procedure tweak | Config auto-releasable; warn only |
| **R1 — Non-critical hardware** | Bracket, label, non-wetted secondary structure | Normal release; record-and-warn on tests |
| **R2 — Performance-affecting** | Orifice, sensor, insulation, control limit, trim | Require listed tests declared; still warn-not-block on run |
| **R3 — Safety / wetted / pressure** | Valve body, relief path, primary seal, structural pressure part | **Mandatory reviewer ack** on config release; run still record-and-warn but louder |

---

## 8. CAD / PLM boundary (locked)

| Cadence owns (v0) | External / later |
|-------------------|------------------|
| Part identity, rev metadata | CAD geometry files (link/refs only) |
| BoM structure and config pins | CAD/PLM EBOM import (not in v0) |
| Article + stand configs, effectivity | Enterprise PLM ECO suites |
| Procedures, travelers, as-built | — |
| Test defs, results, waivers, acknowledgments | Raw DAQ product (ingest later) |
| Thin procurement + inventory | Full MRP / finance |

BoMs are **authored in Cadence** (UI / CSV). Optional links to drawings/PDFs are enough for v0. CAD import can attach later as an adapter on the same part/BoM model.

---

## 9. Module map

```text
Cadence
├── Catalog & BoM           Parts, revs, EBOM/MBOM, alternates
├── Configurations          Article + stand configs, effectivity, release
├── Change & Impact         Config deltas, blast radius, dispositions
├── Inventory & Logistics   Stock, lots, kits, reservations (proto-scale)
├── Procurement (thin)      Demand signal, simple PO / receive
├── Manufacturing (MES)     Work orders / runs, travelers, as-built
├── Procedures              Versioned instructions bound to config
├── System Design (thin)    Interfaces / ICD hooks as needed for cryo
├── Verification            Test plans, execution, results, waivers, acks
└── Trace & Genealogy       Serial ↔ config ↔ build ↔ test ↔ supplier
```

v0 priority spine: **Catalog → Configurations → Change/Impact → Procedures → Verification → as-built/as-tested**, with thin inventory/procurement beside it.

---

## 10. Design principles

1. **Configuration is deployable** — released configs are the unit the bench executes, with provenance.  
2. **Everything is effectivity-scoped** — never “the” BoM; always BoM/procedure/tests for a context.  
3. **Article and stand are separate configs** — don’t conflate unit hardware with bench infrastructure.  
4. **Evidence over documents** — procedures and tests produce structured records; PDFs are attachments, not truth.  
5. **Delta-first change** — humans review impact; system proposes what is stale or short.  
6. **Four-view serial truth** — as-designed / planned / built / tested stay reconcilable.  
7. **Warn before block (v0)** — never silent; acknowledgments are auditable; hard gates come later by risk class.  
8. **Factory/bench is a client of config** — MES executes a released config; it does not own product definition.  

---

## 11. Hard problems (known; revisit when modeling)

These remain the sharp edges for implementation design:

1. **Identity granularity** — part vs rev vs config vs serial vs stand vs run  
2. **Partial deployment** — scoped cut-in without whole-product churn  
3. **Open work under change** — scrap / rework / use-as-is / substitute from deltas  
4. **Test as release vocabulary** — even when enforcement is soft  
5. **Human authority** — R3 reviewer ack vs R0 auto-release  
6. **System/ICD depth** — how much interface graph cryo needs in v0 vs later  

Next deep-dives when ready: concrete object model, overnight change flow, and v0 screen/API backlog.

---

## 12. Decision log

| # | Topic | Decision |
|---|-------|----------|
| 1 | Primary user & first win | Designers first; cryo/thermal; bench proto; thin procurement |
| 2 | Revision vs configuration | **A — config-cheap** |
| 3 | Effectivity | Named proto articles **and** test stands; article + stand configs; run binds both |
| 4 | Verification binding | Record-and-warn + explicit acknowledgments |
| 5 | CAD/PLM boundary | Author in Cadence; no CAD import in v0 |
| 6 | Risk classes | R0–R3; R3 requires reviewer on config release |

---

*Cadence — hardware configuration control for teams that change the product overnight.*
