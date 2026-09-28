import type { Prisma } from "@xueleai/database";
import { reservePersonalCredits, settlePersonalCredits } from "../wallet/personal-credits.js";
import { AppException } from "../common/app-exception.js";

export async function reserveDialogueBilling(tx: Prisma.TransactionClient, input: {
  userId: string; learnerId: string | null; scenarioId: string | null;
  projectId: string; credits: number; billingContext: "PERSONAL" | "ORGANIZATION"; organizationId?: string;
}) {
  const task = await tx.audioTask.create({ data: {
    userId: input.userId, learnerId: input.learnerId, scenarioId: input.scenarioId,
    billingContext: input.billingContext, organizationId: input.organizationId,
    type: "TTS", provider: "dialogue_audio", model: "multi-speaker", status: "CREATED",
    estimatedCredits: input.credits,
    providerPayload: { source: "EXPERIENCE", dialogueProjectId: input.projectId, billing: "DIALOGUE_AGGREGATE" }
  } });
  if (input.billingContext === "PERSONAL") {
    const wallet = await reservePersonalCredits(tx, input.userId, `audio-task:${task.id}`, input.credits);
    await tx.creditReservation.create({ data: {
      userId: input.userId, audioTaskId: task.id, amount: input.credits, status: "RESERVED",
      idempotencyKey: `audio-task:${task.id}:reserve`, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    } });
    await tx.ledgerEntry.create({ data: {
      userId: input.userId, type: "RESERVE", amount: -input.credits, balanceAfter: wallet.availableCredits,
      relatedAudioTaskId: task.id, relatedTaskType: "AUDIO_DIALOGUE", operationType: "TTS",
      idempotencyKey: `audio-task:${task.id}:ledger-reserve`, note: `多人配音冻结 ${input.credits} 点`
    } });
  }
  return task;
}

export async function settleDialogueBilling(tx: Prisma.TransactionClient, taskId: string, requestedCredits: number) {
  await tx.$queryRaw`SELECT id FROM audio_tasks WHERE id = ${taskId} FOR UPDATE`;
  const task = await tx.audioTask.findUniqueOrThrow({ where: { id: taskId }, include: { reservation: true } });
  if (task.actualCredits !== null) return task.actualCredits;
  if (!Number.isSafeInteger(requestedCredits) || requestedCredits < 0 || requestedCredits > task.estimatedCredits) {
    throw new AppException(40901, "实际点数不能超过已确认费用", 409);
  }
  if (task.billingContext === "PERSONAL") {
    if (!task.reservation || task.reservation.status !== "RESERVED") throw new AppException(40901, "多人配音冻结记录已失效", 409);
    const wallet = await settlePersonalCredits(tx, task.userId, `audio-task:${task.id}`, task.reservation.amount, requestedCredits);
    await tx.creditReservation.update({ where: { id: task.reservation.id }, data: { status: requestedCredits > 0 ? "SETTLED" : "RELEASED" } });
    if (requestedCredits > 0) await tx.ledgerEntry.create({ data: {
      userId: task.userId, type: "CONSUME", amount: -requestedCredits, balanceAfter: wallet.availableCredits,
      relatedAudioTaskId: task.id, relatedTaskType: "AUDIO_DIALOGUE", operationType: "TTS",
      idempotencyKey: `audio-task:${task.id}:consume`, note: `多人配音成功分句消耗 ${requestedCredits} 点`
    } });
    const release = task.estimatedCredits - requestedCredits;
    if (release > 0) await tx.ledgerEntry.create({ data: {
      userId: task.userId, type: "RELEASE", amount: release, balanceAfter: wallet.availableCredits,
      relatedAudioTaskId: task.id, relatedTaskType: "AUDIO_DIALOGUE", operationType: "TTS",
      idempotencyKey: `audio-task:${task.id}:release`, note: `多人配音释放 ${release} 点`
    } });
  }
  await tx.audioTask.update({ where: { id: task.id }, data: {
    actualCredits: requestedCredits, status: "SUCCEEDED", finishedAt: new Date()
  } });
  return requestedCredits;
}
