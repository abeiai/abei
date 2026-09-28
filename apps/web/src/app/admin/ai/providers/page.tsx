import { ProviderPresetList } from "@/components/ai/provider-preset-list";
import { AdminShell } from "@/components/shell/admin-shell";
import { getAdminAiProviderPresets } from "@/lib/ai-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminAiProviderPresetsPage() {
  const providers = await getAdminAiProviderPresets();

  return (
    <AdminShell
      active="/admin/ai/providers"
      title="模型配置"
    >
      <ProviderPresetList providers={providers} />
    </AdminShell>
  );
}
