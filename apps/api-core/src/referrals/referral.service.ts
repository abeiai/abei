import { Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { referralLifetimeSeconds, referralRewardCredits, referralRules } from "./referral-rules.js";

// Only called inside the transaction that created this new account.
export async function rewardNewReferral(tx: Prisma.TransactionClient, inviteeId: string, token?: string | null) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const tokenHash = referralRules.hashToken(token);
  // Serializes reuse of one browser attribution, including concurrent signups.
  await tx.$queryRaw`SELECT "tokenHash" FROM "referral_visits" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
  const visit = await tx.referralVisit.findUnique({ where: { tokenHash }, include: { reward: true, referrer: { select: { status: true } } } });
  const now = new Date();
  if (!visit || visit.reward || visit.referrerId === inviteeId || visit.referrer.status !== "ACTIVE" || visit.expiresAt <= now || !referralRules.isActive(visit.createdAt, now)) return false;
  if (await tx.referralReward.findUnique({ where: { inviteeId } })) return false;
  const invitee = await tx.user.findUnique({ where: { id: inviteeId }, select: { createdAt: true, status: true } });
  if (!invitee || invitee.status !== "ACTIVE" || invitee.createdAt < visit.createdAt) return false;
  await tx.referralReward.create({ data: { inviteeId, referrerId: visit.referrerId, visitHash: tokenHash, credits: referralRewardCredits } });
  // Consistent wallet locking order avoids deadlocks with other referral grants.
  for (const userId of [inviteeId, visit.referrerId].sort()) {
    const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId, availableCredits: referralRewardCredits }, update: { availableCredits: { increment: referralRewardCredits } } });
    await tx.ledgerEntry.create({ data: {
      userId, type: "ADMIN_ADJUST", amount: referralRewardCredits, balanceAfter: wallet.availableCredits,
      idempotencyKey: `referral:${inviteeId}:${userId}`,
      note: userId === inviteeId ? "通过推荐注册奖励：500点" : "推荐新用户注册奖励：500点"
    } });
  }
  return true;
}

@Injectable()
export class ReferralService {
  private readonly prisma = getPrismaClient();

  async records(where: Prisma.ReferralRewardWhereInput, requestedPage: number) {
    const pageSize = 20;
    const userSelect = { id: true, nickname: true, email: true, referralHandles: { where: { status: "ACTIVE" }, select: { handle: true, kind: true } } } as const;
    return this.prisma.$transaction(async tx => {
      const total = await tx.referralReward.count({ where });
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
      const items = await tx.referralReward.findMany({
        where, orderBy: [{ createdAt: "desc" }, { inviteeId: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        select: { inviteeId: true, credits: true, createdAt: true, referrer: { select: userSelect }, invitee: { select: { id: true, nickname: true, email: true, createdAt: true } } }
      });
      return { items, total, page, pageSize };
    }, { isolationLevel: "RepeatableRead" });
  }

  async publicProfile(handle: string) {
    if (!/^[a-z0-9]{4,32}$/.test(handle)) throw new AppException(40401, "个人主页不存在", 404);
    const row = await this.prisma.referralHandle.findUnique({ where: { handle }, include: { user: { select: { id: true, nickname: true, avatarUrl: true, status: true, referralHandles: { where: { status: "ACTIVE" }, select: { handle: true, kind: true } } } } } });
    if (!row || row.status !== "ACTIVE" || row.user.status !== "ACTIVE") throw new AppException(40401, "个人主页不存在", 404);
    const canonicalHandle = row.user.referralHandles.find(item => item.kind === "ALIAS")?.handle ?? handle;
    // Email-derived default nicknames are never synthesized here from private fields.
    return { id: row.user.id, nickname: row.user.nickname, avatarUrl: row.user.avatarUrl, handle, canonicalHandle };
  }

  async capture(handle: string, existingToken?: string | null) {
    const profile = await this.publicProfile(handle);
    if (existingToken && /^[a-f0-9]{64}$/.test(existingToken)) {
      const existing = await this.prisma.referralVisit.findUnique({ where: { tokenHash: referralRules.hashToken(existingToken) } });
      if (existing && existing.expiresAt > new Date()) return { token: existingToken, expiresAt: existing.expiresAt.toISOString() };
    }
    const token = referralRules.newToken();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + referralLifetimeSeconds * 1000);
    await this.prisma.referralVisit.create({ data: { tokenHash: referralRules.hashToken(token), referrerId: profile.id, createdAt, expiresAt } });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async me(userId: string) {
    const [handles, count, rewards] = await Promise.all([
      this.prisma.referralHandle.findMany({ where: { userId }, select: { handle: true, kind: true, status: true } }),
      this.prisma.referralReward.count({ where: { referrerId: userId } }),
      this.prisma.referralReward.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" }, take: 20, select: { credits: true, createdAt: true } })
    ]);
    return { handles, invitedCount: count, rewardCredits: count * referralRewardCredits, rewards };
  }

  async bindAlias(userId: string, input: unknown) {
    const handle = referralRules.normalizeAlias(input);
    try {
      return await this.prisma.referralHandle.create({ data: { userId, handle, kind: "ALIAS", status: "ACTIVE" }, select: { handle: true } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const existing = await this.prisma.referralHandle.findUnique({ where: { userId_kind: { userId, kind: "ALIAS" } } });
        throw new AppException(40001, existing ? "你已绑定专属名称，不能再次修改" : "该名称已被使用，请更换名称", 400);
      }
      throw error;
    }
  }
}
