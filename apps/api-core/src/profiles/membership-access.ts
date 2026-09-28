import { HttpStatus } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@xueleai/database';
import { AppException } from '../common/app-exception.js';

type MembershipPrisma = PrismaClient | Prisma.TransactionClient;

export function currentMembership(prisma: MembershipPrisma, userId: string, now = new Date()) {
  return prisma.membershipPeriod.findFirst({
    where: { userId, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ rank: 'desc' }, { endsAt: 'desc' }]
  });
}

export async function assertMembershipScenarioAccess(prisma: MembershipPrisma, userId: string, scenario: {
  minimumMembershipRank: number;
  membershipEarlyAccessUntil: Date | null;
}, now = new Date()) {
  if (!scenario.minimumMembershipRank || (scenario.membershipEarlyAccessUntil && scenario.membershipEarlyAccessUntil <= now)) return;
  const membership = await currentMembership(prisma, userId, now);
  if (!membership || membership.rank < scenario.minimumMembershipRank) {
    throw new AppException(40301, '当前会员等级暂不能使用此应用', HttpStatus.FORBIDDEN);
  }
}

export async function hasMembershipResourceAccess(prisma: MembershipPrisma, userId: string, now = new Date()) {
  return Boolean(await currentMembership(prisma, userId, now));
}

// Caller holds the user's row lock throughout this check and learner insertion/restoration.
export async function assertLearnerCapacity(prisma: MembershipPrisma, userId: string) {
  const membership = await currentMembership(prisma, userId);
  const config = membership ? null : await prisma.systemConfig.findUnique({ where: { key: 'membership.freeLearnerLimit' } });
  const configuredLimit = Number(config?.value ?? 1);
  const limit = membership?.learnerLimit ?? (Number.isSafeInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 1);
  const active = await prisma.learner.count({ where: { userId, status: 'ACTIVE' } });
  if (active >= limit) throw new AppException(40301, '当前可开通的学习者数量已达上限，请升级会员', HttpStatus.FORBIDDEN);
}
