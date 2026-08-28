import { describe, expect, it } from "vitest";
import { matchCatalogQuery } from "./catalog-search";

const valve = {
  partNumber: "VLV-CRYO-050",
  name: "Cryogenic ball valve 1/2\"",
  category: "valve",
  sourcing: "buy",
  kind: "component",
  description: "Seat material change",
};

describe("matchCatalogQuery", () => {
  it("matches part number, name, and category without requiring submit", () => {
    expect(matchCatalogQuery(valve, "")).toBe(true);
    expect(matchCatalogQuery(valve, "vlv")).toBe(true);
    expect(matchCatalogQuery(valve, "cryo")).toBe(true);
    expect(matchCatalogQuery(valve, "valve")).toBe(true);
    expect(matchCatalogQuery(valve, "orf")).toBe(false);
  });
});
