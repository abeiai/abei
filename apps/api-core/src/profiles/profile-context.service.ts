import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, verifyPassword, type PrismaClient } from "@xueleai/database";
import { AuthService } from "../auth/auth.service.js";
import { AppException } from "../common/app-exception.js";
import { profileContextCookie, readCookie } from "../security/cookies.js";
import type {
  EnterLearnerDto,
  ReturnToAccountDto,
  SelectProfileDto,
  SwitchLearnerDto
} from "./dto/profile.dto.js";
import { getProfileContextSecret, profileContextForUser, signProfileContextToken } from "./profile-context-token.js";
import type {
  ProfileContextTransition,
  ProfileSubject,
  PublicLearnerProfile,
  PublicProfileContext,
  RequestLike
} from "./profile-context.types.js";
import { learnerGradeLabel } from "./learner-grade.js";

type RefreshSession = Awaited<ReturnType<AuthService["requireUserRefreshSession"]>>;
type ProfilePrisma = PrismaClient;

@Injectable()
export class ProfileContextService {
  private readonly prisma: ProfilePrisma;
  private readonly secret: string;

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Optional() prisma?: ProfilePrisma,
    @Optional() secret?: string
  ) {
    this.prisma = prisma ?? getPrismaClient();
    this.secret = secret ?? getProfileContextSecret();
  }

  async optional(request: RequestLike, userId: string): Promise<PublicProfileContext | null> {
    const session = await this.authService.requireUserRefreshSession(request, userId);

    if (session.profileMode === "UNSELECTED") {
      return null;
    }

    const subject = await this.resolveSelectedSubject(request, userId, session);
    return this.publicContext(subject);
  }

  async requireSelected(request: RequestLike, userId: string): Promise<ProfileSubject> {
    const session = await this.authService.requireUserRefreshSession(request, userId);

    if (session.profileMode === "UNSELECTED") {
      throw new AppException(40301, "请先选择使用身份", HttpStatus.FORBIDDEN);
    }

    return this.resolveSelectedSubject(request, userId, session);
  }

  async requireSelectedSession(request: RequestLike, userId: string) {
    const session = await this.authService.requireUserRefreshSession(request, userId);

    if (session.profileMode === "UNSELECTED") {
      throw new AppException(40301, "请先选择使用身份", HttpStatus.FORBIDDEN);
    }

    return {
      subject: await this.resolveSelectedSubject(request, userId, session),
      refreshTokenId: session.id
    };
  }

  async requireAccount(request: RequestLike, userId: string): Promise<ProfileSubject & { mode: "ACCOUNT" }> {
    const subject = await this.requireSelected(request, userId);

    if (subject.mode !== "ACCOUNT") {
      throw new AppException(40301, "请切换到主账号身份后操作", HttpStatus.FORBIDDEN);
    }

    return subject;
  }

  async select(request: RequestLike, userId: string, dto: SelectProfileDto): Promise<ProfileContextTransition> {
    const session = await this.authService.requireUserRefreshSession(request, userId);

    if (session.profileMode !== "UNSELECTED") {
      await this.resolveSelectedSubject(request, userId, session);
      throw new AppException(40001, "当前会话已选择身份", HttpStatus.BAD_REQUEST);
    }

    if (dto.mode === "ACCOUNT") {
      if (dto.learnerId) {
        throw new AppException(40001, "账号身份不能指定学习者", HttpStatus.BAD_REQUEST);
      }
      return this.transition(session, userId, "ACCOUNT", null);
    }

    if (!dto.learnerId) {
      throw new AppException(40001, "请选择学习者", HttpStatus.BAD_REQUEST);
    }

    return this.transition(session, userId, "LEARNER", dto.learnerId);
  }

  async enterLearner(request: RequestLike, userId: string, dto: EnterLearnerDto): Promise<ProfileContextTransition> {
    const session = await this.requireMode(request, userId, "ACCOUNT");
    return this.transition(session, userId, "LEARNER", dto.learnerId);
  }

  async switchLearner(request: RequestLike, userId: string, dto: SwitchLearnerDto): Promise<ProfileContextTransition> {
    const session = await this.requireMode(request, userId, "LEARNER");

    if (session.profileLearnerId === dto.learnerId) {
      throw new AppException(40001, "当前已是该学习者", HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, learnerSwitchPasswordHash: true }
    });

    if (!user?.learnerSwitchPasswordHash) {
      throw new AppException(40003, "请先设置学习者切换密码", HttpStatus.BAD_REQUEST);
    }

    if (!(await verifyPassword(dto.switchPassword, user.learnerSwitchPasswordHash))) {
      throw new AppException(40003, "切换密码错误", HttpStatus.BAD_REQUEST);
    }

    return this.transition(session, userId, "LEARNER", dto.learnerId);
  }

  async returnToAccount(
    request: RequestLike,
    userId: string,
    dto: ReturnToAccountDto
  ): Promise<ProfileContextTransition> {
    const session = await this.requireMode(request, userId, "LEARNER");
    await this.authService.verifyUserPassword(userId, dto.password);
    return this.transition(session, userId, "ACCOUNT", null);
  }

  private async requireMode(request: RequestLike, userId: string, expected: "ACCOUNT" | "LEARNER") {
    const session = await this.authService.requireUserRefreshSession(request, userId);

    if (session.profileMode === "UNSELECTED") {
      throw new AppException(40301, "请先选择使用身份", HttpStatus.FORBIDDEN);
    }

    const subject = await this.resolveSelectedSubject(request, userId, session);

    if (subject.mode !== expected) {
      throw new AppException(40001, "当前身份不支持此操作", HttpStatus.BAD_REQUEST);
    }

    return session;
  }

  private async resolveSelectedSubject(request: RequestLike, userId: string, session: RefreshSession) {
    let currentLearnerId: string | null = null;

    if (session.profileMode === "LEARNER") {
      const learner = await this.findOwnedLearner(session.profileLearnerId, userId);

      if (!learner || learner.status !== "ACTIVE") {
        await this.revokeSession(session, userId);
        throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
      }

      currentLearnerId = learner.id;
    }

    const token = readCookie(request, profileContextCookie);
    const payload = token ? profileContextForUser(token, userId, this.secret) : null;

    if (
      !payload ||
      payload.refreshTokenId !== session.id ||
      payload.mode !== session.profileMode ||
      payload.learnerId !== session.profileLearnerId
    ) {
      throw new AppException(40102, "身份状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (session.profileMode === "ACCOUNT") {
      return { userId, mode: "ACCOUNT", learnerId: null } as const;
    }

    return { userId, mode: "LEARNER", learnerId: currentLearnerId! } as const;
  }

  private async publicContext(subject: ProfileSubject): Promise<PublicProfileContext> {
    if (subject.mode === "ACCOUNT") {
      return { mode: "ACCOUNT", learnerId: null, learner: null };
    }

    const learner = await this.requireActiveOwnedLearner(subject.learnerId, subject.userId);
    return { mode: "LEARNER", learnerId: learner.id, learner: this.toPublicLearner(learner) };
  }

  private async transition(
    session: RefreshSession,
    userId: string,
    mode: "ACCOUNT" | "LEARNER",
    learnerId: string | null
  ): Promise<ProfileContextTransition> {
    const outcome = await this.prisma.$transaction(
      async (transaction) => {
        const transactionNow = new Date();
        const authoritative = await transaction.refreshToken.findFirst({
          where: {
            id: session.id,
            userId,
            type: "USER",
            revokedAt: null,
            expiresAt: { equals: session.expiresAt, gt: transactionNow },
            profileMode: session.profileMode,
            profileLearnerId: session.profileLearnerId
          }
        });

        if (!authoritative) {
          return { kind: "stale" } as const;
        }

        if (authoritative.profileMode === "LEARNER") {
          const currentLearner = authoritative.profileLearnerId
            ? await transaction.learner.findFirst({
                where: {
                  id: authoritative.profileLearnerId,
                  userId,
                  status: "ACTIVE"
                }
              })
            : null;

          if (!currentLearner) {
            const revoked = await transaction.refreshToken.updateMany({
              where: this.refreshSnapshotWhere(authoritative, userId),
              data: { revokedAt: new Date() }
            });
            return revoked.count === 1 ? ({ kind: "invalid-current" } as const) : ({ kind: "stale" } as const);
          }
        }

        const targetLearner =
          mode === "LEARNER" && learnerId
            ? await transaction.learner.findFirst({
                where: { id: learnerId, userId, status: "ACTIVE" }
              })
            : null;

        if (mode === "LEARNER" && !targetLearner) {
          return { kind: "invalid-target" } as const;
        }

        const updated = await transaction.refreshToken.updateMany({
          where: this.refreshSnapshotWhere(authoritative, userId),
          data: { profileMode: mode, profileLearnerId: learnerId }
        });

        if (updated.count !== 1) {
          return { kind: "stale" } as const;
        }

        const signingNow = new Date();
        const maxAgeSeconds = Math.floor((authoritative.expiresAt.getTime() - signingNow.getTime()) / 1000);

        if (maxAgeSeconds <= 0) {
          throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
        }

        const context: PublicProfileContext =
          mode === "ACCOUNT"
            ? { mode: "ACCOUNT", learnerId: null, learner: null }
            : {
                mode: "LEARNER",
                learnerId: learnerId!,
                learner: this.toPublicLearner(targetLearner!)
              };

        return {
          kind: "success",
          transition: {
            token: signProfileContextToken(
              { userId, refreshTokenId: session.id, mode, learnerId },
              this.secret,
              maxAgeSeconds,
              signingNow
            ),
            maxAgeSeconds,
            context
          }
        } as const;
      },
      { isolationLevel: "Serializable" }
    );

    if (outcome.kind === "success") {
      return outcome.transition;
    }

    if (outcome.kind === "invalid-current") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (outcome.kind === "invalid-target") {
      throw new AppException(40004, "学习者不存在或已停用", HttpStatus.BAD_REQUEST);
    }

    throw new AppException(40102, "身份状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
  }

  private async requireActiveOwnedLearner(learnerId: string, userId: string) {
    const learner = await this.findOwnedLearner(learnerId, userId);

    if (!learner || learner.status !== "ACTIVE") {
      throw new AppException(40004, "学习者不存在或已停用", HttpStatus.BAD_REQUEST);
    }

    return learner;
  }

  private findOwnedLearner(learnerId: string | null, userId: string) {
    if (!learnerId) {
      return Promise.resolve(null);
    }

    return this.prisma.learner.findFirst({ where: { id: learnerId, userId } });
  }

  private async revokeSession(session: RefreshSession, userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        id: session.id,
        userId,
        type: "USER",
        revokedAt: null,
        expiresAt: { equals: session.expiresAt, gt: new Date() },
        profileMode: session.profileMode,
        profileLearnerId: session.profileLearnerId
      },
      data: { revokedAt: new Date() }
    });
  }

  private refreshSnapshotWhere(
    session: {
      id: string;
      expiresAt: Date;
      profileMode: "UNSELECTED" | "ACCOUNT" | "LEARNER";
      profileLearnerId: string | null;
    },
    userId: string
  ) {
    return {
      id: session.id,
      userId,
      type: "USER" as const,
      revokedAt: null,
      expiresAt: session.expiresAt,
      profileMode: session.profileMode,
      profileLearnerId: session.profileLearnerId
    };
  }

  private toPublicLearner(learner: { id: string; nickname: string; grade: string; avatarUrl: string | null }): PublicLearnerProfile {
    return {
      id: learner.id,
      nickname: learner.nickname,
      grade: learner.grade,
      gradeLabel: learnerGradeLabel(learner.grade),
      avatarUrl: learner.avatarUrl
    };
  }
}
