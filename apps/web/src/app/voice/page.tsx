import type { Metadata } from "next";

import {
  type CurrentVoiceTask,
  VoiceConsole,
  type VoiceModelOption,
  type VoiceOption,
  type VoiceTaskItem
} from "@/components/experience/voice-console";
import { PublicShell } from "@/components/shell/public-shell";
import {
  audioUrl,
  createExperienceTtsAudioTaskAction,
  getAudioModels,
  getAudioTask,
  getVoiceExperienceAudioTasks,
  getVoiceLibrary,
  getVoiceDialogueProject,
  getVoiceDialogueProjects,
  isVoiceExperienceTask,
  type AudioModelOption,
  type AudioTask,
  type VoiceLibrary
} from "@/lib/audio-api";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getCurrentBillingIdentity } from "@/lib/billing-identity";
import { cosyVoiceV35Presets, findPublishedCosyVoiceV35Preset } from "@/lib/cosyvoice-v35-presets";
import { getUserOrganizations, type UserOrganizationsResult } from "@/lib/organizations-api";
import { guardLearnerScenarioEntry } from "@/lib/profile-api";
import { preferredTtsModelNamesForVoice } from "@/lib/voice-picker";
import type { DialogueProject } from "@/lib/voice-dialogue";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "语音合成体验 - 学乐 AI",
  description: "输入讲解稿、选择音色和参数，生成可播放的学习讲解音频。"
};

const fallbackVoices = cosyVoiceV35Presets.map(mapCosyVoicePreset);

const fallbackModels: VoiceModelOption[] = [
  {
    aliasKey: "tts-default",
    displayName: "默认语音合成模型",
    statusName: "登录后加载",
    providerName: "阿里云 DashScope",
    modelName: null,
    isConfigured: false,
    inputPrice: "0",
    outputPrice: "0",
    pricingMode: "CHARACTERS",
    pricingUnit: "TEN_K_CHARACTERS",
    creditsPerCny: 100
  }
];

export default async function ExperienceVoicePage({
  searchParams
}: {
  searchParams: Promise<{ task?: string; project?: string; voice?: string; error?: string; created?: string; failed?: string }>;
}) {
  const query = await searchParams;
  const profile = await guardLearnerScenarioEntry("/voice");
  const currentUser = await getOptionalCurrentUser();
  let models: AudioModelOption[] = [];
  let library: VoiceLibrary | null = null;
  let tasks: AudioTask[] = [];
  let task: AudioTask | null = null;
  let organizations: UserOrganizationsResult | null = null;
  let dialogueHistory: DialogueProject[] = [];
  let currentProject: DialogueProject | null = null;
  let dialogueLoadError: string | undefined;

  if (currentUser) {
    const [modelsResult, libraryResult, tasksResult, taskResult, organizationsResult, projectsResult, projectResult] = await Promise.all([
      getAudioModels().catch(() => []),
      getVoiceLibrary().catch(() => null),
      getVoiceExperienceAudioTasks().catch(() => []),
      query.task ? getAudioTask(query.task).catch(() => null) : Promise.resolve(null),
      profile.mode === "ACCOUNT" ? getUserOrganizations().catch(() => null) : Promise.resolve(null),
      getVoiceDialogueProjects().catch(() => []),
      query.project ? getVoiceDialogueProject(query.project).catch(() => { dialogueLoadError = "多人配音项目无法加载，请稍后重试"; return null; }) : Promise.resolve(null)
    ]);

    models = modelsResult;
    library = libraryResult;
    tasks = tasksResult;
    task = taskResult;
    organizations = organizationsResult;
    dialogueHistory = projectsResult;
    currentProject = projectResult;
  }

  const voiceModels = mapVoiceModels(models);
  const voiceOptions = mapVoiceOptions(library);
  const history = tasks.filter(isVoiceExperienceTask).slice(0, 30).map(mapTaskItem);
  const currentTask = task && isVoiceExperienceTask(task) ? mapCurrentTask(task) : null;
  const billingIdentity = currentUser && profile.mode === "ACCOUNT"
    ? await getCurrentBillingIdentity(organizations)
    : null;
  const draftScope = `${currentUser?.id ?? "guest"}:${profile.mode === "LEARNER" ? profile.home.learner.id : "account"}`;

  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <VoiceConsole
        createAction={createExperienceTtsAudioTaskAction}
        currentTask={currentTask}
        currentProject={currentProject}
        currentUser={currentUser}
        dialogueHistory={dialogueHistory}
        draftScope={draftScope}
        error={query.error ?? dialogueLoadError}
        history={history}
        initialOrganizationId={billingIdentity?.organizationId ?? ""}
        initialVoiceValue={query.voice}
        key={draftScope}
        models={voiceModels}
        organizations={organizations}
        voices={voiceOptions}
      />
    </PublicShell>
  );
}

