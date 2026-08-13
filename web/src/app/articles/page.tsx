import Link from "next/link";
import { AppShell, Badge, DataTable, Panel } from "../../components/ui";
import { ensureAppData } from "../../lib/bootstrap";
import { getDb } from "../../db";
import * as s from "../../db/schema";
import { eq } from "drizzle-orm";
import { NewArticleForm } from "../../components/authoring-forms";

export const dynamic = "force-dynamic";

export default function ArticlesPage() {
  ensureAppData();
  const db = getDb();
  const articles = db.select().from(s.articles).all();
  const asBuiltCounts = articles.map((a) => {
    const lines = db
      .select()
      .from(s.asBuiltLines)
      .where(eq(s.asBuiltLines.articleId, a.id))
      .all();
    return { id: a.id, count: lines.length };
  });
  const countById = Object.fromEntries(
    asBuiltCounts.map((c) => [c.id, c.count]),
  );

  return (
    <AppShell
      title="Articles"
      subtitle="Named proto units. Effectivity targets serials like TP-017+; genealogy stays on the article."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <DataTable
            headers={["Serial", "Name", "Status", "As-built lines"]}
            rows={articles.map((a) => [
              <Link
                key="s"
                href={`/articles/${a.id}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {a.serial}
              </Link>,
              a.name,
              <Badge key="st" tone="neutral">
                {a.status}
              </Badge>,
              String(countById[a.id] ?? 0),
            ])}
          />
        </Panel>

        <Panel>
          <h2 className="font-display">New article</h2>
          <NewArticleForm />
        </Panel>
      </div>
    </AppShell>
  );
}
