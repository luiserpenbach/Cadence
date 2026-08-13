import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import {
  addBomLine,
  makeArticle,
  makeRevision,
  requireTest,
} from "../../test/fixtures";
import { importCatalogCsv } from "./catalog-csv";
import { createConfig, createStand } from "./authoring";
import { cutConfiguration } from "./cut-config";
import { createKit } from "./kits";
import { createTestDefinition } from "./procedures";
import { evaluateMeasurement, parseMeasured } from "./measurements";
import { releaseConfiguration } from "./release";
import { createWorkOrder, completeWorkOrder } from "./work-orders";
import { addPurchaseOrderLine, createPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { addEffectivityRow } from "./config-edit";

describe("thruster proto workflow", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("runs catalog → config → kit → make/buy → cut-in without retiring 50 N", () => {
    const imported = importCatalogCsv(
      db,
      [
        "part,name,rev,sourcing,kind",
        "INJ-100,Injector,A,make,component",
        "VLV-001,Valve,A,buy,component",
      ].join("\n"),
    );
    expect(imported.ok).toBe(true);

    const articleId = makeArticle(db, "THR-001");
    expect(createStand(db, { key: "VAC-CELL-A", name: "Vac cell", location: "bay" }).ok).toBe(
      true,
    );

    const thrust = createTestDefinition(db, {
      key: "THRUST",
      name: "Thrust",
      description: "",
      appliesTo: "article",
      unit: "N",
      limitMin: 47,
      limitMax: 53,
    });
    expect(thrust.ok).toBe(true);
    if (!thrust.ok) return;

    const cfg = createConfig(db, {
      key: "THR-50N-A",
      name: "50 N thruster",
      kind: "article",
      riskClass: "R1",
      program: "ACS-THR",
      envelope: "50 N · 1.2 MPa Pc",
    });
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;

    const inj = db.select().from(s.parts).all().find((p) => p.partNumber === "INJ-100")!;
    const vlv = db.select().from(s.parts).all().find((p) => p.partNumber === "VLV-001")!;
    const injA = db
      .select()
      .from(s.partRevisions)
      .all()
      .find((r) => r.partId === inj.id)!;
    const vlvA = db
      .select()
      .from(s.partRevisions)
      .all()
      .find((r) => r.partId === vlv.id)!;
    addBomLine(db, cfg.configId, injA.id, 1, "10");
    addBomLine(db, cfg.configId, vlvA.id, 1, "20");
    requireTest(db, cfg.configId, thrust.testDefinitionId);
    expect(
      addEffectivityRow(db, {
        configId: cfg.configId,
        articleScope: "any",
        standScope: "any",
        explicitArticleIds: [],
      }).ok,
    ).toBe(true);

    expect(releaseConfiguration(db, { configId: cfg.configId, by: "j.volkov" }).ok).toBe(
      true,
    );

    const wo = createWorkOrder(db, {
      partRevisionId: injA.id,
      qty: 1,
      by: "shop",
    });
    expect(wo.ok).toBe(true);
    if (!wo.ok) return;
    expect(completeWorkOrder(db, { workOrderId: wo.workOrderId, by: "shop" }).ok).toBe(
      true,
    );

    const po = createPurchaseOrder(db, { supplier: "CryoFit", notes: "" });
    expect(po.ok).toBe(true);
    if (!po.ok) return;
    expect(po.poNumber).toBe("PO-001");
    expect(
      addPurchaseOrderLine(db, {
        poId: po.poId,
        partRevisionId: vlvA.id,
        qty: 1,
        unitCost: 0,
      }).ok,
    ).toBe(true);
    expect(
      receivePurchaseOrder(db, {
        poId: po.poId,
        by: "cage",
        certUrl: "https://certs.example/cofc",
      }).ok,
    ).toBe(true);

    const kit1 = createKit(db, {
      articleId,
      configId: cfg.configId,
      by: "cage",
    });
    expect(kit1.ok).toBe(true);
    if (!kit1.ok) return;
    const kit2 = createKit(db, {
      articleId,
      configId: cfg.configId,
      by: "cage",
    });
    expect(kit2.ok).toBe(true);
    if (!kit2.ok) return;
    expect(kit2.existing).toBe(true);
    expect(kit2.kitId).toBe(kit1.kitId);
    expect(db.select().from(s.kits).all()).toHaveLength(1);

    const measured = parseMeasured("50.2 N");
    expect(measured).toBe(50.2);
    expect(
      evaluateMeasurement(measured!, { unit: "N", limitMin: 47, limitMax: 53 }).status,
    ).toBe("pass");

    makeRevision(db, inj.id, "B");
    const cut = cutConfiguration(db, {
      basedOnId: cfg.configId,
      key: "THR-50N-B",
      name: "50 N injector B",
      riskClass: "R1",
      applyLatestRevs: true,
    });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(cut.swapped.some((s) => s.partNumber === "INJ-100" && s.toRev === "B")).toBe(
      true,
    );
    expect(
      releaseConfiguration(db, { configId: cut.configId, by: "j.volkov" }).ok,
    ).toBe(true);

    const fifty = db
      .select()
      .from(s.configurations)
      .all()
      .find((c) => c.key === "THR-50N-A")!;
    const fiftyB = db
      .select()
      .from(s.configurations)
      .all()
      .find((c) => c.key === "THR-50N-B")!;
    expect(fifty.status).toBe("released");
    expect(fiftyB.status).toBe("released");
    expect(fifty.program).toBe("ACS-THR");
  });
});
