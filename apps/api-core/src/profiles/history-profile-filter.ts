import { HttpStatus } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import type { ProfileSubject } from "./profile-context.types.js";

type PrismaClient = ReturnType<typeof getPrismaClient>;

export type HistoryProfileWhere = {
  userId: string;
  learnerId?: string | null;
};

function invalidHistoryProfile(): never {
  throw new AppException(40001, "学习者筛选无效", HttpStatus.BAD_REQUEST);
}

export async function resolveHistoryProfileWhere(
  prisma: Pick<PrismaClient, "learner">,
  subject: ProfileSubject,
  profile: unknown
): Promise<HistoryProfileWhere> {
  if (subject.mode === "LEARNER") {
    if (profile !== undefined) invalidHistoryProfile();
    return { userId: subject.userId, learnerId: subject.learnerId };
  }

  if (profile === undefined || profile === "all") {
    return { userId: subject.userId };
  }
  if (typeof profile !== "string" || !profile || profile.trim() !== profile) {
    invalidHistoryProfile();
  }
  if (profile === "account") {
    return { userId: subject.userId, learnerId: null };
  }
  if (!profile.startsWith("learner:")) {
    invalidHistoryProfile();
  }

  const learnerId = profile.slice("learner:".length);
  if (!learnerId || learnerId.includes(":")) {
    invalidHistoryProfile();
  }
  const learner = await prisma.learner.findFirst({
    where: { id: learnerId, userId: subject.userId },
    select: { id: true }
  });
  if (!learner) invalidHistoryProfile();

  return { userId: subject.userId, learnerId };
}
