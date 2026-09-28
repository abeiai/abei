import { randomUUID } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import {
  AddOrganizationMemberDto,
  AdjustMemberQuotaDto,
  AdjustOrganizationCreditsDto,
  AdminCreateOrganizationDto,
  AdminUpdateOrganizationDto,
  AllocateMemberQuotaDto,
  CreateOrganizationDto,
  UpdateOrganizationMemberDto
} from "./dto/organization.dto.js";

type OrganizationRole = "OWNER" | "ADMIN" | "FINANCE_ADMIN" | "MEMBER";
type OrganizationMemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

interface ReserveEnterpriseUsageInput {
  userId: string;
  orgId: string;
  points: number;
  featureCode: string;
  usageRequestId: string;
  resourceType?: string;
  resourceId?: string;
  expiresAt?: Date;
}

interface SettleEnterpriseUsageInput {
  usageRequestId: string;
  actualPoints: number;
  featureCode?: string;
  resourceType?: string;
  resourceId?: string;
  usageQuantity?: number;
  usageUnit?: string;
  unitPrice?: number;
  pricingVersion?: string;
}

interface ReleaseEnterpriseUsageInput {
  usageRequestId: string;
  reason?: string;
}

const managerRoles = new Set<OrganizationRole>(["OWNER", "ADMIN"]);

@Injectable()
export class OrganizationsService {
  private readonly prisma = getPrismaClient();

