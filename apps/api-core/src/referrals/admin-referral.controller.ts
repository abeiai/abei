import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Prisma } from "@xueleai/database";
import { AdminAuthService } from "../admin-auth/admin-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { successResponse } from "../common/api-response.js";
import { ReferralService } from "./referral.service.js";

export interface ReferralRecordFilters { q?: string; referrerId?: string; page?: string }
export function referralRecordQuery(input: ReferralRecordFilters) {
  if ([input.q, input.referrerId, input.page].some(value => value !== undefined && typeof value !== "string")) throw new AppException(40001, "筛选参数不正确", 400);
  const q = input.q?.trim() ?? "";
  const referrerId = input.referrerId?.trim() ?? "";
  if (q.length > 100 || referrerId.length > 100) throw new AppException(40001, "筛选内容不能超过100个字符", 400);
  const rawPage = Number(input.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
  const where: Prisma.ReferralRewardWhereInput = {};
  if (referrerId) where.referrerId = referrerId;
  if (q) where.referrer = { OR: [
    { nickname: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    { referralHandles: { some: { handle: { equals: q.toLowerCase() } } } }
  ] };
  return { where, page };
}

@Controller("admin/referrals")
export class AdminReferralController {
  constructor(@Inject(AdminAuthService) private readonly auth: AdminAuthService, @Inject(ReferralService) private readonly service: ReferralService) {}
  @Get()
  async records(@Req() request: unknown, @Query() filters: ReferralRecordFilters) {
    await this.auth.me(request as never);
    const query = referralRecordQuery(filters);
    return successResponse(await this.service.records(query.where, query.page));
  }
}