function mapVoiceModels(models: AudioModelOption[]): VoiceModelOption[] {
  const options = models
    .filter((model) => model.aliasKey.startsWith("tts") || model.aliasKey === "audio-preview")
    .map((model) => ({
      aliasKey: model.aliasKey,
      displayName: model.displayName,
      statusName: model.statusName,
      providerName: model.providerName,
      modelName: model.modelName,
      isConfigured: model.isConfigured,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      pricingMode: model.pricingMode,
      pricingUnit: model.pricingUnit,
      creditsPerCny: model.creditsPerCny
    }));

  return options.length > 0 ? options : fallbackModels;
}

function mapVoiceOptions(library: VoiceLibrary | null): VoiceOption[] {
  if (!library) {
    return fallbackVoices;
  }

  const defaultVoiceAssetId = library.defaultVoice.voiceAssetId;
  const defaultSystemVoiceId = library.defaultVoice.systemVoiceId;
  const systemVoices = library.systemVoices.map((voice) => ({
    value: `system:${voice.providerVoiceId ?? ""}`,
    name: voice.name,
    description: voice.description,
    badge: "官方系统音色",
    previewAudioUrl: voice.previewAudioUrl,
    isDefault: defaultSystemVoiceId === voice.providerVoiceId,
    language: voice.language,
    languages: voice.languages ?? [],
    accent: voice.accent,
    gender: voice.gender,
    avatarUrl: voice.avatarUrl,
    trait: voice.trait,
    scene: voice.scene,
    ageCategory: voice.ageCategory,
    supportedModels: voice.supportedModels ?? [],
    ssmlSupported: voice.ssmlSupported,
    instructSupported: voice.instructSupported,
      timestampSupported: voice.timestampSupported
    }));
  const platformVoices = (library.platformVoices ?? [])
    .filter((voice) => voice.status === "READY")
    .map((voice) => ({
      value: `voice:${voice.id}`,
      name: voice.name,
      description: voice.description,
      badge: voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色",
      previewAudioUrl: voice.previewAudioUrl,
      language: voice.language,
      languages: voice.languages ?? [],
      accent: voice.accent,
      gender: voice.gender,
      avatarUrl: voice.avatarUrl,
      ageCategory: voice.ageCategory,
      supportedModels: preferredTtsModelNamesForVoice(voice),
      isDefault: defaultVoiceAssetId === voice.id || (!defaultVoiceAssetId && !defaultSystemVoiceId && voice.name === cosyVoiceV35Presets[0]?.name)
    }));
  const customVoices = library.customVoices
    .filter((voice) => voice.status === "READY")
    .map((voice) => ({
      value: `voice:${voice.id}`,
      name: voice.name,
      description: voice.description,
      badge: voice.typeName,
      previewAudioUrl: voice.previewAudioUrl,
      language: voice.language,
      languages: voice.languages ?? [],
      accent: voice.accent,
      gender: voice.gender,
      avatarUrl: voice.avatarUrl,
      ageCategory: voice.ageCategory,
      supportedModels: preferredTtsModelNamesForVoice(voice),
      isDefault: defaultVoiceAssetId === voice.id
    }));
  const platformNames = new Set(cosyVoiceV35Presets
    .filter((preset) => findPublishedCosyVoiceV35Preset(preset, library.platformVoices))
    .map((preset) => preset.name));
  const options = [
    ...customVoices,
    ...platformVoices,
    ...systemVoices,
    ...fallbackVoices.filter((voice) => !platformNames.has(voice.name))
  ];

  return options.length > 0 ? options : fallbackVoices;
}

function mapCosyVoicePreset(preset: (typeof cosyVoiceV35Presets)[number]): VoiceOption {
  return {
    value: preset.value,
    name: preset.name,
    description: preset.description,
    badge: "CosyVoice v3.5 音色模板",
    previewAudioUrl: preset.previewAudioUrl,
    language: "中文普通话",
    languages: ["普通话"],
    avatarUrl: preset.avatarUrl,
    supportedModels: ["cosyvoice-v3.5-plus", "cosyvoice-v3.5-flash"],
    isDefault: preset.id === "announcer"
  };
}

function mapTaskItem(task: AudioTask): VoiceTaskItem {
  return {
    id: task.id,
    title: taskTitle(task),
    status: task.status,
    statusName: task.statusName,
    createdAt: formatShortDateTime(task.createdAt),
    createdAtIso: task.createdAt,
    audioUrl: audioUrl(task),
    voiceName: task.voiceAsset?.name ?? "系统音色",
    credits: task.actualCredits ?? task.estimatedCredits
  };
}

function mapCurrentTask(task: AudioTask): CurrentVoiceTask {
  return {
    ...mapTaskItem(task),
    text: task.inputText,
    errorMessage: task.errorMessage
  };
}

function taskTitle(task: AudioTask) {
  const text = task.inputText?.trim();

  if (!text) {
    return "语音合成任务";
  }

  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

function formatShortDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
