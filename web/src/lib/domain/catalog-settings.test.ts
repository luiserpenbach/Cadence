import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../db";
import { createTestDb } from "../../test/db";
import { createPart, updatePart } from "./authoring";
import {
  ensureCatalogSettings,
  getCatalogSettings,
  latestRevision,
  nextPartNumber,
  saveCatalogSettings,
} from "./catalog-settings";

describe("latestRevision", () => {
  it("returns the last letter or numeric revision", () => {
    expect(latestRevision([])).toBeNull();
    expect(latestRevision(["A"])).toBe("A");
    expect(latestRevision(["B", "A"])).toBe("B");
    expect(latestRevision(["A", "B", "C"])).toBe("C");
    expect(latestRevision(["9", "10"])).toBe("10");
  });
});

describe("nextPartNumber", () => {
  it("pads the first number to the configured length", () => {
    expect(nextPartNumber([], "PN-", 4)).toBe("PN-0001");
    expect(nextPartNumber([], "ORF-", 3)).toBe("ORF-001");
  });

  it("increments the highest matching numeric suffix", () => {
    expect(nextPartNumber(["ORF-070", "ORF-085", "VLV-001"], "ORF-", 3)).toBe(
      "ORF-086",
    );
  });

  it("ignores part numbers that do not match prefix + digits only", () => {
    expect(nextPartNumber(["VLV-CRYO-050", "VLV-001"], "VLV-", 3)).toBe("VLV-002");
  });

  it("grows past the configured width when needed", () => {
    expect(nextPartNumber(["PN-999"], "PN-", 3)).toBe("PN-1000");
  });
});

describe("catalog settings", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns null until a row is saved or ensured", () => {
    expect(getCatalogSettings(db)).toBeNull();
  });

  it("seeds categories from existing parts on ensure", () => {
    createPart(db, {
      partNumber: "VLV-001",
      name: "Valve",
      category: "valve",
      revision: "A",
    });
    const settings = ensureCatalogSettings(db);
    expect(settings.categories).toEqual(["hardware", "valve"]);
    expect(settings.prefixes).toEqual([]);
    expect(ensureCatalogSettings(db).categories).toEqual(["hardware", "valve"]);
  });

  it("round-trips categories and prefixes", () => {
    const saved = saveCatalogSettings(db, {
      categories: ["valve", "sensor", ""],
      prefixes: [
        { prefix: "PN-", length: 4 },
        { prefix: "ORF-", length: 3 },
      ],
    });
    expect(saved.ok).toBe(true);
    expect(getCatalogSettings(db)).toEqual({
      categories: ["valve", "sensor"],
      prefixes: [
        { prefix: "PN-", length: 4 },
        { prefix: "ORF-", length: 3 },
      ],
    });
  });

  it("rejects duplicate categories and invalid digit lengths", () => {
    expect(
      saveCatalogSettings(db, {
        categories: ["Valve", "valve"],
        prefixes: [],
      }).ok,
    ).toBe(false);
    expect(
      saveCatalogSettings(db, {
        categories: ["valve"],
        prefixes: [{ prefix: "PN-", length: 0 }],
      }).ok,
    ).toBe(false);
  });

  it("lets createPart use any category until settings exist", () => {
    const result = createPart(db, {
      partNumber: "X-1",
      name: "X",
      category: "c",
      revision: "A",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown categories once a list is saved", () => {
    saveCatalogSettings(db, {
      categories: ["valve"],
      prefixes: [],
    });
    const denied = createPart(db, {
      partNumber: "X-1",
      name: "X",
      category: "c",
      revision: "A",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toMatch(/catalog list/i);

    const allowed = createPart(db, {
      partNumber: "VLV-001",
      name: "Valve",
      category: "valve",
      revision: "A",
    });
    expect(allowed.ok).toBe(true);
  });

  it("lets updatePart keep a category that was removed from settings", () => {
    const part = createPart(db, {
      partNumber: "VLV-001",
      name: "Valve",
      category: "c",
      revision: "A",
    });
    if (!part.ok) throw new Error("setup");
    saveCatalogSettings(db, { categories: ["valve"], prefixes: [] });

    const keep = updatePart(db, {
      partId: part.partId,
      name: "Valve",
      category: "c",
      sourcing: "buy",
      kind: "component",
      description: "",
    });
    expect(keep.ok).toBe(true);

    const change = updatePart(db, {
      partId: part.partId,
      name: "Valve",
      category: "sensor",
      sourcing: "buy",
      kind: "component",
      description: "",
    });
    expect(change.ok).toBe(false);

    const toValve = updatePart(db, {
      partId: part.partId,
      name: "Valve",
      category: "valve",
      sourcing: "buy",
      kind: "component",
      description: "",
    });
    expect(toValve.ok).toBe(true);
  });
});
