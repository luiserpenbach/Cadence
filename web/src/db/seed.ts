import { getDb } from "./index";
import { migrate, isSeeded } from "./migrate";
import { id } from "../lib/id";
import * as s from "./schema";

export function seedIfEmpty() {
  migrate();
  if (isSeeded()) return { seeded: false };

  const db = getDb();

  // --- Parts (cryo feed subsystem) ---
  const partDefs = [
    {
      pn: "VLV-CRYO-050",
      name: "Cryogenic ball valve 1/2\"",
      category: "valve",
      revs: [
        { rev: "A", notes: "Initial release" },
        { rev: "B", notes: "Seat material change for LOX compatibility" },
      ],
    },
    {
      pn: "ORF-070",
      name: "Calibrated orifice 0.070\"",
      category: "flow",
      revs: [{ rev: "A", notes: "Baseline trim" }],
    },
    {
      pn: "ORF-085",
      name: "Calibrated orifice 0.085\"",
      category: "flow",
      revs: [{ rev: "A", notes: "Higher flow trim" }],
    },
    {
      pn: "SNS-PT-3K",
      name: "Pressure transducer 0-3000 psi",
      category: "sensor",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "SNS-TT-CRYO",
      name: "Cryogenic temperature sensor",
      category: "sensor",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "TUBE-SS316-050",
      name: "SS316 tubing 1/2\" x 0.049\"",
      category: "line",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "FIT-AN4-EL",
      name: "AN-4 elbow fitting",
      category: "fitting",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "MLI-BLANKET",
      name: "MLI blanket section",
      category: "thermal",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "BRK-MANIFOLD",
      name: "Manifold support bracket",
      category: "structure",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "MNF-STAND-B",
      name: "Stand B interface manifold",
      category: "stand",
      revs: [{ rev: "A", notes: "Bench infrastructure" }],
    },
    {
      pn: "DAQ-CH16",
      name: "16-ch DAQ module",
      category: "stand",
      revs: [{ rev: "A", notes: "" }],
    },
    {
      pn: "SNS-STAND-PT",
      name: "Stand reference PT",
      category: "stand",
      revs: [{ rev: "A", notes: "" }],
    },
  ] as const;

  const partIds: Record<string, string> = {};
  const revIds: Record<string, string> = {};

  for (const p of partDefs) {
    const pid = id("part");
    partIds[p.pn] = pid;
    db.insert(s.parts)
      .values({
        id: pid,
        partNumber: p.pn,
        name: p.name,
        category: p.category,
        description: p.name,
      })
      .run();
    for (const r of p.revs) {
      const rid = id("prev");
      revIds[`${p.pn}@${r.rev}`] = rid;
      db.insert(s.partRevisions)
        .values({
          id: rid,
          partId: pid,
          revision: r.rev,
          status: "released",
          notes: r.notes,
        })
        .run();
    }
  }

  // --- Stands & articles ---
  const standB = id("stand");
  const standCold = id("stand");
  db.insert(s.stands)
    .values([
      {
        id: standB,
        key: "STAND-B",
        name: "Stand B — CH4 feed",
        location: "Proto bay 2",
        notes: "Primary cold-flow bench",
      },
      {
        id: standCold,
        key: "COLD-FLOW-1",
        name: "Cold-flow cart 1",
        location: "Proto bay 1",
        notes: "Mobile cart",
      },
    ])
    .run();

  const articles = [
    { serial: "TP-014", name: "CH4 feed article 014" },
    { serial: "TP-015", name: "CH4 feed article 015" },
    { serial: "TP-016", name: "CH4 feed article 016" },
    { serial: "TP-017", name: "CH4 feed article 017" },
    { serial: "TP-018", name: "CH4 feed article 018" },
  ].map((a) => ({ ...a, id: id("art") }));

  for (const a of articles) {
    db.insert(s.articles)
      .values({
        id: a.id,
        serial: a.serial,
        name: a.name,
        status: "in_build",
      })
      .run();
  }
  const artBySerial = Object.fromEntries(articles.map((a) => [a.serial, a.id]));

  // --- Procedures & tests ---
  const procAssemble = id("proc");
  const procPurge = id("proc");
  const procStand = id("proc");
  db.insert(s.procedures)
    .values([
      {
        id: procAssemble,
        key: "PROC-CH4-ASM-01",
        title: "CH4 feed assembly",
        version: "A",
        body: "1. Install valve VLV-CRYO-050\n2. Torque AN fittings to spec\n3. Install orifice\n4. Bag and tag for leak check",
      },
      {
        id: procPurge,
        key: "PROC-CH4-PURGE-01",
        title: "GN2 purge sequence",
        version: "A",
        body: "1. Verify relief path\n2. Purge 3 cycles\n3. Sample O2 < limit",
      },
      {
        id: procStand,
        key: "PROC-STAND-B-COMM",
        title: "Stand B commissioning",
        version: "A",
        body: "1. Verify manifold torque\n2. DAQ channel map\n3. Reference PT zero",
      },
    ])
    .run();

  const tests = [
    {
      key: "TST-LEAK-HE",
      name: "Helium leak check",
      appliesTo: "article",
      description: "Article leak rate under He",
    },
    {
      key: "TST-PROOF-1.5X",
      name: "Proof pressure 1.5x MEOP",
      appliesTo: "article",
      description: "Hold proof pressure",
    },
    {
      key: "TST-COLD-FLOW",
      name: "Cold-flow characterization",
      appliesTo: "either",
      description: "Flow vs dP at LN2/CH4 sim",
    },
    {
      key: "TST-PURGE-O2",
      name: "Purge O2 residual",
      appliesTo: "article",
      description: "O2 after GN2 purge",
    },
    {
      key: "TST-STAND-REF-PT",
      name: "Stand reference PT cal",
      appliesTo: "stand",
      description: "Reference transducer calibration",
    },
    {
      key: "TST-STAND-DAQ",
      name: "DAQ channel verification",
      appliesTo: "stand",
      description: "Channel map and noise floor",
    },
  ].map((t) => ({ ...t, id: id("tdef") }));

  for (const t of tests) {
    db.insert(s.testDefinitions)
      .values({
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        appliesTo: t.appliesTo,
      })
      .run();
  }
  const testByKey = Object.fromEntries(tests.map((t) => [t.key, t.id]));

  // --- Article config N (baseline) ---
  const cfgN = id("cfg");
  db.insert(s.configurations)
    .values({
      id: cfgN,
      key: "CH4-FEED-N",
      name: "CH4 feed baseline",
      kind: "article",
      status: "released",
      riskClass: "R2",
      notes: "Baseline proto config with 0.070 orifice",
      releasedAt: new Date().toISOString(),
      releasedBy: "m.chen",
    })
    .run();

  const effN = id("eff");
  db.insert(s.configEffectivity)
    .values({
      id: effN,
      configId: cfgN,
      articleScope: "serial_range",
      serialFrom: "TP-014",
      // capped when N+1 cut in for TP-017+ so the two configs partition
      // serials instead of overlapping (equal specificity would conflict)
      serialTo: "TP-016",
      standScope: "any",
    })
    .run();

  const bomN: Array<[string, number, string]> = [
    ["VLV-CRYO-050@A", 1, "10"],
    ["ORF-070@A", 1, "20"],
    ["SNS-PT-3K@A", 2, "30"],
    ["SNS-TT-CRYO@A", 2, "40"],
    ["TUBE-SS316-050@A", 4, "50"],
    ["FIT-AN4-EL@A", 6, "60"],
    ["MLI-BLANKET@A", 2, "70"],
    ["BRK-MANIFOLD@A", 1, "80"],
  ];
  for (const [revKey, qty, find] of bomN) {
    db.insert(s.configBomLines)
      .values({
        id: id("bom"),
        configId: cfgN,
        partRevisionId: revIds[revKey],
        qty,
        findNumber: find,
      })
      .run();
  }

  for (const procId of [procAssemble, procPurge]) {
    db.insert(s.configProcedures)
      .values({ id: id("cpr"), configId: cfgN, procedureId: procId })
      .run();
  }
  for (const key of ["TST-LEAK-HE", "TST-PROOF-1.5X", "TST-PURGE-O2", "TST-COLD-FLOW"]) {
    db.insert(s.configRequiredTests)
      .values({
        id: id("crt"),
        configId: cfgN,
        testDefinitionId: testByKey[key],
      })
      .run();
  }

  // --- Article config N+1 (overnight cut: orifice + valve rev B) ---
  const cfgNp1 = id("cfg");
  db.insert(s.configurations)
    .values({
      id: cfgNp1,
      key: "CH4-FEED-N+1",
      name: "CH4 feed — orifice 0.085 + valve B",
      kind: "article",
      status: "released",
      riskClass: "R3",
      basedOnConfigId: cfgN,
      notes:
        "Overnight cut-in: higher flow orifice, valve seat rev B. Re-test leak + cold-flow.",
      releasedAt: new Date().toISOString(),
      releasedBy: "m.chen",
      reviewerAckBy: "j.okonkwo",
      reviewerAckAt: new Date().toISOString(),
    })
    .run();

  const effNp1 = id("eff");
  db.insert(s.configEffectivity)
    .values({
      id: effNp1,
      configId: cfgNp1,
      articleScope: "explicit",
      standScope: "any",
    })
    .run();
  for (const serial of ["TP-017", "TP-018"]) {
    db.insert(s.configEffectivityArticles)
      .values({
        id: id("efa"),
        effectivityId: effNp1,
        articleId: artBySerial[serial],
      })
      .run();
  }

  const bomNp1: Array<[string, number, string]> = [
    ["VLV-CRYO-050@B", 1, "10"],
    ["ORF-085@A", 1, "20"],
    ["SNS-PT-3K@A", 2, "30"],
    ["SNS-TT-CRYO@A", 2, "40"],
    ["TUBE-SS316-050@A", 4, "50"],
    ["FIT-AN4-EL@A", 6, "60"],
    ["MLI-BLANKET@A", 2, "70"],
    ["BRK-MANIFOLD@A", 1, "80"],
  ];
  for (const [revKey, qty, find] of bomNp1) {
    db.insert(s.configBomLines)
      .values({
        id: id("bom"),
        configId: cfgNp1,
        partRevisionId: revIds[revKey],
        qty,
        findNumber: find,
      })
      .run();
  }
  for (const procId of [procAssemble, procPurge]) {
    db.insert(s.configProcedures)
      .values({ id: id("cpr"), configId: cfgNp1, procedureId: procId })
      .run();
  }
  for (const key of ["TST-LEAK-HE", "TST-PROOF-1.5X", "TST-PURGE-O2", "TST-COLD-FLOW"]) {
    db.insert(s.configRequiredTests)
      .values({
        id: id("crt"),
        configId: cfgNp1,
        testDefinitionId: testByKey[key],
      })
      .run();
  }

  // --- Stand config ---
  const cfgStand = id("cfg");
  db.insert(s.configurations)
    .values({
      id: cfgStand,
      key: "STAND-B-CFG-1",
      name: "Stand B instrumentation set 1",
      kind: "stand",
      status: "released",
      riskClass: "R2",
      notes: "Baseline stand manifold + DAQ",
      releasedAt: new Date().toISOString(),
      releasedBy: "a.reyes",
    })
    .run();
  db.insert(s.configEffectivity)
    .values({
      id: id("eff"),
      configId: cfgStand,
      articleScope: "any",
      standScope: "explicit",
      standId: standB,
    })
    .run();
  for (const [revKey, qty, find] of [
    ["MNF-STAND-B@A", 1, "10"],
    ["DAQ-CH16@A", 1, "20"],
    ["SNS-STAND-PT@A", 2, "30"],
  ] as const) {
    db.insert(s.configBomLines)
      .values({
        id: id("bom"),
        configId: cfgStand,
        partRevisionId: revIds[revKey],
        qty,
        findNumber: find,
      })
      .run();
  }
  db.insert(s.configProcedures)
    .values({ id: id("cpr"), configId: cfgStand, procedureId: procStand })
    .run();
  for (const key of ["TST-STAND-REF-PT", "TST-STAND-DAQ"]) {
    db.insert(s.configRequiredTests)
      .values({
        id: id("crt"),
        configId: cfgStand,
        testDefinitionId: testByKey[key],
      })
      .run();
  }

  // --- Inventory (thin) ---
  const inv: Array<[string, number, string]> = [
    ["VLV-CRYO-050@A", 3, "LOT-V50A"],
    ["VLV-CRYO-050@B", 2, "LOT-V50B"],
    ["ORF-070@A", 5, "LOT-O70"],
    ["ORF-085@A", 4, "LOT-O85"],
    ["SNS-PT-3K@A", 10, "LOT-PT"],
    ["SNS-TT-CRYO@A", 8, "LOT-TT"],
    ["FIT-AN4-EL@A", 40, "LOT-AN4"],
    ["TUBE-SS316-050@A", 20, "LOT-TUBE"],
    ["MLI-BLANKET@A", 6, "LOT-MLI"],
    ["BRK-MANIFOLD@A", 4, "LOT-BRK"],
  ];
  for (const [revKey, qty, lot] of inv) {
    db.insert(s.inventoryLots)
      .values({
        id: id("inv"),
        partRevisionId: revIds[revKey],
        qtyOnHand: qty,
        location: "PROTO-CAGE",
        lotCode: lot,
      })
      .run();
  }

  // Thin PO
  const poId = id("po");
  db.insert(s.purchaseOrders)
    .values({
      id: poId,
      poNumber: "PO-2026-0142",
      supplier: "CryoFit Supply",
      status: "ordered",
      notes: "Valve B + orifice 0.085 for N+1 cut-in",
    })
    .run();
  db.insert(s.purchaseOrderLines)
    .values([
      {
        id: id("pol"),
        purchaseOrderId: poId,
        partRevisionId: revIds["VLV-CRYO-050@B"],
        qty: 4,
        unitCost: 1850,
      },
      {
        id: id("pol"),
        purchaseOrderId: poId,
        partRevisionId: revIds["ORF-085@A"],
        qty: 10,
        unitCost: 120,
      },
    ])
    .run();

  // --- As-built for TP-014 on N ---
  for (const [revKey, qty, lot] of bomN) {
    db.insert(s.asBuiltLines)
      .values({
        id: id("ab"),
        articleId: artBySerial["TP-014"],
        partRevisionId: revIds[revKey],
        qty,
        serialOrLot: lot.includes("VLV") ? "SN-V-014" : `KIT-${lot}`,
      })
      .run();
  }

  // --- Run on TP-017 / STAND-B with N+1 (gaps expected) ---
  const runId = id("run");
  db.insert(s.runs)
    .values({
      id: runId,
      key: "RUN-2026-07-17-01",
      articleId: artBySerial["TP-017"],
      standId: standB,
      articleConfigId: cfgNp1,
      standConfigId: cfgStand,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      notes: "First article on N+1",
    })
    .run();

  // Explicit gap acknowledgment covering the two known-missing article tests
  const ackId = id("ack");
  db.insert(s.runGapAcks)
    .values({
      id: ackId,
      runId,
      ackBy: "m.chen",
      reason:
        "Proceeding to cold-flow with leak check pending re-seal after orifice swap",
    })
    .run();
  for (const key of ["TST-LEAK-HE", "TST-COLD-FLOW"]) {
    db.insert(s.runGapAckLines)
      .values({
        id: id("ackl"),
        ackId,
        testDefinitionId: testByKey[key],
        status: "missing",
      })
      .run();
  }

  db.insert(s.testResults)
    .values([
      {
        id: id("tres"),
        runId,
        testDefinitionId: testByKey["TST-PROOF-1.5X"],
        status: "pass",
        value: "1.5x MEOP hold 5 min",
        recordedBy: "tech.lee",
      },
      {
        id: id("tres"),
        runId,
        testDefinitionId: testByKey["TST-PURGE-O2"],
        status: "pass",
        value: "O2 12 ppm",
        recordedBy: "tech.lee",
      },
      {
        id: id("tres"),
        runId,
        testDefinitionId: testByKey["TST-STAND-REF-PT"],
        status: "pass",
        value: "cal OK",
        recordedBy: "a.reyes",
      },
      {
        id: id("tres"),
        runId,
        testDefinitionId: testByKey["TST-STAND-DAQ"],
        status: "pass",
        value: "16/16",
        recordedBy: "a.reyes",
      },
      // leak + cold-flow missing → warnings
    ])
    .run();

  for (const [revKey, qty] of bomNp1) {
    db.insert(s.asBuiltLines)
      .values({
        id: id("ab"),
        articleId: artBySerial["TP-017"],
        runId,
        partRevisionId: revIds[revKey],
        qty,
        serialOrLot: revKey.startsWith("VLV") ? "SN-V-017B" : "",
      })
      .run();
  }

  return {
    seeded: true,
    configN: cfgN,
    configNp1: cfgNp1,
    runId,
  };
}
