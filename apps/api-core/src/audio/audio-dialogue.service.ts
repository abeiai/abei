import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { OrganizationsService } from "../organizations/organizations.service.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import { AudioService } from "./audio.service.js";
import { DialogueAudioError, persistDialogueClip, mergeDialogueAudio } from "./dialogue-audio.js";
import { reserveDialogueBilling, settleDialogueBilling } from "./audio-dialogue-billing.js";
import { assertDialogueQuoteCurrent, buildDialoguePlans, dialogueAudioFingerprint, dialogueFingerprint, stripDialogueAudioCache, successfulDialogueCredits, validateDialogueInput, type DialogueInput, type DialoguePlan, type DialogueClips } from "./audio-dialogue.types.js";

const activeStatuses = ["RESERVING", "QUEUED", "RUNNING", "MERGING"];
const includeProject = { outputAudioAsset: true, generations: { where: { status: { not: "QUOTED" } }, orderBy: { createdAt: "desc" as const }, take: 1 } };
type Project = Prisma.AudioDialogueProjectGetPayload<{ include: typeof includeProject }>;
type Generation = Prisma.AudioDialogueGenerationGetPayload<Prisma.AudioDialogueGenerationDefaultArgs>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const plansOf = (value: Prisma.JsonValue) => value as unknown as DialoguePlan[];
const clipsOf = (value: Prisma.JsonValue) => value as unknown as DialogueClips;
const canonicalInput = (input: DialogueInput): DialogueInput => {
  const value = { ...input };
  delete value.projectId;
  delete value.revision;
  delete value.segmentId;
  return value;
};
const quoteFingerprint = (input: DialogueInput, plans: DialoguePlan[]) => dialogueFingerprint({ input, plans: plans.map(p => ({ id: p.id, fingerprint: p.fingerprint, pricing: p.pricingFingerprint, credits: p.credits, reused: p.reused, cachedTask: p.status === "STORING" ? p.audioTaskId : null })) });
const friendlyError = (error: unknown) => error instanceof AppException || error instanceof DialogueAudioError ? error.message : "音频处理失败，请稍后重试";

