const voiceFields = ["id", "provider", "providerVoiceId", "name", "type", "targetModel", "status", "visibility", "language", "accent", "gender", "ageCategory", "avatarUrl", "description", "previewAudioUrl", "sourceAudioAssetId", "previewAudioAssetId", "reviewedAt", "reviewNote", "disabledReason", "deletedAt", "createdAt", "updatedAt"];
const audioFields = ["id", "type", "storageProvider", "url", "objectKey", "mimeType", "durationMs", "sizeBytes", "sampleRate", "channels", "createdAt"];
const configFields = ["key", "label", "value", "description", "group", "isPublic", "sortOrder"];
const pick = (row, fields) => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]));

export function prepareVoiceLibraryMedia(source, assetUrls, unavailablePreviewVoiceIds) {
  for (const id of unavailablePreviewVoiceIds) if (!source.voices.some(row => row.id === id && !row.previewAudioAssetId)) throw new Error("失效试听修正只能对应导出包中的无资产角色");
  const voices = source.voices.map(row => {
    const url = row.previewAudioAssetId ? assetUrls.get(row.previewAudioAssetId) : unavailablePreviewVoiceIds.includes(row.id) ? null : row.previewAudioUrl;
    if (row.previewAudioAssetId && !url) throw new Error("角色关联试听尚未迁移完成");
    return { ...row, previewAudioUrl: url };
  });
  return { ...source, voices };
}

export function validateVoiceImportTarget(value) {
  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !["localhost", "127.0.0.1", "postgres"].includes(url.hostname) || url.port !== "3604" || url.pathname !== "/abei" || url.hash || [...url.searchParams].some(([key, value]) => key !== "schema" || value !== "public")) {
    throw new Error("导入目标必须是本地 abei 独立数据库（3604）");
  }
}

export function planVoiceLibraryImport(source, target) {
  if (source.version !== 1 || source.source !== "xueleai-local" || !Array.isArray(source.voices) || !source.voices.length || !Array.isArray(source.audioAssets) || !Array.isArray(source.systemConfigs)) throw new Error("语音导出数据格式不正确");
  if (target.voices.some(row => row.isPlatform)) throw new Error("目标已有平台音色，请先审核覆盖方案，禁止直接删除引用");
  const targetIds = new Set(target.voices.map(row => row.id));
  const ids = new Set(), identities = new Set(), audioIds = new Set();
  const audioAssets = source.audioAssets.map(row => {
    if (!row.id || audioIds.has(row.id)) throw new Error("音频资产 ID 重复");
    if (target.audioAssetIds.includes(row.id)) throw new Error("音频资产 ID 与现有数据冲突");
    if (!["LOCAL", "S3"].includes(row.storageProvider) || !row.objectKey || row.objectKey.split(/[\\/]/).some(part => part === "..") || (row.storageProvider === "LOCAL" && /[\\/]/.test(row.objectKey))) throw new Error("音频资产路径不安全");
    if (row.type !== "PREVIEW" || !row.mimeType?.startsWith("audio/") || !Number.isInteger(row.sizeBytes) || row.sizeBytes <= 0) throw new Error("仅接受完整的平台试听音频资产");
    audioIds.add(row.id);
    return pick(row, audioFields);
  });
  const voices = source.voices.map(row => {
    if (row.isPlatform !== true || row.consentId || !["SYSTEM", "DESIGNED"].includes(row.type)) throw new Error("导出包只能包含系统与平台设计音色");
    if (!row.id || !row.providerVoiceId || !row.name || !row.targetModel || !["READY", "DISABLED"].includes(row.status) || row.visibility !== "PUBLIC") throw new Error("平台音色资料不完整或状态不支持");
    if (targetIds.has(row.id)) throw new Error("音色 ID 与现有私人角色冲突");
    const identity = JSON.stringify([row.provider, row.providerVoiceId, row.targetModel]);
    if (ids.has(row.id) || identities.has(identity)) throw new Error("导出包包含重复音色");
    ids.add(row.id); identities.add(identity);
    const providers = target.providers.filter(provider => provider.providerKey === row.providerKey && provider.name === row.providerInstanceName);
    if (providers.length !== 1 || row.provider !== row.providerKey) throw new Error(`音色服务商无法唯一匹配：${row.providerInstanceName}`);
    for (const field of ["sourceAudioAssetId", "previewAudioAssetId"]) if (row[field] && !audioIds.has(row[field])) throw new Error("音色关联音频未完整导出");
    return { ...pick(row, voiceFields), providerInstanceId: providers[0].id, isPlatform: true, consentId: null, importedReviewed: Boolean(row.reviewedByAdminId) };
  });
  const systemConfigs = source.systemConfigs.map(row => {
    if (row.key !== "cosyVoiceSystemVoiceOverrides" || !row.value) throw new Error("导出包混入非语音角色配置");
    const overrides = JSON.parse(row.value);
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new Error("系统音色覆盖配置格式错误");
    return { ...pick(row, configFields), isPublic: false };
  });
  if (new Set(systemConfigs.map(row => row.key)).size !== systemConfigs.length) throw new Error("系统音色配置重复");
  return { voices, audioAssets, systemConfigs };
}

export async function applyVoiceLibraryImport(prisma, source, { ownerPasswordHash, adminId }) {
  return prisma.$transaction(async tx => {
    const [providers, voices, assets] = await Promise.all([
      tx.aiProviderInstance.findMany({ select: { id: true, name: true, providerPreset: { select: { providerKey: true } } } }),
      tx.voiceAsset.findMany({ select: { id: true, isPlatform: true } }),
      tx.audioAsset.findMany({ select: { id: true } })
    ]);
    const plan = planVoiceLibraryImport(source, { providers: providers.map(row => ({ ...row, providerKey: row.providerPreset.providerKey })), voices, audioAssetIds: assets.map(row => row.id) });
    if (plan.audioAssets.some(row => row.storageProvider !== "S3" || !row.url?.startsWith("https://"))) throw new Error("试听音频必须迁入 R2 后才能写入");
    let owner = await tx.user.findUnique({ where: { email: "platform-voice@xueleai.local" }, select: { id: true } });
    if (!owner) owner = await tx.user.create({ data: { email: "platform-voice@xueleai.local", nickname: "平台音色", status: "ACTIVE", passwordHash: ownerPasswordHash }, select: { id: true } });
    const dates = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key.endsWith("At") && typeof value === "string" ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`) : value]));
    await tx.audioAsset.createMany({ data: plan.audioAssets.map(row => ({ ...dates(row), userId: owner.id })) });
    await tx.voiceAsset.createMany({ data: plan.voices.map(({ importedReviewed, ...row }) => ({ ...dates(row), userId: owner.id, reviewedByAdminId: importedReviewed ? adminId : null })) });
    for (const row of plan.systemConfigs) {
      const metadata = { label: "系统音色覆盖配置", description: "从 xueleai 本地导入的官方音色名称、分类和状态", group: "audio", sortOrder: 360, ...row };
      await tx.systemConfig.upsert({ where: { key: row.key }, create: metadata, update: metadata });
    }
    return { voices: plan.voices.length, audioAssets: plan.audioAssets.length, systemConfigs: plan.systemConfigs.length };
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
