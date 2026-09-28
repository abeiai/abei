import { AdminAiScenarioManager } from "@/components/ai/admin-ai-scenario-manager";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  getAdminAiModelAliases,
  getAdminAiProviders,
  getAdminAiScenarios
} from "@/lib/ai-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminAiScenariosPage() {
  const [scenarios, providers, aliasPayload] = await Promise.all([
    getAdminAiScenarios(),
    getAdminAiProviders(),
    getAdminAiModelAliases()
  ]);
  const models = providers.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      modelName: model.modelName,
      providerName: provider.name
    }))
  );

  return (
    <AdminShell
      active="/admin/ai-scenarios"
      title="AI 场景管理"
      description="管理场景排序、提示词与模型配置。"
    >
      <AdminAiScenarioManager
        aliases={aliasPayload.aliases}
        models={models}
        scenarios={scenarios}
      />
    </AdminShell>
  );
}
