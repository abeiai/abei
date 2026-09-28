import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, hashPassword, type PrismaClient } from "@xueleai/database";
import { AuthService } from "../auth/auth.service.js";
import { AppException } from "../common/app-exception.js";
import type {
  CreateLearnerDto,
  UpdateLearnerDto,
  UpdateSwitchPasswordDto
} from "./dto/profile.dto.js";
import { assertLearnerCapacity } from "./membership-access.js";
import { isLearnerGrade, learnerGradeLabel } from "./learner-grade.js";
import {
  LearnerAccessService,
  normalizeLearnerAuthorizationIds
} from "./learner-access.service.js";

type LearnerPrisma = PrismaClient;

@Injectable()
export class LearnerProfilesService {
  private readonly prisma: LearnerPrisma;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(LearnerAccessService) private readonly learnerAccessService: LearnerAccessService,
    @Optional() prisma?: LearnerPrisma
  ) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async list(userId: string, status?: "ACTIVE" | "INACTIVE") {
    if (status !== undefined && status !== "ACTIVE" && status !== "INACTIVE") {
      throw new AppException(40001, "学习者状态不正确", HttpStatus.BAD_REQUEST);
    }

    const learners = await this.prisma.learner.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    });

    return learners.map((learner) => this.toPublicLearner(learner));
  }

  async selection(user: {
    id: string;
    accountId: string;
    nickname: string;
    avatarUrl: string | null;
    hasLoginPassword: boolean;
  }) {
    const learners = await this.prisma.learner.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });

    return {
      account: {
        id: user.id,
        accountId: user.accountId,
        label: "我的账号",
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        hasLoginPassword: user.hasLoginPassword
      },
      learners: learners.map((learner) => this.toPublicLearner(learner))
    };
  }

  async create(userId: string, dto: CreateLearnerDto) {
    const nickname = this.normalizeNickname(dto.nickname);
    this.assertGrade(dto.grade);
    const scenarioIds = normalizeLearnerAuthorizationIds(dto.scenarioIds ?? []);
    const courseIds = normalizeLearnerAuthorizationIds(dto.courseIds ?? []);

    return this.prisma.$transaction(
      async (transaction) => {
        const allocated = await transaction.user.updateMany({
          where: {
            id: userId,
            nextLearnerNumber: { lte: 999 }
          },
          data: { nextLearnerNumber: { increment: 1 } }
        });

        if (allocated.count !== 1) {
          const existingUser = await transaction.user.findUnique({
            where: { id: userId },
            select: { id: true }
          });

          if (!existingUser) {
            throw new AppException(40401, "账号不存在", HttpStatus.NOT_FOUND);
          }

          throw new AppException(40004, "学习账号数量已达上限", HttpStatus.BAD_REQUEST);
        }

        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            passwordLoginEnabled: true,
            learnerSwitchPasswordHash: true,
            nextLearnerNumber: true
          }
        });

        if (!user) {
          throw new AppException(40401, "账号不存在", HttpStatus.NOT_FOUND);
        }

        await assertLearnerCapacity(transaction, userId);
        const accountNumber = user.nextLearnerNumber - 1;

        const learnerCount = await transaction.learner.count({ where: { userId } });

        if (learnerCount === 0) {
          if (!user.passwordLoginEnabled) {
            throw new AppException(40003, "请先设置主账号登录密码", HttpStatus.BAD_REQUEST);
          }
          if (dto.switchPassword === undefined) {
            throw new AppException(40001, "请设置 6 位数字切换密码", HttpStatus.BAD_REQUEST);
          }
          this.assertSwitchPassword(dto.switchPassword);
          await transaction.user.update({
            where: { id: userId },
            data: { learnerSwitchPasswordHash: await hashPassword(dto.switchPassword) }
          });
        } else if (dto.switchPassword !== undefined) {
          throw new AppException(40001, "已有学习者时不能设置切换密码", HttpStatus.BAD_REQUEST);
        }

        const learner = await transaction.learner.create({
          data: { userId, accountNumber, nickname, grade: dto.grade }
        });

        await this.learnerAccessService.replaceAuthorizationsInTransaction(transaction, userId, learner.id, {
          scenarioIds,
          courseIds
        });

        return this.toPublicLearner(learner);
      },
      { isolationLevel: "ReadCommitted" }
    );
  }

  async update(userId: string, learnerId: string, dto: UpdateLearnerDto) {
    const learner = await this.requireOwned(userId, learnerId);
    const data: { nickname?: string; grade?: typeof dto.grade } = {};

    if (dto.nickname !== undefined) {
      data.nickname = this.normalizeNickname(dto.nickname);
    }
    if (dto.grade !== undefined) {
      this.assertGrade(dto.grade);
      data.grade = dto.grade;
    }

    if (Object.keys(data).length === 0) {
      return this.toPublicLearner(learner);
    }

    return this.toPublicLearner(
      await this.prisma.learner.update({ where: { id: learner.id }, data })
    );
  }

  async assertOwned(userId: string, learnerId: string) {
    return this.toPublicLearner(await this.requireOwned(userId, learnerId));
  }

  async updateAvatar(userId: string, learnerId: string, avatarUrl: string) {
    const learner = await this.requireOwned(userId, learnerId);
    return this.toPublicLearner(
      await this.prisma.learner.update({ where: { id: learner.id }, data: { avatarUrl } })
    );
  }

  async deactivate(userId: string, learnerId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        const learner = await this.requireOwned(userId, learnerId, transaction as LearnerPrisma);

        if (learner.status === "INACTIVE") {
          return this.toPublicLearner(learner);
        }

        const now = new Date();
        const updated = await transaction.learner.update({
          where: { id: learner.id },
          data: { status: "INACTIVE", deactivatedAt: now }
        });
        await transaction.refreshToken.updateMany({
          where: {
            userId,
            type: "USER",
            profileMode: "LEARNER",
            profileLearnerId: learnerId,
            revokedAt: null
          },
          data: { revokedAt: now }
        });

        return this.toPublicLearner(updated);
      },
      { isolationLevel: "Serializable" }
    );
  }

  async restore(userId: string, learnerId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        // The same user row is locked by create before it counts active learners.
        await transaction.user.update({ where: { id: userId }, data: { nextLearnerNumber: { increment: 0 } } });
        const learner = await this.requireOwned(userId, learnerId, transaction as LearnerPrisma);

        if (learner.status === "ACTIVE") {
          return this.toPublicLearner(learner);
        }

        await assertLearnerCapacity(transaction, userId);
        return this.toPublicLearner(
          await transaction.learner.update({
            where: { id: learner.id },
            data: { status: "ACTIVE", deactivatedAt: null }
          })
        );
      },
      { isolationLevel: "ReadCommitted" }
    );
  }

  async updateSwitchPassword(userId: string, dto: UpdateSwitchPasswordDto) {
    this.assertSwitchPassword(dto.switchPassword);
    await this.authService.verifyUserPassword(userId, dto.currentPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { learnerSwitchPasswordHash: await hashPassword(dto.switchPassword) }
    });
    return {};
  }

  private async requireOwned(userId: string, learnerId: string, prisma: LearnerPrisma = this.prisma) {
    const learner = await prisma.learner.findFirst({ where: { id: learnerId, userId } });

    if (!learner) {
      throw new AppException(40401, "学习者不存在或无权操作", HttpStatus.NOT_FOUND);
    }

    return learner;
  }

  private normalizeNickname(value: unknown) {
    const nickname = typeof value === "string" ? value.trim() : "";

    if (Array.from(nickname).length < 1 || Array.from(nickname).length > 30) {
      throw new AppException(40001, "昵称长度必须为 1 到 30 个字符", HttpStatus.BAD_REQUEST);
    }

    return nickname;
  }

  private assertGrade(value: unknown): asserts value is CreateLearnerDto["grade"] {
    if (!isLearnerGrade(value)) {
      throw new AppException(40001, "学段不正确", HttpStatus.BAD_REQUEST);
    }
  }

  private assertSwitchPassword(value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
      throw new AppException(40001, "切换密码必须为 6 位数字", HttpStatus.BAD_REQUEST);
    }
  }

  private toPublicLearner(learner: {
    id: string;
    accountNumber: number;
    nickname: string;
    grade: string;
    avatarUrl: string | null;
    status: string;
    deactivatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: learner.id,
      accountId: String(learner.accountNumber),
      nickname: learner.nickname,
      grade: learner.grade,
      gradeLabel: learnerGradeLabel(learner.grade),
      avatarUrl: learner.avatarUrl,
      status: learner.status,
      deactivatedAt: learner.deactivatedAt,
      createdAt: learner.createdAt,
      updatedAt: learner.updatedAt
    };
  }
}
