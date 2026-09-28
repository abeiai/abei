import { BadgeCheck, Mic, Power, Tags, type LucideIcon } from "lucide-react";

import { ProviderConfigCard } from "@/components/ai/provider-config-card";
import { AudioModelManager } from "@/components/audio/audio-model-manager";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiProviderPreset } from "@/lib/ai-admin-api";
import type { AdminAudioModel } from "@/lib/audio-admin-api";

export function AudioModelConfigSection({
  models,
  provider
}: {
  models: AdminAudioModel[];
  provider: AiProviderPreset | null;
}) {
  const enabledCount = models.filter((model) => model.isEnabled).length;
  const asrCount = models.filter((model) => model.supportsSpeechToText).length;
  const ttsCount = models.filter((model) => model.supportsTts).length;
  const cloneCount = models.filter((model) => model.supportsVoiceClone).length;

  return (
    <div className="flex flex-col gap-6">
      <AudioProviderCard provider={provider} />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={Power} label="已启用模型" value={`${enabledCount}/${models.length}`} />
        <Metric icon={Mic} label="支持语音识别" value={asrCount.toLocaleString("zh-CN")} />
        <Metric icon={BadgeCheck} label="支持语音合成" value={ttsCount.toLocaleString("zh-CN")} />
        <Metric icon={Tags} label="支持声音复刻" value={cloneCount.toLocaleString("zh-CN")} />
      </div>

      <AudioModelManager models={models} />
    </div>
  );
}

function AudioProviderCard({ provider }: { provider: AiProviderPreset | null }) {
  if (!provider) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>语音 Provider 配置</CardTitle>
          <CardDescription>尚未找到语音 Provider 预置，请先同步 AI 语音模型预置。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <ProviderConfigCard provider={provider} />;
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <Icon />
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