  async isEnterpriseEnabled() {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: "enterpriseAccountEnabled"
      }
    });

    return config?.value === "true";
  }

  async listForUser(userId: string) {
    if (!(await this.isEnterpriseEnabled())) {
      return {
        enabled: false,
        organizations: []
      };
    }

    const members = await this.prisma.organizationMember.findMany({
      where: {
        userId
      },
      include: {
        organization: {
          include: {
            wallet: true,
            _count: {
              select: {
                members: true
              }
            }
          }
        },
        quotas: {
          where: {
            status: "ACTIVE"
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        joinedAt: "asc"
      }
    });

    return {
      enabled: true,
      organizations: members.map((member) => this.toUserOrganization(member))
    };
  }

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    await this.requireEnterpriseEnabled();

    const name = dto.name.trim();
    const organization = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.organization.create({
        data: {
          name,
          legalName: cleanOptional(dto.legalName),
          type: cleanOptional(dto.type) || "企业",
          industry: cleanOptional(dto.industry),
          employeeSize: cleanOptional(dto.employeeSize),
          ownerUserId: userId,
          settings: {
            create: {}
          },
          wallet: {
            create: {}
          },
          members: {
            create: {
              userId,
              role: "OWNER",
              status: "ACTIVE"
            }
          }
        },
        include: organizationDetailInclude()
      });

      return created;
    });

    return this.toOrganizationDetail(organization);
  }

  async getOrganizationForUser(userId: string, orgId: string) {
    await this.requireEnterpriseEnabled();
    await this.requireActiveMember(userId, orgId);

    const organization = await this.prisma.organization.findUnique({
      where: {
        id: orgId
      },
      include: organizationDetailInclude()
    });

    if (!organization) {
      throw new AppException(40401, "企业不存在", HttpStatus.NOT_FOUND);
    }

    return this.toOrganizationDetail(organization);
  }

  async searchUsers(userId: string, query: string) {
    await this.requireEnterpriseEnabled();
    const keyword = query.trim();

    if (keyword.length < 2) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          {
            id: keyword
          },
          {
            email: {
              contains: keyword,
              mode: "insensitive"
            }
          },
          {
            phone: {
              contains: keyword
            }
          },
          {
            nickname: {
              contains: keyword,
              mode: "insensitive"
            }
          }
        ]
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      isCurrentUser: user.id === userId
    }));
  }

  async addMember(userId: string, orgId: string, dto: AddOrganizationMemberDto) {
    await this.requireEnterpriseEnabled();
    const actor = await this.requireManager(userId, orgId);
    const user = await this.resolveMemberUser(dto);

    if (!user) {
      throw new AppException(40401, "未找到可加入组织的已注册用户", HttpStatus.NOT_FOUND);
    }

    if (user.id === actor.userId) {
      throw new AppException(40001, "不能重复添加自己", HttpStatus.BAD_REQUEST);
    }

    const member = await this.prisma.organizationMember.upsert({
      where: {
        orgId_userId: {
          orgId,
          userId: user.id
        }
      },
      update: {
        role: dto.role ?? "MEMBER",
        status: "ACTIVE",
        title: cleanOptional(dto.title),
        removedAt: null,
        removedById: null
      },
      create: {
        orgId,
        userId: user.id,
        role: dto.role ?? "MEMBER",
        status: "ACTIVE",
        title: cleanOptional(dto.title),
        invitedById: actor.id
      },
      include: memberInclude()
    });

    return this.toMember(member);
  }

  async adjustMemberQuota(userId: string, orgId: string, memberId: string, dto: AdjustMemberQuotaDto) {
    await this.requireEnterpriseEnabled();
    const actor = await this.requireManager(userId, orgId);
    const amount = Math.trunc(dto.amount);

    if (!amount) {
      throw new AppException(40001, "调整点数不能为 0", HttpStatus.BAD_REQUEST);
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        orgId,
        status: {
          not: "REMOVED"
        }
      }
    });

    if (!member) {
      throw new AppException(40401, "组织成员不存在", HttpStatus.NOT_FOUND);
    }

    return this.prisma.$transaction(async (transaction) => {
      if (amount > 0) {
        const created = await transaction.organizationMemberQuota.create({
          data: {
            orgId,
            memberId,
            quotaType: "ONE_TIME",
            totalQuota: amount,
            createdById: actor.id
          }
        });

        await transaction.organizationQuotaLedger.create({
          data: {
            orgId,
            memberId,
            quotaAccountId: created.id,
            direction: "GRANT",
            pointsDelta: amount,
            quotaAfter: amount,
            sourceType: "manual_adjust",
            operatorId: actor.id,
            idempotencyKey: `org-quota:${created.id}:adjust-grant:${randomUUID()}`,
            remark: cleanOptional(dto.remark) ?? "组织管理员增加成员点数"
          }
        });

        return this.toQuota(created);
      }

      let remaining = Math.abs(amount);
      const quotas = await transaction.organizationMemberQuota.findMany({
        where: {
          orgId,
          memberId,
          status: "ACTIVE"
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      for (const quota of quotas) {
        if (remaining <= 0) {
          break;
        }

        const available = quota.totalQuota - quota.usedQuota - quota.reservedQuota;

        if (available <= 0) {
          continue;
        }

        const decrement = Math.min(remaining, available);
        const updated = await transaction.organizationMemberQuota.update({
          where: {
            id: quota.id
          },
          data: {
            totalQuota: {
              decrement
            },
            status: available - decrement <= 0 && quota.usedQuota === 0 && quota.reservedQuota === 0 ? "REVOKED" : "ACTIVE"
          }
        });

        await transaction.organizationQuotaLedger.create({
          data: {
            orgId,
            memberId,
            quotaAccountId: quota.id,
            direction: "REVOKE",
            pointsDelta: -decrement,
            quotaAfter: updated.totalQuota - updated.usedQuota - updated.reservedQuota,
            sourceType: "manual_adjust",
            operatorId: actor.id,
            idempotencyKey: `org-quota:${quota.id}:adjust-revoke:${randomUUID()}`,
            remark: cleanOptional(dto.remark) ?? "组织管理员扣减成员点数"
          }
        });

        remaining -= decrement;
      }

      if (remaining > 0) {
        throw new AppException(40004, "成员可扣减点数不足", HttpStatus.BAD_REQUEST);
      }

      const latest = await transaction.organizationMemberQuota.findFirst({
        where: {
          orgId,
          memberId,
          status: "ACTIVE"
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      return latest ? this.toQuota(latest) : null;
    });
  }

  async updateMember(userId: string, orgId: string, memberId: string, dto: UpdateOrganizationMemberDto) {
    await this.requireEnterpriseEnabled();
    const actor = await this.requireManager(userId, orgId);
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        orgId
      }
    });

    if (!member) {
      throw new AppException(40401, "企业成员不存在", HttpStatus.NOT_FOUND);
    }

    if (member.role === "OWNER" && dto.role && dto.role !== "OWNER") {
      throw new AppException(40001, "暂不支持转移或降级企业所有者", HttpStatus.BAD_REQUEST);
    }

    if (member.role === "OWNER" && dto.status && dto.status !== "ACTIVE") {
      throw new AppException(40001, "不能停用或移除企业所有者", HttpStatus.BAD_REQUEST);
    }

    const updated = await this.prisma.organizationMember.update({
      where: {
        id: memberId
      },
      data: {
        role: dto.role,
        status: dto.status,
        title: dto.title === undefined ? undefined : cleanOptional(dto.title),
        removedAt: dto.status === "REMOVED" ? new Date() : undefined,
        removedById: dto.status === "REMOVED" ? actor.id : undefined
      },
      include: memberInclude()
    });

    return this.toMember(updated);
  }

  async allocateQuota(userId: string, orgId: string, memberId: string, dto: AllocateMemberQuotaDto) {
    await this.requireEnterpriseEnabled();
    const actor = await this.requireManager(userId, orgId);
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        orgId,
        status: "ACTIVE"
      }
    });

    if (!member) {
      throw new AppException(40401, "可分配额度的企业成员不存在", HttpStatus.NOT_FOUND);
    }

    const quota = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.organizationMemberQuota.create({
        data: {
          orgId,
          memberId,
          quotaType: dto.quotaType ?? "ONE_TIME",
          totalQuota: dto.totalQuota,
          createdById: actor.id
        }
      });

      await transaction.organizationQuotaLedger.create({
        data: {
          orgId,
          memberId,
          quotaAccountId: created.id,
          direction: "GRANT",
          pointsDelta: dto.totalQuota,
          quotaAfter: dto.totalQuota,
          sourceType: "manual_allocate",
          operatorId: actor.id,
          idempotencyKey: `org-quota:${created.id}:grant`,
          remark: cleanOptional(dto.remark) ?? "企业管理员分配额度"
        }
      });

      return created;
    });

    return this.toQuota(quota);
  }

  async listAdminOrganizations() {
    const organizations = await this.prisma.organization.findMany({
      include: organizationListInclude(),
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      enabled: await this.isEnterpriseEnabled(),
      organizations: organizations.map((organization) => this.toAdminOrganization(organization))
    };
  }

  async getAdminOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id
      },
      include: organizationDetailInclude()
    });

    if (!organization) {
      throw new AppException(40401, "企业不存在", HttpStatus.NOT_FOUND);
    }

    return this.toOrganizationDetail(organization);
  }

  async createAdminOrganization(dto: AdminCreateOrganizationDto) {
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();
    const owner = await this.prisma.user.findUnique({
      where: {
        email: ownerEmail
      }
    });

    if (!owner) {
      throw new AppException(40401, "所有者用户不存在，请先创建前台用户", HttpStatus.NOT_FOUND);
    }

    const organization = await this.prisma.$transaction(async (transaction) =>
      transaction.organization.create({
        data: {
          name: dto.name.trim(),
          legalName: cleanOptional(dto.legalName),
          type: cleanOptional(dto.type) || "企业",
          status: dto.status ?? "ACTIVE",
          industry: cleanOptional(dto.industry),
          employeeSize: cleanOptional(dto.employeeSize),
          ownerUserId: owner.id,
          settings: {
            create: {}
          },
          wallet: {
            create: {}
          },
          members: {
            create: {
              userId: owner.id,
              role: "OWNER",
              status: "ACTIVE"
            }
          }
        },
        include: organizationDetailInclude()
      })
    );

    return this.toOrganizationDetail(organization);
  }

  async updateAdminOrganization(id: string, dto: AdminUpdateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: {
        id
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      throw new AppException(40401, "企业不存在", HttpStatus.NOT_FOUND);
    }

    const organization = await this.prisma.organization.update({
      where: {
        id
      },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        legalName: dto.legalName === undefined ? undefined : cleanOptional(dto.legalName),
        type: dto.type === undefined ? undefined : cleanOptional(dto.type) || "企业",
        industry: dto.industry === undefined ? undefined : cleanOptional(dto.industry),
        employeeSize: dto.employeeSize === undefined ? undefined : cleanOptional(dto.employeeSize),
        status: dto.status
      },
      include: organizationDetailInclude()
    });

    return this.toOrganizationDetail(organization);
  }

  async adjustOrganizationCredits(adminUserId: string, orgId: string, dto: AdjustOrganizationCreditsDto) {
    const amount = dto.amount;

    if (!Number.isInteger(amount) || amount === 0) {
      throw new AppException(40001, "调整点数不能为 0", HttpStatus.BAD_REQUEST);
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const wallet = await this.ensureOrganizationWallet(transaction, orgId);

      if (amount > 0) {
        const updatedWallet = await transaction.organizationWallet.update({
          where: {
            id: wallet.id
          },
          data: {
            balanceTotal: {
              increment: amount
            },
            balanceAvailable: {
              increment: amount
            },
            totalGranted: {
              increment: amount
            }
          }
        });

        const lot = await transaction.organizationPointLot.create({
          data: {
            orgId,
            walletId: wallet.id,
            sourceType: "admin_adjust",
            sourceId: adminUserId,
            initialPoints: amount,
            remainingPoints: amount
          }
        });

        const ledger = await transaction.organizationWalletLedger.create({
          data: {
            orgId,
            walletId: wallet.id,
            lotId: lot.id,
            direction: "CREDIT",
            transactionType: dto.transactionType ?? "GIFT",
            pointsDelta: amount,
            balanceAfter: updatedWallet.balanceAvailable,
            sourceType: "admin_adjust",
            sourceId: adminUserId,
            operatorType: "admin",
            operatorId: adminUserId,
            idempotencyKey: `org-wallet:${orgId}:admin-credit:${Date.now()}:${randomUUID()}`,
            remark: dto.reason.trim()
          }
        });

        return {
          wallet: updatedWallet,
          ledger
        };
      }

      const debit = Math.abs(amount);
      const changed = await transaction.organizationWallet.updateMany({
        where: {
          id: wallet.id,
          balanceAvailable: {
            gte: debit
          }
        },
        data: {
          balanceTotal: {
            decrement: debit
          },
          balanceAvailable: {
            decrement: debit
          }
        }
      });

      if (changed.count === 0) {
        throw new AppException(40004, "企业可用点数不足，不能扣减", HttpStatus.BAD_REQUEST);
      }

      await this.consumePointLots(transaction, orgId, debit);
      const updatedWallet = await transaction.organizationWallet.findUniqueOrThrow({
        where: {
          id: wallet.id
        }
      });
      const ledger = await transaction.organizationWalletLedger.create({
        data: {
          orgId,
          walletId: wallet.id,
          direction: "DEBIT",
          transactionType: "ADJUST",
          pointsDelta: -debit,
          balanceAfter: updatedWallet.balanceAvailable,
          sourceType: "admin_adjust",
          sourceId: adminUserId,
          operatorType: "admin",
          operatorId: adminUserId,
          idempotencyKey: `org-wallet:${orgId}:admin-debit:${Date.now()}:${randomUUID()}`,
          remark: dto.reason.trim()
        }
      });

      return {
        wallet: updatedWallet,
        ledger
      };
    });

    return {
      wallet: this.toWallet(result.wallet),
      ledger: result.ledger
    };
  }

  async reserveEnterpriseUsage(input: ReserveEnterpriseUsageInput) {
    await this.requireEnterpriseEnabled();
    const points = Math.max(0, Math.ceil(input.points));

    if (points <= 0) {
      throw new AppException(40001, "企业扣点数必须大于 0", HttpStatus.BAD_REQUEST);
    }

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organizationWalletReservation.findUnique({
        where: {
          usageRequestId: input.usageRequestId
        }
      });

      if (existing) {
        return existing;
      }

      const member = await this.requireActiveMemberInTransaction(transaction, input.userId, input.orgId);
      const organization = await transaction.organization.findUnique({
        where: {
          id: input.orgId
        }
      });

      if (!organization || organization.status !== "ACTIVE") {
        throw new AppException(40004, "企业状态不可用", HttpStatus.BAD_REQUEST);
      }

      const wallet = await this.ensureOrganizationWallet(transaction, input.orgId);

      if (wallet.status !== "ACTIVE") {
        throw new AppException(40004, "企业钱包不可用", HttpStatus.BAD_REQUEST);
      }

      const quota = await this.findUsableQuota(transaction, input.orgId, member.id, points);
      const quotaChanged = await transaction.organizationMemberQuota.updateMany({
        where: {
          id: quota.id,
          status: "ACTIVE",
          totalQuota: {
            gte: quota.usedQuota + quota.reservedQuota + points
          }
        },
        data: {
          reservedQuota: {
            increment: points
          }
        }
      });

      if (quotaChanged.count === 0) {
        throw new AppException(40004, "企业成员额度不足", HttpStatus.BAD_REQUEST);
      }

      const walletChanged = await transaction.organizationWallet.updateMany({
        where: {
          id: wallet.id,
          status: "ACTIVE",
          balanceAvailable: {
            gte: points
          }
        },
        data: {
          balanceAvailable: {
            decrement: points
          },
          balanceReserved: {
            increment: points
          }
        }
      });

      if (walletChanged.count === 0) {
        throw new AppException(40004, "企业点数余额不足，请联系企业管理员充值", HttpStatus.BAD_REQUEST);
      }

      const reservation = await transaction.organizationWalletReservation.create({
        data: {
          orgId: input.orgId,
          walletId: wallet.id,
          memberId: member.id,
          usageRequestId: input.usageRequestId,
          reservedPoints: points,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000)
        }
      });

      await transaction.organizationQuotaLedger.create({
        data: {
          orgId: input.orgId,
          memberId: member.id,
          quotaAccountId: quota.id,
          direction: "RESERVE",
          pointsDelta: -points,
          quotaAfter: quota.totalQuota - quota.usedQuota - quota.reservedQuota - points,
          sourceType: input.resourceType ?? "usage",
          sourceId: input.resourceId ?? input.usageRequestId,
          idempotencyKey: `org-quota:${quota.id}:reserve:${input.usageRequestId}`,
          remark: `${input.featureCode} 预占 ${points} 点`
        }
      });

      return reservation;
    });
  }

  async settleEnterpriseUsage(input: SettleEnterpriseUsageInput) {
    const actualPoints = Math.max(0, Math.ceil(input.actualPoints));

    return this.prisma.$transaction(async (transaction) => {
      const reservation = await transaction.organizationWalletReservation.findUnique({
        where: {
          usageRequestId: input.usageRequestId
        },
        include: {
          member: true,
          wallet: true
        }
      });

      if (!reservation) {
        throw new AppException(40401, "企业预占记录不存在", HttpStatus.NOT_FOUND);
      }

      if (reservation.status === "SETTLED") {
        const usageEvent = await transaction.organizationUsageEvent.findFirst({
          where: {
            reservationId: reservation.id
          }
        });

        return usageEvent;
      }

      const settledPoints = actualPoints;
      const releasePoints = Math.max(0, reservation.reservedPoints - settledPoints);
      const extraPoints = Math.max(0, settledPoints - reservation.reservedPoints);
      const quota = await transaction.organizationMemberQuota.findFirst({
        where: {
          orgId: reservation.orgId,
          memberId: reservation.memberId,
          status: "ACTIVE",
          reservedQuota: {
            gte: reservation.reservedPoints
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (!quota) {
        throw new AppException(40004, "企业额度预占状态异常", HttpStatus.BAD_REQUEST);
      }

      const quotaChanged = await transaction.organizationMemberQuota.updateMany({
        where: {
          id: quota.id,
          status: "ACTIVE",
          totalQuota: {
            gte: quota.usedQuota + quota.reservedQuota + extraPoints
          }
        },
        data: {
          reservedQuota: {
            decrement: reservation.reservedPoints
          },
          usedQuota: {
            increment: settledPoints
          }
        }
      });

      if (quotaChanged.count === 0) {
        throw new AppException(40004, "企业成员额度不足，无法按实际用量结算", HttpStatus.BAD_REQUEST);
      }

      const walletChanged = await transaction.organizationWallet.updateMany({
        where: {
          id: reservation.walletId,
          status: "ACTIVE",
          balanceAvailable: {
            gte: extraPoints
          }
        },
        data: {
          balanceReserved: {
            decrement: reservation.reservedPoints
          },
          balanceAvailable: {
            increment: releasePoints - extraPoints
          },
          balanceTotal: {
            decrement: settledPoints
          },
          totalConsumed: {
            increment: settledPoints
          }
        }
      });

      if (walletChanged.count === 0) {
        throw new AppException(40004, "企业点数余额不足，无法按实际用量结算", HttpStatus.BAD_REQUEST);
      }

      if (settledPoints > 0) {
        await this.consumePointLots(transaction, reservation.orgId, settledPoints);
      }

      const wallet = await transaction.organizationWallet.findUniqueOrThrow({
        where: {
          id: reservation.walletId
        }
      });
      const walletLedger = await transaction.organizationWalletLedger.create({
        data: {
          orgId: reservation.orgId,
          walletId: reservation.walletId,
          direction: "DEBIT",
          transactionType: "CONSUME",
          pointsDelta: -settledPoints,
          balanceAfter: wallet.balanceAvailable,
          sourceType: "usage",
          sourceId: input.usageRequestId,
          idempotencyKey: `org-wallet:${reservation.walletId}:consume:${input.usageRequestId}`,
          remark: `企业成员消耗 ${settledPoints} 点`
        }
      });

      const quotaLedger = await transaction.organizationQuotaLedger.create({
        data: {
          orgId: reservation.orgId,
          memberId: reservation.memberId,
          quotaAccountId: quota.id,
          direction: "CONSUME",
          pointsDelta: -settledPoints,
          quotaAfter: quota.totalQuota - quota.usedQuota - quota.reservedQuota + reservation.reservedPoints - settledPoints,
          sourceType: "usage",
          sourceId: input.usageRequestId,
          idempotencyKey: `org-quota:${quota.id}:consume:${input.usageRequestId}`,
          remark: `企业成员消耗 ${settledPoints} 点`
        }
      });

      await transaction.organizationWalletReservation.update({
        where: {
          id: reservation.id
        },
        data: {
          settledPoints,
          status: "SETTLED",
          settledAt: new Date()
        }
      });

      return transaction.organizationUsageEvent.create({
        data: {
          orgId: reservation.orgId,
          userId: reservation.member.userId,
          memberId: reservation.memberId,
          quotaAccountId: quota.id,
          featureCode: input.featureCode ?? "usage",
          resourceType: input.resourceType ?? "reservation",
          resourceId: input.resourceId ?? input.usageRequestId,
          usageQuantity: input.usageQuantity ?? 1,
          usageUnit: input.usageUnit,
          unitPrice: input.unitPrice ?? 0,
          pointsCharged: settledPoints,
          pricingVersion: input.pricingVersion,
          walletLedgerId: walletLedger.id,
          quotaLedgerId: quotaLedger.id,
          reservationId: reservation.id,
          idempotencyKey: `org-usage:${input.usageRequestId}`
        }
      });
    });
  }

  async releaseEnterpriseUsage(input: ReleaseEnterpriseUsageInput) {
    return this.prisma.$transaction(async (transaction) => {
      const reservation = await transaction.organizationWalletReservation.findUnique({
        where: {
          usageRequestId: input.usageRequestId
        }
      });

      if (!reservation) {
        throw new AppException(40401, "企业预占记录不存在", HttpStatus.NOT_FOUND);
      }

      if (reservation.status !== "RESERVED") {
        return reservation;
      }

      const quota = await transaction.organizationMemberQuota.findFirst({
        where: {
          orgId: reservation.orgId,
          memberId: reservation.memberId,
          status: "ACTIVE",
          reservedQuota: {
            gte: reservation.reservedPoints
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (quota) {
        const updatedQuota = await transaction.organizationMemberQuota.update({
          where: {
            id: quota.id
          },
          data: {
            reservedQuota: {
              decrement: reservation.reservedPoints
            }
          }
        });

        await transaction.organizationQuotaLedger.create({
          data: {
            orgId: reservation.orgId,
            memberId: reservation.memberId,
            quotaAccountId: quota.id,
            direction: "RELEASE",
            pointsDelta: reservation.reservedPoints,
            quotaAfter: updatedQuota.totalQuota - updatedQuota.usedQuota - updatedQuota.reservedQuota,
            sourceType: "usage",
            sourceId: input.usageRequestId,
            idempotencyKey: `org-quota:${quota.id}:release:${input.usageRequestId}`,
            remark: input.reason ?? `释放企业额度预占 ${reservation.reservedPoints} 点`
          }
        });
      }

      const updatedWallet = await transaction.organizationWallet.update({
        where: {
          id: reservation.walletId
        },
        data: {
          balanceAvailable: {
            increment: reservation.reservedPoints
          },
          balanceReserved: {
            decrement: reservation.reservedPoints
          }
        }
      });

      await transaction.organizationWalletLedger.create({
        data: {
          orgId: reservation.orgId,
          walletId: reservation.walletId,
          direction: "RELEASE",
          transactionType: "ADJUST",
          pointsDelta: reservation.reservedPoints,
          balanceAfter: updatedWallet.balanceAvailable,
          sourceType: "usage",
          sourceId: input.usageRequestId,
          idempotencyKey: `org-wallet:${reservation.walletId}:release:${input.usageRequestId}`,
          remark: input.reason ?? `释放企业钱包预占 ${reservation.reservedPoints} 点`
        }
      });

      return transaction.organizationWalletReservation.update({
        where: {
          id: reservation.id
        },
        data: {
          status: "RELEASED"
        }
      });
    });
  }

  private async requireEnterpriseEnabled() {
    if (!(await this.isEnterpriseEnabled())) {
      throw new AppException(40301, "企业账号体系未启用", HttpStatus.FORBIDDEN);
    }
  }

  private async requireActiveMember(userId: string, orgId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId
        }
      }
    });

    if (!member || member.status !== "ACTIVE") {
      throw new AppException(40301, "你不是该企业的有效成员", HttpStatus.FORBIDDEN);
    }

    return member;
  }

  private async requireManager(userId: string, orgId: string) {
    const member = await this.requireActiveMember(userId, orgId);

    if (!managerRoles.has(member.role as OrganizationRole)) {
      throw new AppException(40301, "需要企业管理员权限", HttpStatus.FORBIDDEN);
    }

    return member;
  }

  private async resolveMemberUser(dto: AddOrganizationMemberDto) {
    const userId = cleanOptional(dto.userId);
    const email = cleanOptional(dto.email)?.toLowerCase();
    const phone = cleanOptional(dto.phone);

    if (userId) {
      return this.prisma.user.findUnique({
        where: {
          id: userId
        }
      });
    }

    if (email) {
      return this.prisma.user.findUnique({
        where: {
          email
        }
      });
    }

    if (phone) {
      return this.prisma.user.findUnique({
        where: {
          phone
        }
      });
    }

    throw new AppException(40001, "请先选择或填写要加入组织的用户", HttpStatus.BAD_REQUEST);
  }

  private async requireActiveMemberInTransaction(transaction: Prisma.TransactionClient, userId: string, orgId: string) {
    const member = await transaction.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId
        }
      }
    });

    if (!member || member.status !== "ACTIVE") {
      throw new AppException(40301, "你不是该企业的有效成员", HttpStatus.FORBIDDEN);
    }

    return member;
  }

  private async ensureOrganizationWallet(transaction: Prisma.TransactionClient, orgId: string) {
    return transaction.organizationWallet.upsert({
      where: {
        orgId
      },
      update: {},
      create: {
        orgId
      }
    });
  }

  private async findUsableQuota(transaction: Prisma.TransactionClient, orgId: string, memberId: string, points: number) {
    const quotas = await transaction.organizationMemberQuota.findMany({
      where: {
        orgId,
        memberId,
        status: "ACTIVE"
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const quota = quotas.find((item) => item.totalQuota - item.usedQuota - item.reservedQuota >= points);

    if (!quota) {
      throw new AppException(40004, "企业成员额度不足", HttpStatus.BAD_REQUEST);
    }

    return quota;
  }

  private async consumePointLots(transaction: Prisma.TransactionClient, orgId: string, points: number) {
    let remaining = points;
    const lots = await transaction.organizationPointLot.findMany({
      where: {
        orgId,
        status: "ACTIVE",
        remainingPoints: {
          gt: 0
        }
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }]
    });

    for (const lot of lots) {
      if (remaining <= 0) {
        break;
      }

      const decrement = Math.min(remaining, lot.remainingPoints);
      const nextRemaining = lot.remainingPoints - decrement;
      await transaction.organizationPointLot.update({
        where: {
          id: lot.id
        },
        data: {
          remainingPoints: {
            decrement
          },
          status: nextRemaining <= 0 ? "USED_UP" : "ACTIVE"
        }
      });
      remaining -= decrement;
    }

    if (remaining > 0) {
      throw new AppException(40004, "企业点数批次余额不足", HttpStatus.BAD_REQUEST);
    }
  }

  private toUserOrganization(member: MemberWithOrgPayload) {
    return {
      id: member.organization.id,
      name: member.organization.name,
      legalName: member.organization.legalName,
      type: member.organization.type,
      status: member.organization.status,
      role: member.role,
      memberId: member.id,
      memberStatus: member.status,
      memberCount: member.organization._count.members,
      wallet: member.organization.wallet ? this.toWallet(member.organization.wallet) : null,
      quota: this.summarizeQuotas(member.quotas)
    };
  }

  private toAdminOrganization(organization: OrganizationListPayload) {
    return {
      id: organization.id,
      name: organization.name,
      legalName: organization.legalName,
      type: organization.type,
      industry: organization.industry,
      employeeSize: organization.employeeSize,
      status: organization.status,
      ownerUserId: organization.ownerUserId,
      owner: organization.owner,
      wallet: organization.wallet ? this.toWallet(organization.wallet) : null,
      memberCount: organization._count.members,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt
    };
  }

  private toOrganizationDetail(organization: OrganizationDetailPayload) {
    return {
      id: organization.id,
      name: organization.name,
      legalName: organization.legalName,
      type: organization.type,
      status: organization.status,
      billingMode: organization.billingMode,
      ownerUserId: organization.ownerUserId,
      owner: organization.owner,
      settings: organization.settings,
      wallet: organization.wallet ? this.toWallet(organization.wallet) : null,
      members: organization.members.map((member) => this.toMember(member)),
      quotas: organization.memberQuotas.map((quota) => this.toQuota(quota)),
      ledgers: organization.walletLedgers.map((ledger) => ({
        ...ledger,
        createdAt: ledger.createdAt
      })),
      usageEvents: organization.usageEvents,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt
    };
  }

  private toMember(member: MemberPayload) {
    return {
      id: member.id,
      orgId: member.orgId,
      userId: member.userId,
      email: member.user.email,
      phone: member.user.phone,
      nickname: member.user.nickname,
      role: member.role,
      roleName: roleName(member.role as OrganizationRole),
      status: member.status,
      statusName: memberStatusName(member.status as OrganizationMemberStatus),
      title: member.title,
      joinedAt: member.joinedAt,
      quotas: member.quotas.map((quota) => this.toQuota(quota))
    };
  }

  private toQuota(quota: {
    id: string;
    orgId: string;
    memberId: string;
    quotaType: string;
    totalQuota: number;
    usedQuota: number;
    reservedQuota: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: quota.id,
      orgId: quota.orgId,
      memberId: quota.memberId,
      quotaType: quota.quotaType,
      totalQuota: quota.totalQuota,
      usedQuota: quota.usedQuota,
      reservedQuota: quota.reservedQuota,
      remainingQuota: quota.totalQuota - quota.usedQuota - quota.reservedQuota,
      status: quota.status,
      createdAt: quota.createdAt,
      updatedAt: quota.updatedAt
    };
  }

  private toWallet(wallet: {
    id: string;
    orgId: string;
    status: string;
    balanceTotal: number;
    balanceAvailable: number;
    balanceReserved: number;
    totalPurchased: number;
    totalGranted: number;
    totalConsumed: number;
    totalExpired: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: wallet.id,
      orgId: wallet.orgId,
      status: wallet.status,
      balanceTotal: wallet.balanceTotal,
      balanceAvailable: wallet.balanceAvailable,
      balanceReserved: wallet.balanceReserved,
      totalPurchased: wallet.totalPurchased,
      totalGranted: wallet.totalGranted,
      totalConsumed: wallet.totalConsumed,
      totalExpired: wallet.totalExpired,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  private summarizeQuotas(quotas: Array<{ totalQuota: number; usedQuota: number; reservedQuota: number }>) {
    return quotas.reduce(
      (summary: { totalQuota: number; usedQuota: number; reservedQuota: number; remainingQuota: number }, quota) => {
        summary.totalQuota += quota.totalQuota;
        summary.usedQuota += quota.usedQuota;
        summary.reservedQuota += quota.reservedQuota;
        summary.remainingQuota += quota.totalQuota - quota.usedQuota - quota.reservedQuota;
        return summary;
      },
      {
        totalQuota: 0,
        usedQuota: 0,
        reservedQuota: 0,
        remainingQuota: 0
      }
    );
  }
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function roleName(role: OrganizationRole) {
  const names: Record<OrganizationRole, string> = {
    OWNER: "企业所有者",
    ADMIN: "企业管理员",
    FINANCE_ADMIN: "财务管理员",
    MEMBER: "普通成员"
  };

  return names[role] ?? role;
}

function memberStatusName(status: OrganizationMemberStatus) {
  const names: Record<OrganizationMemberStatus, string> = {
    INVITED: "待加入",
    ACTIVE: "正常",
    SUSPENDED: "已停用",
    REMOVED: "已移除"
  };

  return names[status] ?? status;
}

function memberInclude() {
  return {
    user: {
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true
      }
    },
    quotas: {
      where: {
        status: "ACTIVE"
      },
      orderBy: {
        createdAt: "desc"
      }
    }
  } satisfies Prisma.OrganizationMemberInclude;
}

function organizationListInclude() {
  return {
    owner: {
      select: {
        id: true,
        email: true,
        nickname: true
      }
    },
    wallet: true,
    _count: {
      select: {
        members: true
      }
    }
  } satisfies Prisma.OrganizationInclude;
}

function organizationDetailInclude() {
  return {
    owner: {
      select: {
        id: true,
        email: true,
        nickname: true
      }
    },
    settings: true,
    wallet: true,
    members: {
      include: memberInclude(),
      orderBy: {
        joinedAt: "asc"
      }
    },
    memberQuotas: {
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    },
    walletLedgers: {
      orderBy: {
        createdAt: "desc"
      },
      take: 30
    },
    usageEvents: {
      orderBy: {
        occurredAt: "desc"
      },
      take: 30
    }
  } satisfies Prisma.OrganizationInclude;
}

type OrganizationListPayload = Prisma.OrganizationGetPayload<{ include: ReturnType<typeof organizationListInclude> }>;
type OrganizationDetailPayload = Prisma.OrganizationGetPayload<{ include: ReturnType<typeof organizationDetailInclude> }>;
type MemberPayload = Prisma.OrganizationMemberGetPayload<{ include: ReturnType<typeof memberInclude> }>;
type MemberWithOrgPayload = Prisma.OrganizationMemberGetPayload<{
  include: {
    organization: {
      include: {
        wallet: true;
        _count: {
          select: {
            members: true;
          };
        };
      };
    };
    quotas: true;
  };
}>;
