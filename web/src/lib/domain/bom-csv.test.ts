import { describe, expect, it } from "vitest";
import type { Db } from "../../db";
import { createTestDb } from "../../test/db";
import { addBomLine, makeConfig, makePart, makeRevision } from "../../test/fixtures";
import { exportBomCsv, importBomCsv, parseBomCsv } from "./bom-csv";

describe("BoM CSV", () => {
  it("parses a headered pin list", () => {
    const parsed = parseBomCsv(
      "find,part,rev,qty,notes\n10,VLV-001,A,2,seat\n20,ORF-070,A,1,",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({
      findNumber: "10",
      partNumber: "VLV-001",
      qty: 2,
      notes: "seat",
    });
  });

  it("rejects missing qty", () => {
    expect(parseBomCsv("find,part,rev,qty\n10,VLV,A,nope").ok).toBe(false);
  });

  it("rejects a missing find number", () => {
    expect(parseBomCsv("part,rev,qty\nVLV-001,A,1").ok).toBe(false);
    expect(parseBomCsv("find,part,rev,qty\n,VLV-001,A,1").ok).toBe(false);
    expect(
      parseBomCsv("find,part,rev,qty\n10,VLV-001,A,1\n10,ORF-070,A,1").ok,
    ).toBe(false);
  });

  it("imports by find number onto a draft", () => {
    const db: Db = createTestDb();
    const valve = makePart(db, "VLV-001", "A");
    makeRevision(db, valve.partId, "B");
    const configId = makeConfig(db, "CFG-N");
    addBomLine(db, configId, valve.revId, 1, "10");

    const result = importBomCsv(db, {
      configId,
      csv: "find,part,rev,qty,notes\n10,VLV-001,B,3,swap\n20,VLV-001,A,1,",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updated).toBe(1);
    expect(result.added).toBe(1);

    const csv = exportBomCsv(configId)!;
    expect(csv).toContain("VLV-001");
    expect(csv).toContain("3");
  });
});
