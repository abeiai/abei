import { redirect } from "next/navigation";

import { getAdminAiProviderPresets } from "@/lib/ai-admin-api";

export const dynamic = "force-dynamic";

export default async function AdminAudioModelsPage() {
  const providers = await getAdminAiProviderPresets();
  const audioProvider = providers.find((provider) => provider.modality === "AUDIO");

  redirect(audioProvider ? `/admin/ai/providers/${audioProvider.id}` : "/admin/ai/providers");
}