@Injectable()
export class AudioDialogueService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma = getPrismaClient();
  private readonly logger = new Logger(AudioDialogueService.name);
  private readonly storage = { persist: persistDialogueClip, merge: mergeDialogueAudio };
  private timer?: ReturnType<typeof setInterval>;
  private work: Promise<void> | null = null;
  private lastCacheCleanup = 0;

  constructor(@Inject(AudioService) private readonly audio: AudioService, @Inject(OrganizationsService) private readonly organizations: OrganizationsService) {}

  onModuleInit() {
    if (process.env.AUDIO_DIALOGUE_WORKER_ENABLED === "false") return;
    this.timer = setInterval(() => {
      if (!this.work) {
        this.work = this.processNext().catch(error => this.logger.error("多人配音任务处理异常", error)).finally(() => { this.work = null; });
      }
    }, 3000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.work;
  }
  private scope(subject: ProfileSubject) { return { userId: subject.userId, learnerId: subject.learnerId }; }
  private async assertBillingContext(subject: ProfileSubject, input: DialogueInput) {
    if (subject.mode === "LEARNER" && input.billingContext !== "PERSONAL") throw new AppException(40301, "学习者身份仅支持个人点数", 403);
    if (input.billingContext === "ORGANIZATION") {
      if (!(await this.organizations.isEnterpriseEnabled())) throw new AppException(40301, "企业空间未启用", 403);
      const member = await this.prisma.organizationMember.findFirst({ where: { userId: subject.userId, orgId: input.organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } } });
      if (!member) throw new AppException(40301, "没有当前企业空间的使用权限", 403);
    }
  }
  private async record(subject: ProfileSubject, id: string): Promise<Project> {
    const project = await this.prisma.audioDialogueProject.findFirst({ where: { id, ...this.scope(subject) }, include: includeProject });
    if (!project) throw new AppException(40401, "多人配音记录不存在", 404);
    return project;
  }
  async list(subject: ProfileSubject) {
    const records = await this.prisma.audioDialogueProject.findMany({ where: this.scope(subject), include: includeProject, orderBy: { createdAt: "desc" }, take: 30 });
    return records.map(project => this.serialize(project));
  }
  async get(subject: ProfileSubject, id: string) { return this.serialize(await this.record(subject, id)); }
  private serialize(project: Project) {
    const input = validateDialogueInput(project.input);
    const clips = clipsOf(project.clips);
    const generation = project.generations[0];
    const plans = generation ? plansOf(generation.plans) : [];
    const generatedInput = generation ? validateDialogueInput(generation.input) : null;
    return {
      ...input, id: project.id, projectId: project.id, title: project.title, revision: project.revision,
      status: project.status, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(),
      actualCredits: project.actualCredits, audioUrl: project.outputAudioAsset?.url ?? null,
      outputRevision: project.outputRevision, errorMessage: project.errorMessage,
      generationId: generation?.id ?? null,
      segments: input.segments.map(segment => {
        const previous = generatedInput?.segments.find(s => s.id === segment.id);
        const previousVoice = generatedInput?.speakers.find(s => s.id === previous?.speakerId)?.voiceValue;
        const voice = input.speakers.find(s => s.id === segment.speakerId)?.voiceValue;
        const sameAudio = previous?.text === segment.text && previous?.speed === segment.speed && previousVoice === voice;
        const plan = sameAudio ? plans.find(p => p.id === segment.id) : undefined;
        const clip = clips[segment.id];
        const valid = Boolean(plan && clip && plan.fingerprint === clip.fingerprint && ["REUSED", "SUCCEEDED"].includes(plan.status));
        return { ...segment, status: valid ? "SUCCEEDED" : plan?.status ?? "PENDING", audioUrl: valid ? clip.url : null, errorMessage: valid ? null : plan?.errorMessage ?? null };
      })
    };
  }
  private async validClips(project: Project): Promise<DialogueClips> {
    const clips = clipsOf(project.clips);
    const assets = await this.prisma.audioAsset.findMany({ where: { id: { in: Object.values(clips).map(c => c.audioAssetId) }, userId: project.userId, storageProvider: "S3", sizeBytes: { gt: 0 } }, select: { id: true, url: true } });
    return Object.fromEntries(Object.entries(clips).filter(([, clip]) => assets.some(asset => asset.id === clip.audioAssetId)).map(([id, clip]) => [id, { ...clip, url: assets.find(a => a.id === clip.audioAssetId)!.url }]));
  }
  private async prepare(subject: ProfileSubject, input: DialogueInput, clips: DialogueClips, scenarioId: string | null) {
    const plans = await buildDialoguePlans(input, clips, async (_unused, segment, speaker) =>
      this.audio.prepareDialogueTts({ ...this.scope(subject), rootScenarioId: scenarioId }, { text: segment.text, voiceValue: speaker.voiceValue, speed: segment.speed }));
    if (input.projectId) {
      for (const plan of plans.filter(p => p.status === "PENDING")) {
        const fingerprints = [plan.fingerprint];
        if (input.segmentId !== plan.id) fingerprints.push(dialogueAudioFingerprint(input.segments.find(s => s.id === plan.id)!, plan, "mp3"));
        const cached = await this.prisma.audioTask.findFirst({ where: {
          ...this.scope(subject), audioDialogueGeneration: { projectId: input.projectId }, outputAudioAssetId: null,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          AND: [
            { OR: fingerprints.map(fingerprint => ({ providerPayload: { path: ["dialogueFingerprint"], equals: fingerprint } })) },
            { providerPayload: { path: ["dialogueSegmentId"], equals: plan.id } }
          ]
        }, orderBy: { createdAt: "desc" } });
        const payload = cached?.providerPayload as Record<string, unknown> | null;
        if (payload?.dialogueResult) { plan.fingerprint = payload.dialogueFingerprint as string; plan.audioTaskId = cached!.id; plan.status = "STORING"; plan.credits = 0; }
      }
    }
    return plans;
  }
  async quote(subject: ProfileSubject, raw: unknown, scenarioId: string | null = null) {
    const input = validateDialogueInput(raw);
    await this.assertBillingContext(subject, input);
    const current = input.projectId ? await this.record(subject, input.projectId) : null;
    if (current && input.revision !== current.revision) throw new AppException(40901, "配音记录已更新，请重新加载后确认费用", 409);
    const clips = current ? await this.validClips(current) : {};
    const plans = await this.prepare(subject, input, clips, current?.scenarioId ?? scenarioId);
    const snapshot = { ...canonicalInput(input), ...(input.segmentId ? { segmentId: input.segmentId } : {}) };
    const generation = await this.prisma.$transaction(async tx => {
      let project = current;
      if (project) {
        await tx.$queryRaw`SELECT id FROM audio_dialogue_projects WHERE id = ${project.id} FOR UPDATE`;
        const fresh = await tx.audioDialogueProject.findUniqueOrThrow({ where: { id: project.id } });
        if (fresh.revision !== input.revision) throw new AppException(40901, "配音记录已更新，请重新确认费用", 409);
        if (await tx.audioDialogueGeneration.count({ where: { projectId: project.id, status: { in: activeStatuses } } })) throw new AppException(40901, "当前配音仍在处理中，请稍后修改", 409);
        const changed = dialogueFingerprint(fresh.input) !== dialogueFingerprint(canonicalInput(input));
        project = await tx.audioDialogueProject.update({ where: { id: project.id }, data: {
          input: json(canonicalInput(input)), clips: json(clips), title: input.segments[0].text.slice(0, 60),
          revision: changed ? { increment: 1 } : undefined, status: "DRAFT", errorMessage: null
        }, include: includeProject });
      } else {
        project = await tx.audioDialogueProject.create({ data: {
          ...this.scope(subject), scenarioId, title: input.segments[0].text.slice(0, 60), input: json(canonicalInput(input))
        }, include: includeProject });
      }
      return tx.audioDialogueGeneration.create({ data: {
        projectId: project.id, revision: project.revision, input: json(snapshot), plans: json(plans),
        fingerprint: quoteFingerprint(snapshot, plans), estimatedCredits: plans.reduce((sum, p) => sum + p.credits, 0),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      } });
    });
    return { id: generation.id, projectId: generation.projectId, revision: generation.revision, expiresAt: generation.expiresAt.toISOString(), totalCredits: generation.estimatedCredits,
      segments: plans.map(p => ({ id: p.id, speakerId: p.speakerId, speakerName: p.speakerName, voiceName: p.voiceName, modelName: p.modelName, billingCharacters: p.billingCharacters, credits: p.credits, reused: p.reused })) };
  }
  async confirm(subject: ProfileSubject, quoteId: string) {
    const generation = await this.prisma.audioDialogueGeneration.findFirst({ where: { id: quoteId, project: this.scope(subject) } });
    if (!generation) throw new AppException(40401, "费用确认不存在", 404);
    const project = await this.record(subject, generation.projectId);
    if (generation.status !== "QUOTED") return this.get(subject, project.id);
    const input = validateDialogueInput(generation.input);
    await this.assertBillingContext(subject, input);
    const freshPlans = await this.prepare(subject, { ...input, projectId: project.id }, await this.validClips(project), project.scenarioId);
    assertDialogueQuoteCurrent({ ...generation }, project.revision, quoteFingerprint(input, freshPlans));
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM audio_dialogue_projects WHERE id = ${project.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM audio_dialogue_generations WHERE id = ${generation.id} FOR UPDATE`;
      const fresh = await tx.audioDialogueGeneration.findUniqueOrThrow({ where: { id: generation.id } });
      if (fresh.status !== "QUOTED") return fresh;
      const current = await tx.audioDialogueProject.findUniqueOrThrow({ where: { id: project.id } });
      assertDialogueQuoteCurrent(fresh, current.revision, quoteFingerprint(input, freshPlans));
      if (await tx.audioDialogueGeneration.count({ where: { projectId: project.id, status: { in: activeStatuses } } })) throw new AppException(40901, "该配音已有任务在处理", 409);
      const billing = await reserveDialogueBilling(tx, {
        ...this.scope(subject), scenarioId: project.scenarioId, projectId: project.id,
        credits: fresh.estimatedCredits, billingContext: input.billingContext, organizationId: input.organizationId
      });
      const status = input.billingContext === "ORGANIZATION" && fresh.estimatedCredits > 0 ? "RESERVING" : "QUEUED";
      const batch = await tx.audioDialogueGeneration.update({ where: { id: fresh.id }, data: { billingAudioTaskId: billing.id, status } });
      await tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "QUEUED", errorMessage: null } });
      if (status === "QUEUED") await tx.audioTask.update({ where: { id: billing.id }, data: { status: "RESERVED" } });
      return batch;
    });
    // Enterprise reservation is performed only by the leased worker, never by a competing HTTP callback.
    return this.get(subject, project.id);
  }
  private async reserveEnterprise(generation: Generation, owner: string) {
    const input = validateDialogueInput(generation.input);
    const project = await this.prisma.audioDialogueProject.findUniqueOrThrow({ where: { id: generation.projectId } });
    const usageRequestId = `audio-dialogue:${generation.id}`;
    try {
      let reservation = await this.prisma.organizationWalletReservation.findUnique({ where: { usageRequestId } });
      if (!reservation) reservation = await this.organizations.reserveEnterpriseUsage({ userId: project.userId, orgId: input.organizationId!, points: generation.estimatedCredits,
        featureCode: "audio.tts", usageRequestId, resourceType: "audio_dialogue", resourceId: project.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      if (reservation.status !== "RESERVED") throw new AppException(40901, "企业冻结记录已失效，请重新确认费用", 409);
      const memberId = reservation.memberId;
      await this.leased(generation.id, owner, async (tx, fresh) => {
        if (fresh.status !== "RESERVING") return;
        await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { status: "RUNNING" } });
        await tx.audioTask.update({ where: { id: generation.billingAudioTaskId! }, data: { status: "RESERVED", organizationMemberId: memberId } });
      });
    } catch (error) {
      // Connection uncertainty keeps RESERVING for idempotent recovery; known rejection runs no provider work.
      if (!(error instanceof AppException) || error.message === "配音任务执行权已移交") throw error;
      const reservation = await this.prisma.organizationWalletReservation.findUnique({ where: { usageRequestId } });
      // A committed reservation may survive a lost response. Keep it recoverable instead of stranding its funds.
      if (reservation?.status === "RESERVED") throw error;
      await this.leased(generation.id, owner, async (tx, fresh) => {
        if (fresh.status !== "RESERVING") return;
        await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { status: "FAILED", actualCredits: 0, leaseOwner: null, leaseUntil: null, errorMessage: friendlyError(error) } });
        await tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "FAILED", errorMessage: friendlyError(error) } });
        await tx.audioTask.update({ where: { id: generation.billingAudioTaskId! }, data: { status: "FAILED", actualCredits: 0, errorMessage: friendlyError(error), finishedAt: new Date() } });
      });
      throw error;
    }
  }
  async remerge(subject: ProfileSubject, id: string) {
    const project = await this.record(subject, id);
    const quote = await this.quote(subject, { ...validateDialogueInput(project.input), projectId: id, revision: project.revision }, project.scenarioId);
    if (quote.totalCredits !== 0) throw new AppException(40901, "部分句子需要生成，请重新确认合成费用", 409);
    return this.confirm(subject, quote.id);
  }
  private async leased<T>(generationId: string, owner: string, callback: (tx: Prisma.TransactionClient, generation: Generation) => Promise<T>): Promise<T> {
    const reference = await this.prisma.audioDialogueGeneration.findUniqueOrThrow({ where: { id: generationId }, select: { projectId: true } });
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM audio_dialogue_projects WHERE id = ${reference.projectId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM audio_dialogue_generations WHERE id = ${generationId} FOR UPDATE`;
      const generation = await tx.audioDialogueGeneration.findUniqueOrThrow({ where: { id: generationId } });
      if (generation.leaseOwner !== owner || !generation.leaseUntil || generation.leaseUntil <= new Date() || !activeStatuses.includes(generation.status)) throw new AppException(40901, "配音任务执行权已移交", 409);
      return callback(tx, generation);
    });
  }
  private async checkpoint(id: string, owner: string, plans: DialoguePlan[]) {
    await this.leased(id, owner, tx => tx.audioDialogueGeneration.update({ where: { id }, data: { plans: json(plans) } }));
  }
  async processNext(): Promise<void> {
    const now = new Date();
    if (Date.now() - this.lastCacheCleanup > 60_000) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expired = await this.prisma.$queryRaw<{ id: string; providerPayload: Prisma.JsonValue }[]>`SELECT id, "providerPayload" FROM audio_tasks WHERE "audioDialogueGenerationId" IS NOT NULL AND status = 'FAILED' AND "createdAt" < ${cutoff} AND "providerPayload" ? 'dialogueResult' LIMIT 25`;
      for (const task of expired) await this.prisma.audioTask.updateMany({ where: { id: task.id, status: "FAILED", createdAt: { lt: cutoff } }, data: { providerPayload: json(stripDialogueAudioCache(task.providerPayload)) } });
      this.lastCacheCleanup = Date.now();
    }
    const candidate = await this.prisma.audioDialogueGeneration.findFirst({ where: {
      status: { in: activeStatuses }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
    }, orderBy: { createdAt: "asc" } });
    if (!candidate) return;
    const owner = randomUUID();
    const claimed = await this.prisma.audioDialogueGeneration.updateMany({ where: {
      id: candidate.id, status: candidate.status, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
    }, data: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 90_000), status: candidate.status === "RESERVING" ? "RESERVING" : "RUNNING" } });
    if (claimed.count !== 1) return;
    const heartbeat = setInterval(() => {
      void this.prisma.audioDialogueGeneration.updateMany({ where: { id: candidate.id, leaseOwner: owner, leaseUntil: { gt: new Date() }, status: { in: activeStatuses } }, data: { leaseUntil: new Date(Date.now() + 90_000) } }).catch(error => this.logger.error("多人配音任务续租失败", error));
    }, 20_000);
    heartbeat.unref();
    try {
      let generation = await this.prisma.audioDialogueGeneration.findUniqueOrThrow({ where: { id: candidate.id } });
      if (generation.status === "RESERVING") {
        await this.reserveEnterprise(generation, owner);
        generation = await this.prisma.audioDialogueGeneration.findUniqueOrThrow({ where: { id: candidate.id } });
      }
      if (generation.leaseOwner === owner && generation.status === "RUNNING") await this.run(generation, owner);
    } finally { clearInterval(heartbeat); }
  }
  private async run(generation: Generation, owner: string) {
    const input = validateDialogueInput(generation.input);
    const plans = plansOf(generation.plans);
    const project = await this.prisma.audioDialogueProject.findUniqueOrThrow({ where: { id: generation.projectId } });
    const context = { userId: project.userId, learnerId: project.learnerId, rootScenarioId: project.scenarioId };
    await this.leased(generation.id, owner, tx => tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "PROCESSING" } }));
    for (const plan of plans) {
      if (["REUSED", "SKIPPED", "SUCCEEDED", "FAILED"].includes(plan.status)) continue;
      try {
        let taskId = plan.audioTaskId;
        let payload: Record<string, unknown> | null = null;
        if (taskId) {
          const task = await this.prisma.audioTask.findFirst({ where: { id: taskId, userId: project.userId, learnerId: project.learnerId } });
          const saved = task?.providerPayload as Record<string, unknown> | null;
          payload = saved?.dialogueResult as Record<string, unknown> | null;
          if (!payload) throw new AppException(40901, "上次请求中断且没有可恢复音频，请单独重试该句", 409);
          if (typeof saved?.dialogueActualCredits === "number" && Number.isSafeInteger(saved.dialogueActualCredits)) {
            plan.credits = Math.max(0, Math.min(plan.credits, saved.dialogueActualCredits));
          }
        } else {
          const segment = input.segments.find(s => s.id === plan.id)!;
          const executed = await this.audio.executeDialogueTts(context, plan, { generationId: generation.id, projectId: project.id, text: segment.text }, async id => {
            plan.audioTaskId = id; plan.status = "PROCESSING";
            await this.checkpoint(generation.id, owner, plans);
          });
          taskId = executed.taskId; payload = executed.payload; plan.credits = executed.credits;
        }
        plan.status = "STORING";
        await this.checkpoint(generation.id, owner, plans);
        const requireWav = plan.fingerprint === dialogueAudioFingerprint(input.segments.find(s => s.id === plan.id)!, plan, "wav");
        const persisted = await this.storage.persist({ userId: project.userId, projectId: project.id, generationId: generation.id, segmentId: plan.id, payload: payload!, requireWav });
        await this.leased(generation.id, owner, async tx => {
          const asset = await this.audio.completeDialogueTts(tx, taskId!, persisted);
          const current = await tx.audioDialogueProject.findUniqueOrThrow({ where: { id: project.id } });
          const clips = clipsOf(current.clips);
          clips[plan.id] = { fingerprint: plan.fingerprint, audioAssetId: asset.id, audioTaskId: taskId!, url: asset.url, credits: plan.credits };
          plan.status = "SUCCEEDED"; delete plan.errorMessage;
          await tx.audioDialogueProject.update({ where: { id: project.id }, data: { clips: json(clips) } });
          await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { plans: json(plans) } });
        });
      } catch (error) {
        if (error instanceof AppException && error.message === "配音任务执行权已移交") throw error;
        this.logger.warn(`分句处理失败 ${generation.id}/${plan.id}: ${error instanceof Error ? error.message : "unknown"}`);
        plan.status = "FAILED"; plan.errorMessage = friendlyError(error);
        await this.checkpoint(generation.id, owner, plans);
        if (plan.audioTaskId) await this.audio.failAudioTask(plan.audioTaskId, "DIALOGUE_SEGMENT_FAILED", plan.errorMessage);
      }
    }
    const actualCredits = successfulDialogueCredits(plans);
    if (input.billingContext === "ORGANIZATION" && generation.estimatedCredits > 0) {
      // Enterprise settlement is separately transactional and idempotent; assert lease before calling it.
      await this.leased(generation.id, owner, async () => undefined);
      await this.organizations.settleEnterpriseUsage({ usageRequestId: `audio-dialogue:${generation.id}`, actualPoints: actualCredits,
        featureCode: "audio.tts", resourceType: "audio_dialogue", resourceId: project.id,
        usageQuantity: plans.filter(p => p.status === "SUCCEEDED").reduce((sum, p) => sum + p.billingCharacters, 0), usageUnit: "character" });
    }
    await this.leased(generation.id, owner, async (tx, fresh) => {
      await settleDialogueBilling(tx, generation.billingAudioTaskId!, actualCredits);
      if (fresh.actualCredits === null) await tx.audioDialogueProject.update({ where: { id: project.id }, data: { actualCredits: { increment: actualCredits } } });
      await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { actualCredits, status: "MERGING" } });
    });
    const current = await this.prisma.audioDialogueProject.findUniqueOrThrow({ where: { id: project.id } });
    const clips = clipsOf(current.clips);
    const complete = plans.every(p => clips[p.id]?.fingerprint === p.fingerprint && p.status !== "FAILED");
    if (!complete) {
      await this.leased(generation.id, owner, async tx => {
        const message = plans.some(p => p.status === "FAILED") ? "部分句子生成失败，可单独重试" : "部分句子尚未生成";
        await tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "PARTIAL_FAILED", errorMessage: message } });
        await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { status: "PARTIAL_FAILED", errorMessage: message, leaseOwner: null, leaseUntil: null } });
      });
      return;
    }
    await this.leased(generation.id, owner, tx => tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "MERGING", errorMessage: null } }));
    try {
      const persisted = await this.storage.merge({ userId: project.userId, projectId: project.id, generationId: generation.id,
        segments: input.segments.map(s => ({ url: clips[s.id].url, pauseSeconds: s.pauseSeconds })), format: "wav", sampleRate: input.sampleRate });
      await this.leased(generation.id, owner, async tx => {
        const asset = await tx.audioAsset.create({ data: { userId: project.userId, type: "TTS_OUTPUT", storageProvider: "S3", ...persisted } });
        await tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "SUCCEEDED", outputAudioAssetId: asset.id, outputRevision: generation.revision, errorMessage: null } });
        await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { status: "SUCCEEDED", leaseOwner: null, leaseUntil: null } });
      });
    } catch (error) {
      await this.leased(generation.id, owner, async tx => {
        await tx.audioDialogueProject.update({ where: { id: project.id }, data: { status: "FAILED", errorMessage: "完整音频合并或保存失败，分句已保留，可免费重试合并" } });
        await tx.audioDialogueGeneration.update({ where: { id: generation.id }, data: { status: "FAILED", leaseOwner: null, leaseUntil: null, errorMessage: friendlyError(error) } });
      });
      this.logger.error("多人配音合并失败", error);
    }
  }
}
