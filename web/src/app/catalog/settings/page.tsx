import Link from "next/link";
import { AppShell, linkClass } from "../../../components/ui";
import { CatalogSettingsForm } from "../../../components/catalog-settings-form";
import { ensureAppData } from "../../../lib/bootstrap";
import { getDb } from "../../../db";
import { ensureCatalogSettings } from "../../../lib/domain/catalog-settings";

export const dynamic = "force-dynamic";

export default async function CatalogSettingsPage() {
  ensureAppData();
  const settings = ensureCatalogSettings(getDb());

  return (
    <AppShell
      title="Catalog settings"
      subtitle="Categories and part-number prefixes used when creating parts. This is the only place to configure them."
      actions={
        <Link href="/catalog" className={linkClass}>
          Back to catalog
        </Link>
      }
    >
      <CatalogSettingsForm
        categories={settings.categories}
        prefixes={settings.prefixes}
      />
    </AppShell>
  );
}
