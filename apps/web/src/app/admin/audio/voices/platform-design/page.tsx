import { PlatformVoiceDesignConsole } from "@/components/audio/platform-voice-design-console";
import { AdminShell } from "@/components/shell/admin-shell";
import {
  createAdminPlatformVoiceDesignAction,
  getAdminAudioModels,
  getAdminVoiceAssets
} from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    created?: string;
    error?: string;
    voice?: string;
  }>;
}

export default async function AdminPlatformVoiceDesignPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const [voices, models] = await Promise.all([getAdminVoiceAssets(), getAdminAudioModels()]);
  const platformDesignedVoices = voices
    .filter((voice) => voice.isPlatform && voice.type === "DESIGNED" && voice.status === "READY")
    .map((voice) => ({
      id: voice.id,
      name: voice.name,
      status: voice.status,
      statusName: voice.statusName,
      providerVoiceId: voice.providerVoiceId,
      previewAudioUrl: voice.previewAudioUrl,
      description: voice.description,
      createdAt: voice.createdAt
    }));
  const recentVoices = platformDesignedVoices.slice(0, 3);
  const voiceDesignModels = models
    .filter((model) => model.supportsVoiceDesign)
    .map((model) => ({
      id: model.id,
      displayName: model.displayName,
      modelName: model.modelName,
      providerDisplayName: model.providerDisplayName,
      isAvailable: model.isEnabled && model.providerStatus === "ENABLED"
    }));

  return (
    <AdminShell
      active="/admin/audio/voices"
      title="平台音色设计"
      description="通过提示词生成平台公共设计音色。"
      forceTitle
    >
      <PlatformVoiceDesignConsole
        action={createAdminPlatformVoiceDesignAction}
        created={query.created === "1"}
        error={query.error}
        initialVoiceId={query.voice}
        models={voiceDesignModels}
        voices={recentVoices}
      />
    </AdminShell>
  );
}
