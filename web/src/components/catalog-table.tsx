"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { matchCatalogQuery } from "../lib/catalog-search";
import { Badge, DataTable, inputClass } from "./ui";

export type CatalogTableRow = {
  id: string;
  partNumber: string;
  name: string;
  category: string;
  sourcing: string;
  kind: string;
  description: string;
  revisions: string[];
  onHand: number;
};

export function CatalogTable({
  parts,
  initialQuery,
}: {
  parts: CatalogTableRow[];
  initialQuery: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const pathname = usePathname();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const needle = q.trim();
      const href = needle
        ? `${pathname}?q=${encodeURIComponent(needle)}`
        : pathname;
      if (`${pathname}${window.location.search}` !== href) {
        window.history.replaceState(null, "", href);
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [q, pathname]);

  const filtered = useMemo(
    () => parts.filter((p) => matchCatalogQuery(p, q)),
    [parts, q],
  );

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search part number, name, category…"
        className={`mb-4 ${inputClass}`}
        autoComplete="off"
        aria-label="Search catalog"
      />
      <DataTable
        empty="No parts match — create one to the right."
        headers={["Part", "Name", "Revs", "Type", "Sourcing", "On hand"]}
        rows={filtered.map((p) => [
          <Link
            key="pn"
            href={`/catalog/${p.id}`}
            className="font-mono text-xs underline-offset-2 hover:underline"
          >
            {p.partNumber}
          </Link>,
          p.name,
          <span key="r" className="flex flex-wrap gap-1">
            {p.revisions.map((rev) => (
              <Badge key={rev} tone="accent">
                {rev}
              </Badge>
            ))}
          </span>,
          <span key="t" className="text-xs">
            {p.category}
            {p.kind === "assembly" ? (
              <Badge tone="warn"> assembly</Badge>
            ) : null}
          </span>,
          <Badge key="src" tone={p.sourcing === "make" ? "accent" : "neutral"}>
            {p.sourcing}
          </Badge>,
          String(p.onHand),
        ])}
      />
    </>
  );
}
