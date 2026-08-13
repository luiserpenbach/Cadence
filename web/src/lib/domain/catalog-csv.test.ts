import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import * as s from "../../db/schema";
import { createTestDb } from "../../test/db";
import { importCatalogCsv, parseCatalogCsv } from "./catalog-csv";

describe("catalog CSV", () => {
  it("parses header rows and defaults", () => {
    const parsed = parseCatalogCsv(
      "part,name,rev,category,sourcing,kind\nINJ-100,Injector,A,injector,make,component\nVLV-001,Valve,,hardware,buy,component",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({
      partNumber: "INJ-100",
      sourcing: "make",
      revision: "A",
    });
    expect(parsed.lines[1].revision).toBe("A");
  });

  it("rejects bad sourcing and duplicates", () => {
    expect(
      parseCatalogCsv("part,name\nX,Y\nX,Z").ok,
    ).toBe(false);
    expect(
      parseCatalogCsv("part,name,sourcing\nX,Y,consign").ok,
    ).toBe(false);
  });
});

describe("importCatalogCsv", () => {
  let db: Db;
  beforeEach(() => {
    db = createTestDb();
  });

  it("creates parts and skips duplicates", () => {
    const first = importCatalogCsv(
      db,
      "part,name,sourcing\nINJ-100,Injector,make\nVLV-001,Valve,buy",
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.added).toBe(2);
    const again = importCatalogCsv(
      db,
      "part,name\nINJ-100,Injector\nORF-070,Orifice",
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.added).toBe(1);
    expect(again.skipped[0]).toContain("INJ-100");
    expect(db.select().from(s.parts).all()).toHaveLength(3);
  });
});
