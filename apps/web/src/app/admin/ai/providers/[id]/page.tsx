import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ProviderConfigCard } from "@/components/ai/provider-config-card";
import { ProviderModelManager } from "@/components/ai/provider-model-manager";
import { AudioModelConfigSection } from "@/components/audio/audio-model-config-section";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { getAdminAiProviderPreset } from "@/lib/ai-admin-api";
import { getAdminAudioModels } from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminAiProviderPresetDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = await getAdminAiProviderPreset(id);
  const isAudioProvider = provider.adapterType === "DASHSCOPE_AUDIO" || provider.adapterType === "MINIMAX_AUDIO" || provider.modality === "AUDIO";

  if (isAudioProvider) {
    const models = (await getAdminAudioModels()).filter((model) => model.provider === provider.providerKey);

    return (
      <AdminShell
        active="/admin/ai/providers"
        title={provider.displayName}
        description="管理语音 Provider、语音模型启停、能力标签、定价和用途绑定。"
      >
        <div className="flex flex-col gap-6">
          <Button asChild className="w-fit" variant="outline">
            <Link href="/admin/ai/providers">
              <ArrowLeft data-icon="inline-start" />
              返回 Provider 列表
            </Link>
          </Button>

          <AudioModelConfigSection models={models} provider={provider} />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      active="/admin/ai/providers"
      title={provider.displayName}
      description="管理该厂商下的模型启停、能力标签、定价和用途绑定。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild className="w-fit" variant="outline">
          <Link href="/admin/ai/providers">
            <ArrowLeft data-icon="inline-start" />
            返回 Provider 列表
          </Link>
        </Button>

        <ProviderConfigCard provider={provider} />
        <ProviderModelManager provider={provider} />
      </div>
    </AdminShell>
  );
}
