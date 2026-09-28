import { rewardNewReferral } from "../referrals/referral.service.js";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { decryptSecret, getPrismaClient, hashPassword, verifyPassword } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure
} from "../security/login-protection.js";
import {
  clearAuthCookies,
  clearProfileContextCookie,
  readBearerToken,
  readCookie,
  setAccessCookie,
  setProfileContextCookie,
  setAuthCookies,
  userAccessCookie,
  userRefreshCookie,
  type ResponseLike
} from "../security/cookies.js";
import { parseExpiresIn, signJwt, verifyJwt } from "../security/jwt.js";
import { getProfileContextSecret, signProfileContextToken } from "../profiles/profile-context-token.js";
import { LoginDto } from "./dto/login.dto.js";
import { LearnerLoginDto } from "./dto/learner-login.dto.js";
import { LogoutDto } from "./dto/logout.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { ChangeEmailDto, ResetPasswordDto, SendChangeEmailCodeDto, SendEmailCodeDto } from "./dto/email-auth.dto.js";
import { ChangePasswordDto, VerifyPasswordDto } from "./dto/change-password.dto.js";
import { ResetPasswordWithTokenDto, VerifyPasswordResetCodeDto } from "./dto/password-reset.dto.js";
import { UpdateProfileDto } from "./dto/update-profile.dto.js";
import { BindPhoneDto, PhoneLoginDto, SendPhoneCodeDto } from "./dto/phone-auth.dto.js";

interface RequestLike {
  headers: {
    cookie?: string;
    authorization?: string;
  };
}

export interface PublicUser {
  id: string;
  accountId: string;
  email: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  nickname: string;
  avatarUrl: string | null;
  status: string;
  hasLoginPassword: boolean;
}

interface UserRefreshSession {
  user: PublicUser;
  refreshToken: string;
  refreshTokenId: string;
  expiresAt: Date;
  profileMode: "UNSELECTED" | "ACCOUNT" | "LEARNER";
  profileLearnerId: string | null;
}

const defaultAccessSessionSeconds = 15 * 60;
const defaultPersistentSessionSeconds = 400 * 24 * 60 * 60;
const defaultSmsCodeTtlSeconds = 5 * 60;
const defaultEmailCodeTtlSeconds = 5 * 60;
const defaultPasswordResetTokenTtlSeconds = 10 * 60;
const defaultPhoneVerificationCode = "199599";
const aliyunDirectMailProvider = "ALIYUN_DIRECT_MAIL";
const aliyunDirectMailEndpoint = "https://dm.aliyuncs.com/";
const aliyunStandardSmsProvider = "ALIYUN_SMS";
const aliyunDypnsSmsProvider = "ALIYUN_DYPNS";
const aliyunStandardSmsEndpoint = "https://dysmsapi.aliyuncs.com/";
const aliyunDypnsEndpoint = "https://dypnsapi.aliyuncs.com/";
const phonePattern = /^1[3-9]\d{9}$/;
const resetPasswordEmailCodeMessage = "如果邮箱已注册，验证码将发送至该邮箱";
const resetPasswordPhoneCodeMessage = "如果手机号已绑定，验证码将发送至该手机";
const learnerSessionEmail = "learner@session.xueleai.local";

type SmsCodePurpose = "LOGIN" | "BIND_PHONE" | "RESET_PASSWORD";
type EmailCodePurpose = "REGISTER" | "RESET_PASSWORD" | "CHANGE_EMAIL";
type PasswordResetMethod = "EMAIL" | "PHONE";
type AliyunSmsProvider = typeof aliyunStandardSmsProvider | typeof aliyunDypnsSmsProvider;

interface AliyunMailConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  regionId: string;
  accountName: string;
  fromAlias: string;
  addressType: string;
  replyToAddress: boolean;
  subject: string;
  bodyTemplate: string;
  timeoutMs: number;
}

interface AliyunSmsConfig {
  provider: AliyunSmsProvider;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  regionId: string;
  signName: string;
  templateCode: string;
  templateParamCodeKey: string;
  templateParamExtraJson: string;
  timeoutMs: number;
}

@Injectable()
export class AuthService {
  private readonly prisma = getPrismaClient();

  async register(dto: RegisterDto, response: ResponseLike, referralToken?: string | null) {
    const email = this.normalizeEmail(dto.email);
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (existingUser) {
      throw new AppException(40002, "该邮箱已注册", HttpStatus.BAD_REQUEST);
    }

    await this.verifyEmailCode(email, "REGISTER", dto.emailCode);

    const user = await this.prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          email,
          passwordHash: await hashPassword(dto.password),
          passwordLoginEnabled: true,
          nickname: dto.nickname?.trim() || email.split("@")[0] || "新用户",
          lastLoginAt: new Date()
        }
      });

      await transaction.wallet.create({
        data: {
          userId: createdUser.id
        }
      });

      await rewardNewReferral(transaction, createdUser.id, referralToken);
      return createdUser;
    });

    return this.createUserSession(this.toPublicUser(user), response);
  }

  async sendEmailCode(dto: SendEmailCodeDto) {
    const email = this.normalizeEmail(dto.email);
    const purpose = dto.purpose;
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email
      },
      select: {
        id: true,
        status: true
      }
    });

    if (purpose === "REGISTER" && existingUser) {
      throw new AppException(40002, "该邮箱已注册", HttpStatus.BAD_REQUEST);
    }

    if (purpose === "RESET_PASSWORD" && (!existingUser || existingUser.status !== "ACTIVE")) {
      return {
        email,
        purpose,
        expiresIn: await this.getEmailCodeTtlSeconds(),
        message: resetPasswordEmailCodeMessage
      };
    }

    const expiresIn = await this.createAndSendEmailCode(email, purpose);

    return {
      email,
      purpose,
      expiresIn,
      message: purpose === "RESET_PASSWORD" ? resetPasswordEmailCodeMessage : "验证码已发送"
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }

    await this.verifyEmailCode(email, "RESET_PASSWORD", dto.emailCode);

    await this.updateUserPasswordAndRevokeSessions(user.id, dto.password);

    return {
      message: "密码已重置，请重新登录"
    };
  }

  async verifyPasswordResetCode(dto: VerifyPasswordResetCodeDto) {
    if (dto.method === "EMAIL") {
      const email = this.normalizeEmail(dto.email ?? "");
      const user = await this.prisma.user.findUnique({
        where: {
          email
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          status: true
        }
      });

      if (!user || user.status !== "ACTIVE") {
        throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
      }

      await this.verifyEmailCode(email, "RESET_PASSWORD", dto.code);

      return this.createPasswordResetToken(user, "EMAIL");
    }

    const phone = this.normalizePhone(dto.phone ?? "");
    const user = await this.prisma.user.findUnique({
      where: {
        phone
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }

    await this.verifyPhoneCode(phone, "RESET_PASSWORD", dto.code);

    return this.createPasswordResetToken(user, "PHONE");
  }

  async resetPasswordWithToken(dto: ResetPasswordWithTokenDto) {
    const payload = verifyJwt(dto.resetToken, this.getAccessSecret());

    if (!payload || payload.type !== "PASSWORD_RESET") {
      throw new AppException(40003, "重置凭证已失效，请重新验证", HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true
      }
    });

    if (
      !user ||
      user.status !== "ACTIVE" ||
      user.email !== payload.email ||
      this.createPasswordHashFingerprint(user.passwordHash) !== payload.passwordHashFingerprint
    ) {
      throw new AppException(40003, "重置凭证已失效，请重新验证", HttpStatus.BAD_REQUEST);
    }

    await this.updateUserPasswordAndRevokeSessions(user.id, dto.password);

    return {
      message: "密码已重置，请重新登录"
    };
  }

  async sendChangeEmailCode(userId: string, dto: SendChangeEmailCodeDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        email: true,
        status: true
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (user.email === email) {
      throw new AppException(40001, "新邮箱不能和当前邮箱相同", HttpStatus.BAD_REQUEST);
    }

    await this.assertEmailAvailable(email, userId);

    const expiresIn = await this.createAndSendEmailCode(email, "CHANGE_EMAIL");

    return {
      email,
      expiresIn,
      message: "验证码已发送"
    };
  }

  async login(dto: LoginDto, response: ResponseLike) {
    const email = this.normalizeEmail(dto.email);

    await assertLoginAllowed("USER", email);

    const user = await this.prisma.user.findUnique({
      where: {
        email
      }
    });

    if (!user || !user.passwordLoginEnabled || !(await verifyPassword(dto.password, user.passwordHash))) {
      await recordLoginFailure("USER", email);
      throw new AppException(40003, "邮箱或密码错误", HttpStatus.BAD_REQUEST);
    }

    if (user.status !== "ACTIVE") {
      throw new AppException(40301, "账号已被禁用", HttpStatus.FORBIDDEN);
    }

    await clearLoginFailures("USER", email);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        lastLoginAt: new Date()
      }
    });

    return this.createUserSession(this.toPublicUser(updatedUser), response);
  }

  async loginAsLearner(dto: LearnerLoginDto, response: ResponseLike) {
    const accountNumber = Number(dto.accountId);
    const learnerNumber = Number(dto.learnerId);

    if (
      !Number.isSafeInteger(accountNumber) ||
      accountNumber < 10000 ||
      accountNumber > 2_147_483_647 ||
      !Number.isSafeInteger(learnerNumber) ||
      learnerNumber < 100 ||
      learnerNumber > 999
    ) {
      throw this.invalidLearnerCredentials();
    }

    const user = await this.prisma.user.findUnique({
      where: { accountNumber },
      include: {
        learners: {
          where: { accountNumber: learnerNumber },
          take: 1
        }
      }
    });
    const learner = user?.learners[0];
    const passwordMatches = user?.learnerSwitchPasswordHash
      ? await verifyPassword(dto.switchPassword, user.learnerSwitchPasswordHash)
      : false;

    if (
      !user ||
      user.status !== "ACTIVE" ||
      !learner ||
      learner.status !== "ACTIVE" ||
      !passwordMatches
    ) {
      throw this.invalidLearnerCredentials();
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return this.createUserSession(this.toPublicUser(updatedUser), response, {
      mode: "LEARNER",
      learnerId: learner.id
    });
  }

  async setProfileAccessCookie(
    userId: string,
    mode: "ACCOUNT" | "LEARNER",
    response: ResponseLike
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    const learnerSession = mode === "LEARNER";
    const accessMaxAge = this.getAccessMaxAge();
    const accessToken = signJwt(
      {
        sub: user.id,
        email: learnerSession ? learnerSessionEmail : user.email,
        type: "USER",
        ...(learnerSession ? { sessionScope: "LEARNER" as const } : {})
      },
      this.getAccessSecret(),
      accessMaxAge
    );

    setAccessCookie(response, userAccessCookie, accessToken, accessMaxAge);
  }

  async sendPhoneCode(dto: SendPhoneCodeDto, userId?: string) {
    const phone = this.normalizePhone(dto.phone);
    const purpose = dto.purpose ?? "LOGIN";

    if (purpose === "BIND_PHONE") {
      if (!userId) {
        throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
      }

      const existingOwner = await this.prisma.user.findUnique({
        where: {
          phone
        },
        select: {
          id: true
        }
      });

      if (existingOwner && existingOwner.id !== userId) {
        throw new AppException(40002, "该手机号已绑定其他账号", HttpStatus.BAD_REQUEST);
      }
    }

    if (purpose === "RESET_PASSWORD") {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          phone
        },
        select: {
          id: true,
          status: true
        }
      });

      if (!existingUser || existingUser.status !== "ACTIVE") {
        return {
          phone,
          purpose,
          expiresIn: await this.getSmsCodeTtlSeconds(),
          sent: false,
          message: resetPasswordPhoneCodeMessage
        };
      }
    }

    let code = this.createSmsCode();
    const expiresIn = await this.getSmsCodeTtlSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    let sendProvider = "LOCAL_DEFAULT";
    let sendRequestId: string | null = null;
    let sendStatus = "短信服务未配置，已启用默认验证码";

    const aliyunSmsConfig = await this.getAliyunSmsConfig();

    if (aliyunSmsConfig?.provider === aliyunDypnsSmsProvider) {
      const sent = await this.sendAliyunSmsVerifyCode(phone, expiresIn, aliyunSmsConfig);
      sendProvider = aliyunSmsConfig.provider;
      sendRequestId = sent.requestId;
      sendStatus = sent.status;
      code = sent.requestId || this.createOpaqueToken();
    } else if (aliyunSmsConfig?.provider === aliyunStandardSmsProvider) {
      const sent = await this.sendAliyunStandardSmsCode(phone, code, expiresIn, aliyunSmsConfig);
      sendProvider = aliyunSmsConfig.provider;
      sendRequestId = sent.requestId;
      sendStatus = sent.status;
    }

    await this.prisma.smsVerificationCode.create({
      data: {
        phone,
        purpose,
        codeHash: this.hashSmsCode(phone, purpose, code),
        expiresAt,
        sendProvider,
        sendRequestId,
        sendStatus
      }
    });

    return {
      phone,
      purpose,
      expiresIn,
      sent: sendProvider === aliyunDypnsSmsProvider || sendProvider === aliyunStandardSmsProvider,
      message:
        purpose === "RESET_PASSWORD" &&
        (sendProvider === aliyunDypnsSmsProvider || sendProvider === aliyunStandardSmsProvider)
          ? resetPasswordPhoneCodeMessage
          : purpose === "RESET_PASSWORD"
            ? `短信服务未配置，可使用默认验证码 ${defaultPhoneVerificationCode}`
            : sendProvider === aliyunDypnsSmsProvider || sendProvider === aliyunStandardSmsProvider
              ? "验证码已发送"
              : `短信服务未配置，可使用默认验证码 ${defaultPhoneVerificationCode}`
    };
  }

  async loginByPhone(dto: PhoneLoginDto, response: ResponseLike, referralToken?: string | null) {
    const phone = this.normalizePhone(dto.phone);
    const loginSubject = `phone:${phone}`;

    await assertLoginAllowed("USER", loginSubject);

    try {
      await this.verifyPhoneCode(phone, "LOGIN", dto.code);
    } catch (error) {
      await recordLoginFailure("USER", loginSubject);
      throw error;
    }

    let user = await this.prisma.user.findUnique({
      where: {
        phone
      }
    });

    if (!user) {
      user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            email: this.createPhoneUserEmail(phone),
            phone,
            phoneVerifiedAt: new Date(),
            passwordHash: await hashPassword(this.createOpaqueToken()),
            passwordLoginEnabled: false,
            nickname: dto.nickname?.trim() || `手机用户${phone.slice(-4)}`,
            lastLoginAt: new Date()
          }
        });

        await transaction.wallet.create({
          data: {
            userId: createdUser.id
          }
        });

        if (dto.code.trim() !== defaultPhoneVerificationCode) await rewardNewReferral(transaction, createdUser.id, referralToken);
        return createdUser;
      });
    }

    if (user.status !== "ACTIVE") {
      throw new AppException(40301, "账号已被禁用", HttpStatus.FORBIDDEN);
    }

    await clearLoginFailures("USER", loginSubject);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        phone,
        phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(),
        lastLoginAt: new Date()
      }
    });

    return this.createUserSession(this.toPublicUser(updatedUser), response);
  }

  async logout(request: RequestLike, response: ResponseLike, dto: LogoutDto = {}) {
    const refreshToken = readCookie(request, userRefreshCookie);

    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      const refreshRecord = await this.prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          type: "USER",
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        include: {
          user: true
        }
      });

      if (refreshRecord?.user?.status === "ACTIVE") {
        if (refreshRecord.profileMode === "LEARNER") {
          if (!/^\d{6}$/u.test(dto.switchPassword ?? "")) {
            throw new AppException(40003, "请输入 6 位切换密码", HttpStatus.BAD_REQUEST);
          }

          const switchPasswordHash = refreshRecord.user.learnerSwitchPasswordHash;
          const passwordMatches = switchPasswordHash
            ? await verifyPassword(dto.switchPassword!, switchPasswordHash)
            : false;

          if (!passwordMatches) {
            throw new AppException(40003, "切换密码错误", HttpStatus.BAD_REQUEST);
          }
        }

        const revoked = await this.prisma.refreshToken.updateMany({
          where: this.userRefreshSnapshotWhere(refreshRecord, tokenHash),
          data: { revokedAt: new Date() }
        });

        if (revoked.count !== 1) {
          throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
        }
      } else {
        await this.prisma.refreshToken.updateMany({
          where: {
            tokenHash,
            type: "USER",
            revokedAt: null
          },
          data: { revokedAt: new Date() }
        });
      }
    }

    clearAuthCookies(response, userAccessCookie, userRefreshCookie);
    clearProfileContextCookie(response);

    return {};
  }

  async me(request: RequestLike): Promise<PublicUser> {
    const token = readCookie(request, userAccessCookie) ?? readBearerToken(request);

    if (token) {
      const payload = verifyJwt(token, this.getAccessSecret());

      if (payload?.type === "USER") {
        const user = await this.prisma.user.findUnique({
          where: {
            id: payload.sub
          }
        });

        if (user?.status === "ACTIVE") {
          const publicUser = this.toPublicUser(user);
          const refreshToken = readCookie(request, userRefreshCookie);

          if (refreshToken) {
            try {
              const session = await this.resolveRefreshSession(
                request,
                "登录状态已失效，请重新登录"
              );

              if (session.user.id === publicUser.id) {
                return session.profileMode === "LEARNER"
                  ? this.toLearnerSessionUser(publicUser)
                  : publicUser;
              }
            } catch {
              // 有效 access token 仍可独立使用；学习账号 token 继续按最小信息返回。
            }
          }

          return payload.sessionScope === "LEARNER"
            ? this.toLearnerSessionUser(publicUser)
            : publicUser;
        }
      }
    }

    const session = await this.resolveRefreshSession(
      request,
      token ? "登录状态已失效，请重新登录" : "请先登录"
    );

    return session.profileMode === "LEARNER"
      ? this.toLearnerSessionUser(session.user)
      : session.user;
  }

  async refresh(request: RequestLike, response: ResponseLike) {
    const refreshToken = readCookie(request, userRefreshCookie);

    if (!refreshToken) {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    const tokenHash = this.hashToken(refreshToken);
    const accessMaxAge = this.getAccessMaxAge();
    const configuredRefreshMaxAge = this.getRefreshMaxAge();
    const outcome = await this.prisma.$transaction(
      async (transaction) => {
        const transactionNow = new Date();
        const refreshRecord = await transaction.refreshToken.findFirst({
          where: {
            tokenHash,
            type: "USER",
            userId: { not: null },
            revokedAt: null,
            expiresAt: { gt: transactionNow }
          },
          include: { user: true }
        });

        if (!refreshRecord?.user || refreshRecord.user.status !== "ACTIVE") {
          return { kind: "invalid" } as const;
        }

        if (refreshRecord.profileMode === "LEARNER") {
          const learner = refreshRecord.profileLearnerId
            ? await transaction.learner.findFirst({
                where: {
                  id: refreshRecord.profileLearnerId,
                  userId: refreshRecord.user.id,
                  status: "ACTIVE"
                }
              })
            : null;

          if (!learner) {
            const revoked = await transaction.refreshToken.updateMany({
              where: this.userRefreshSnapshotWhere(refreshRecord, tokenHash),
              data: { revokedAt: new Date() }
            });
            return revoked.count === 1
              ? ({ kind: "invalid-learner" } as const)
              : ({ kind: "stale" } as const);
          }
        }

        const renewedExpiresAt = new Date(Date.now() + configuredRefreshMaxAge * 1000);
        const updated = await transaction.refreshToken.updateMany({
          where: this.userRefreshSnapshotWhere(refreshRecord, tokenHash),
          data: { expiresAt: renewedExpiresAt }
        });

        if (updated.count !== 1) {
          return { kind: "stale" } as const;
        }

        const signingNow = new Date();
        const refreshMaxAge = Math.floor((renewedExpiresAt.getTime() - signingNow.getTime()) / 1000);

        if (refreshMaxAge <= 0) {
          throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
        }

        const accountUser = this.toPublicUser(refreshRecord.user);
        const learnerSession = refreshRecord.profileMode === "LEARNER";
        const user = learnerSession
          ? this.toLearnerSessionUser(accountUser)
          : accountUser;
        const accessToken = signJwt(
          {
            sub: accountUser.id,
            email: learnerSession ? learnerSessionEmail : accountUser.email,
            type: "USER",
            ...(learnerSession ? { sessionScope: "LEARNER" as const } : {})
          },
          this.getAccessSecret(),
          accessMaxAge
        );
        const profileTransition =
          refreshRecord.profileMode === "UNSELECTED"
            ? null
            : {
                token: signProfileContextToken(
                  {
                    userId: accountUser.id,
                    refreshTokenId: refreshRecord.id,
                    mode: refreshRecord.profileMode,
                    learnerId: refreshRecord.profileLearnerId
                  },
                  getProfileContextSecret(),
                  refreshMaxAge,
                  signingNow
                ),
                maxAgeSeconds: refreshMaxAge
              };

        return {
          kind: "success",
          user,
          accessToken,
          refreshMaxAge,
          profileTransition
        } as const;
      },
      { isolationLevel: "Serializable" }
    );

    if (outcome.kind === "invalid-learner") {
      clearAuthCookies(response, userAccessCookie, userRefreshCookie);
      clearProfileContextCookie(response);
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (outcome.kind !== "success") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    setAuthCookies(
      response,
      userAccessCookie,
      userRefreshCookie,
      outcome.accessToken,
      refreshToken,
      accessMaxAge,
      outcome.refreshMaxAge
    );

    if (outcome.profileTransition) {
      setProfileContextCookie(response, outcome.profileTransition);
    } else {
      clearProfileContextCookie(response);
    }

    return {
      user: outcome.user,
      accessToken: outcome.accessToken,
      refreshToken,
      accessTokenExpiresIn: accessMaxAge,
      refreshTokenExpiresIn: outcome.refreshMaxAge
    };
  }

  async requireUserRefreshSession(request: RequestLike, userId: string) {
    const session = await this.resolveRefreshSession(request, "登录状态已失效，请重新登录");

    if (session.user.id !== userId) {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    return {
      id: session.refreshTokenId,
      expiresAt: session.expiresAt,
      profileMode: session.profileMode,
      profileLearnerId: session.profileLearnerId
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const nickname = dto.nickname?.trim();

    if (!nickname) {
      throw new AppException(40001, "昵称不能为空", HttpStatus.BAD_REQUEST);
    }

    if (nickname.length < 4) {
      throw new AppException(40001, "昵称至少 4 个字符", HttpStatus.BAD_REQUEST);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        status: true
      }
    });

    if (!existingUser || existingUser.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    const duplicateNickname = await this.prisma.user.findFirst({
      where: {
        nickname,
        NOT: {
          id: userId
        }
      },
      select: {
        id: true
      }
    });

    if (duplicateNickname) {
      throw new AppException(40002, "该昵称已被其他账号使用", HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        nickname
      }
    });

    return this.toPublicUser(user);
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<PublicUser> {
    const normalizedAvatarUrl = avatarUrl.trim();

    if (!normalizedAvatarUrl) {
      throw new AppException(40001, "头像地址不能为空", HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        avatarUrl: normalizedAvatarUrl
      }
    });

    if (user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    return this.toPublicUser(user);
  }

  async changeEmail(userId: string, dto: ChangeEmailDto): Promise<PublicUser> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        email: true,
        status: true
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (user.email === email) {
      throw new AppException(40001, "新邮箱不能和当前邮箱相同", HttpStatus.BAD_REQUEST);
    }

    await this.verifyUserPassword(userId, dto.currentPassword);
    await this.assertEmailAvailable(email, userId);
    await this.verifyEmailCode(email, "CHANGE_EMAIL", dto.emailCode);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        email
      }
    });

    return this.toPublicUser(updatedUser);
  }

  async bindPhone(userId: string, dto: BindPhoneDto): Promise<PublicUser> {
    const phone = this.normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    const existingOwner = await this.prisma.user.findUnique({
      where: {
        phone
      },
      select: {
        id: true
      }
    });

    if (existingOwner && existingOwner.id !== userId) {
      throw new AppException(40002, "该手机号已绑定其他账号", HttpStatus.BAD_REQUEST);
    }

    await this.verifyUserPassword(userId, dto.currentPassword);
    await this.verifyPhoneCode(phone, "BIND_PHONE", dto.code);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        phone,
        phoneVerifiedAt: new Date()
      }
    });

    return this.toPublicUser(updatedUser);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    await this.verifyUserPassword(userId, dto.currentPassword, "当前密码错误");

    await this.updateUserPasswordAndRevokeSessions(userId, dto.newPassword);

    return {};
  }

  async verifyLoginPassword(userId: string, dto: VerifyPasswordDto) {
    await this.verifyUserPassword(userId, dto.password);

    return {
      message: "验证通过"
    };
  }

  async startUserSession(userId: string, response: ResponseLike) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40301, "账号已被禁用", HttpStatus.FORBIDDEN);
    }

    const updatedUser = await this.prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        lastLoginAt: new Date()
      }
    });

    return this.createUserSession(this.toPublicUser(updatedUser), response);
  }

  private async createUserSession(
    user: PublicUser,
    response: ResponseLike,
    initialProfile: { mode: "UNSELECTED"; learnerId: null } | { mode: "LEARNER"; learnerId: string } = {
      mode: "UNSELECTED",
      learnerId: null
    }
  ) {
    const accessMaxAge = this.getAccessMaxAge();
    const refreshMaxAge = this.getRefreshMaxAge();
    const learnerSession = initialProfile.mode === "LEARNER";
    const accessToken = signJwt(
      {
        sub: user.id,
        email: learnerSession ? learnerSessionEmail : user.email,
        type: "USER",
        ...(learnerSession ? { sessionScope: "LEARNER" as const } : {})
      },
      this.getAccessSecret(),
      accessMaxAge
    );
    const refreshToken = this.createOpaqueToken();

    const refreshSession = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        type: "USER",
        profileMode: initialProfile.mode,
        profileLearnerId: initialProfile.learnerId,
        expiresAt: new Date(Date.now() + refreshMaxAge * 1000)
      }
    });

    setAuthCookies(
      response,
      userAccessCookie,
      userRefreshCookie,
      accessToken,
      refreshToken,
      accessMaxAge,
      refreshMaxAge
    );

    if (initialProfile.mode === "LEARNER") {
      setProfileContextCookie(response, {
        token: signProfileContextToken(
          {
            userId: user.id,
            refreshTokenId: refreshSession.id,
            mode: "LEARNER",
            learnerId: initialProfile.learnerId
          },
          getProfileContextSecret(),
          refreshMaxAge
        ),
        maxAgeSeconds: refreshMaxAge
      });
    }

    return {
      user: learnerSession ? this.toLearnerSessionUser(user) : user,
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessMaxAge,
      refreshTokenExpiresIn: refreshMaxAge
    };
  }

  private async resolveRefreshSession(
    request: RequestLike,
    errorMessage: string
  ): Promise<UserRefreshSession> {
    const refreshToken = readCookie(request, userRefreshCookie);

    if (!refreshToken) {
      throw new AppException(40101, errorMessage, HttpStatus.UNAUTHORIZED);
    }

    const refreshRecord = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: this.hashToken(refreshToken),
        type: "USER",
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (!refreshRecord?.user || refreshRecord.user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    return {
      user: this.toPublicUser(refreshRecord.user),
      refreshToken,
      refreshTokenId: refreshRecord.id,
      expiresAt: refreshRecord.expiresAt,
      profileMode: refreshRecord.profileMode,
      profileLearnerId: refreshRecord.profileLearnerId
    };
  }

  private userRefreshSnapshotWhere(
    session: {
      id: string;
      userId: string | null;
      tokenHash: string;
      expiresAt: Date;
      profileMode: "UNSELECTED" | "ACCOUNT" | "LEARNER";
      profileLearnerId: string | null;
    },
    tokenHash: string
  ) {
    return {
      id: session.id,
      userId: session.userId,
      tokenHash,
      type: "USER" as const,
      revokedAt: null,
      expiresAt: session.expiresAt,
      profileMode: session.profileMode,
      profileLearnerId: session.profileLearnerId
    };
  }

  private toPublicUser(user: {
    id: string;
    accountNumber?: number;
    email: string;
    phone?: string | null;
    phoneVerifiedAt?: Date | null;
    nickname: string;
    avatarUrl?: string | null;
    status: string;
    passwordLoginEnabled: boolean;
  }): PublicUser {
    return {
      id: user.id,
      accountId: Number.isSafeInteger(user.accountNumber) ? String(user.accountNumber) : "",
      email: user.email,
      phone: user.phone ?? null,
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl ?? null,
      status: user.status,
      hasLoginPassword: user.passwordLoginEnabled === true
    };
  }

  private toLearnerSessionUser(user: PublicUser): PublicUser {
    return {
      ...user,
      email: "",
      phone: null,
      phoneVerifiedAt: null,
      nickname: "我的账号",
      avatarUrl: null
    };
  }

  private invalidLearnerCredentials() {
    return new AppException(
      40003,
      "主账号 ID、子账号 ID 或切换密码错误",
      HttpStatus.BAD_REQUEST
    );
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizePhone(value: string) {
    let phone = value.trim().replace(/[\s-]/g, "");

    if (phone.startsWith("+86")) {
      phone = phone.slice(3);
    } else if (phone.startsWith("86") && phone.length === 13) {
      phone = phone.slice(2);
    }

    if (!phonePattern.test(phone)) {
      throw new AppException(40001, "手机号格式不正确", HttpStatus.BAD_REQUEST);
    }

    return phone;
  }

  private createPhoneUserEmail(phone: string) {
    return `phone-${phone}@users.xueleai.local`;
  }

  private createSmsCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private createEmailCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private async assertEmailAvailable(email: string, currentUserId: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email
      },
      select: {
        id: true
      }
    });

    if (existingUser && existingUser.id !== currentUserId) {
      throw new AppException(40002, "该邮箱已被其他账号使用", HttpStatus.BAD_REQUEST);
    }
  }

  async verifyUserPassword(userId: string, password: string, errorMessage = "登录密码错误") {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        passwordHash: true,
        passwordLoginEnabled: true,
        status: true
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new AppException(40101, "登录状态已失效，请重新登录", HttpStatus.UNAUTHORIZED);
    }

    if (!user.passwordLoginEnabled) {
      throw new AppException(40003, "请先设置主账号登录密码", HttpStatus.BAD_REQUEST);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppException(40003, errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  private createPasswordResetToken(
    user: {
      id: string;
      email: string;
      passwordHash: string;
    },
    method: PasswordResetMethod
  ) {
    const expiresIn = this.getPasswordResetTokenTtlSeconds();
    const resetToken = signJwt(
      {
        sub: user.id,
        email: user.email,
        type: "PASSWORD_RESET",
        resetMethod: method,
        passwordHashFingerprint: this.createPasswordHashFingerprint(user.passwordHash)
      },
      this.getAccessSecret(),
      expiresIn
    );

    return {
      resetToken,
      expiresIn,
      method,
      message: "验证通过"
    };
  }

  private createPasswordHashFingerprint(passwordHash: string) {
    return createHmac("sha256", this.getRefreshSecret()).update(passwordHash).digest("hex").slice(0, 32);
  }

  private async updateUserPasswordAndRevokeSessions(userId: string, password: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: userId
        },
        data: {
          passwordHash: await hashPassword(password),
          passwordLoginEnabled: true
        }
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId,
          type: "USER",
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      })
    ]);
  }

  private async createAndSendEmailCode(email: string, purpose: EmailCodePurpose) {
    const config = await this.getAliyunMailConfig();

    if (!config) {
      throw new AppException(50001, "邮箱验证码服务暂不可用，请联系管理员", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const code = this.createEmailCode();
    const expiresIn = await this.getEmailCodeTtlSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const sent = await this.sendAliyunMailCode(email, code, config);

    await this.prisma.$transaction(async (transaction) => {
      const now = new Date();

      await transaction.emailVerificationCode.updateMany({
        where: {
          email,
          purpose,
          consumedAt: null
        },
        data: {
          consumedAt: now
        }
      });
      await transaction.emailVerificationCode.create({
        data: {
          email,
          purpose,
          codeHash: this.hashEmailCode(email, purpose, code),
          expiresAt,
          sendProvider: aliyunDirectMailProvider,
          sendRequestId: sent.requestId,
          sendStatus: sent.status
        }
      });
    });

    return expiresIn;
  }

  private hashSmsCode(phone: string, purpose: SmsCodePurpose, code: string) {
    return createHmac("sha256", this.getRefreshSecret())
      .update(`${phone}:${purpose}:${code.trim()}`)
      .digest("hex");
  }

  private hashEmailCode(email: string, purpose: EmailCodePurpose, code: string) {
    return createHmac("sha256", this.getRefreshSecret())
      .update(`${email}:${purpose}:${code.trim()}`)
      .digest("hex");
  }

  private async verifyEmailCode(email: string, purpose: EmailCodePurpose, code: string) {
    const normalizedCode = code.trim();
    const record = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!record || record.codeHash !== this.hashEmailCode(email, purpose, normalizedCode)) {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }

    const updated = await this.prisma.emailVerificationCode.updateMany({
      where: {
        id: record.id,
        email,
        purpose,
        codeHash: record.codeHash,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      data: {
        consumedAt: new Date()
      }
    });

    if (updated.count !== 1) {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }
  }

  private async verifyPhoneCode(phone: string, purpose: SmsCodePurpose, code: string) {
    const normalizedCode = code.trim();

    if (normalizedCode === defaultPhoneVerificationCode) {
      return;
    }

    const record = await this.prisma.smsVerificationCode.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!record) {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }

    if (record.sendProvider === aliyunDypnsSmsProvider) {
      const aliyunSmsConfig = await this.getAliyunSmsConfig();

      if (!aliyunSmsConfig) {
        throw new AppException(50001, "短信服务配置缺失，请联系管理员", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await this.checkAliyunSmsVerifyCode(phone, normalizedCode, aliyunSmsConfig);
      await this.prisma.smsVerificationCode.update({
        where: {
          id: record.id
        },
        data: {
          consumedAt: new Date()
        }
      });

      return;
    }

    if (record.codeHash !== this.hashSmsCode(phone, purpose, normalizedCode)) {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }

    await this.prisma.smsVerificationCode.update({
      where: {
        id: record.id
      },
      data: {
        consumedAt: new Date()
      }
    });
  }

  private async getSmsCodeTtlSeconds() {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: "smsCodeTtlSeconds"
      },
      select: {
        value: true
      }
    });
    const value = Number(config?.value ?? process.env.SMS_CODE_TTL_SECONDS);

    return Number.isFinite(value) && value > 0 ? value : defaultSmsCodeTtlSeconds;
  }

  private async getEmailCodeTtlSeconds() {
    const config = await this.prisma.systemConfig.findUnique({
      where: {
        key: "smsCodeTtlSeconds"
      },
      select: {
        value: true
      }
    });
    const value = Number(config?.value ?? process.env.EMAIL_CODE_TTL_SECONDS);

    return Number.isFinite(value) && value > 0 ? value : defaultEmailCodeTtlSeconds;
  }

  private getPasswordResetTokenTtlSeconds() {
    return parseExpiresIn(
      process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN ?? process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS,
      defaultPasswordResetTokenTtlSeconds
    );
  }

  private async getAliyunMailConfig(): Promise<AliyunMailConfig | null> {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            "emailVerificationEnabled",
            "emailVerificationProvider",
            "aliyunMailAccessKeyId",
            "aliyunMailAccessKeySecretEncrypted",
            "aliyunMailEndpoint",
            "aliyunMailRegionId",
            "aliyunMailAccountName",
            "aliyunMailFromAlias",
            "aliyunMailAddressType",
            "aliyunMailReplyToAddress",
            "aliyunMailSubject",
            "aliyunMailBodyTemplate"
          ]
        }
      }
    });
    const values = new Map(configs.map((config) => [config.key, config.value]));
    const enabled = values.get("emailVerificationEnabled") === "true";

    if (!enabled) {
      return null;
    }

    if ((values.get("emailVerificationProvider")?.trim() || aliyunDirectMailProvider) !== aliyunDirectMailProvider) {
      throw new AppException(50001, "邮件验证方案暂不可用，请联系管理员", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const accessKeyId = values.get("aliyunMailAccessKeyId")?.trim();
    const accessKeySecretEncrypted = values.get("aliyunMailAccessKeySecretEncrypted")?.trim();
    const accountName = values.get("aliyunMailAccountName")?.trim();
    const subject = values.get("aliyunMailSubject")?.trim();
    const bodyTemplate = values.get("aliyunMailBodyTemplate")?.trim();

    if (!accessKeyId || !accessKeySecretEncrypted || !accountName || !subject || !bodyTemplate) {
      throw new AppException(50001, "邮箱验证码服务暂不可用，请联系管理员", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let accessKeySecret: string;

    try {
      accessKeySecret = decryptSecret(accessKeySecretEncrypted);
    } catch {
      throw new AppException(50001, "邮件服务密钥无法解密，请在后台重新保存", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      accessKeyId,
      accessKeySecret,
      endpoint: values.get("aliyunMailEndpoint")?.trim() || aliyunDirectMailEndpoint,
      regionId: values.get("aliyunMailRegionId")?.trim() || "cn-hangzhou",
      accountName,
      fromAlias: values.get("aliyunMailFromAlias")?.trim() || "",
      addressType: values.get("aliyunMailAddressType")?.trim() || "1",
      replyToAddress: (values.get("aliyunMailReplyToAddress")?.trim() || "true") === "true",
      subject,
      bodyTemplate,
      timeoutMs: safePositiveNumber(process.env.ALIYUN_MAIL_TIMEOUT_MS, 10_000)
    };
  }

  private async getAliyunSmsConfig(): Promise<AliyunSmsConfig | null> {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            "smsVerificationEnabled",
            "smsVerificationProvider",
            "aliyunSmsAccessKeyId",
            "aliyunSmsAccessKeySecretEncrypted",
            "aliyunSmsEndpoint",
            "aliyunSmsRegionId",
            "aliyunSmsSignName",
            "aliyunSmsTemplateCode",
            "aliyunSmsTemplateParamCodeKey",
            "aliyunSmsTemplateParamExtraJson",
            "smsCodeTtlSeconds"
          ]
        }
      }
    });
    const values = new Map(configs.map((config) => [config.key, config.value]));
    const enabled = values.get("smsVerificationEnabled") === "true";

    if (enabled) {
      const provider = this.resolveAliyunSmsProvider(values.get("smsVerificationProvider"));
      const accessKeyId = values.get("aliyunSmsAccessKeyId")?.trim();
      const accessKeySecretEncrypted = values.get("aliyunSmsAccessKeySecretEncrypted")?.trim();
      const signName = values.get("aliyunSmsSignName")?.trim();
      const templateCode = values.get("aliyunSmsTemplateCode")?.trim();

      if (!accessKeyId || !accessKeySecretEncrypted || !signName || !templateCode) {
        throw new AppException(50001, "短信服务配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      let accessKeySecret: string;

      try {
        accessKeySecret = decryptSecret(accessKeySecretEncrypted);
      } catch {
        throw new AppException(50001, "短信服务密钥无法解密，请在后台重新保存", HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        provider,
        accessKeyId,
        accessKeySecret,
        endpoint: this.resolveAliyunSmsEndpoint(provider, values.get("aliyunSmsEndpoint")),
        regionId: values.get("aliyunSmsRegionId")?.trim() || "cn-hangzhou",
        signName,
        templateCode,
        templateParamCodeKey: values.get("aliyunSmsTemplateParamCodeKey")?.trim() || "code",
        templateParamExtraJson: values.get("aliyunSmsTemplateParamExtraJson")?.trim() || "{}",
        timeoutMs: safePositiveNumber(process.env.ALIYUN_SMS_TIMEOUT_MS, 10_000)
      };
    }

    const envAccessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID?.trim();
    const envAccessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET?.trim();
    const envSignName = process.env.ALIYUN_SMS_SIGN_NAME?.trim();
    const envTemplateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim();
    const envProvider = this.resolveAliyunSmsProvider(process.env.ALIYUN_SMS_PROVIDER);

    if (!envAccessKeyId || !envAccessKeySecret || !envSignName || !envTemplateCode) {
      return null;
    }

    return {
      provider: envProvider,
      accessKeyId: envAccessKeyId,
      accessKeySecret: envAccessKeySecret,
      endpoint: this.resolveAliyunSmsEndpoint(envProvider, process.env.ALIYUN_SMS_ENDPOINT),
      regionId: process.env.ALIYUN_SMS_REGION_ID?.trim() || "cn-hangzhou",
      signName: envSignName,
      templateCode: envTemplateCode,
      templateParamCodeKey: process.env.ALIYUN_SMS_TEMPLATE_PARAM_CODE_KEY?.trim() || "code",
      templateParamExtraJson: process.env.ALIYUN_SMS_TEMPLATE_PARAM_EXTRA_JSON?.trim() || "{}",
      timeoutMs: safePositiveNumber(process.env.ALIYUN_SMS_TIMEOUT_MS, 10_000)
    };
  }

  private async sendAliyunMailCode(email: string, code: string, config: AliyunMailConfig) {
    const payload = await this.requestAliyunMailApi(
      {
        AccountName: config.accountName,
        AddressType: config.addressType,
        ReplyToAddress: String(config.replyToAddress),
        ToAddress: email,
        Subject: config.subject,
        HtmlBody: config.bodyTemplate.replace(/\$\{code\}/g, code),
        ...(config.fromAlias ? { FromAlias: config.fromAlias } : {})
      },
      config,
      "邮箱验证码发送失败"
    );

    return {
      requestId: payload.RequestId ?? payload.EnvId ?? null,
      status: payload.Code ?? "OK"
    };
  }

  private async requestAliyunMailApi(
    actionParams: Record<string, string>,
    config: AliyunMailConfig,
    errorPrefix: string
  ) {
    const params: Record<string, string> = {
      AccessKeyId: config.accessKeyId,
      Action: "SingleSendMail",
      Format: "JSON",
      RegionId: config.regionId,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: randomBytes(16).toString("hex"),
      SignatureVersion: "1.0",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: "2015-11-23",
      ...actionParams
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((key) => `${this.aliyunEncode(key)}=${this.aliyunEncode(params[key] ?? "")}`)
      .join("&");
    const stringToSign = `POST&%2F&${this.aliyunEncode(canonicalQuery)}`;
    const signature = createHmac("sha1", `${config.accessKeySecret}&`).update(stringToSign).digest("base64");
    const body = new URLSearchParams({
      ...params,
      Signature: signature
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body,
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as {
        Code?: string;
        EnvId?: string;
        Message?: string;
        RequestId?: string;
      } | null;

      if (!response.ok || !payload || (payload.Code && payload.Code !== "OK")) {
        throw new AppException(
          50201,
          this.formatAliyunMailError(errorPrefix, payload),
          HttpStatus.BAD_GATEWAY
        );
      }

      return payload ?? {};
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(50201, `${errorPrefix}：阿里云邮件接口请求超时或不可用`, HttpStatus.BAD_GATEWAY);
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatAliyunMailError(
    errorPrefix: string,
    payload: {
      Code?: string;
      Message?: string;
    } | null
  ) {
    const code = payload?.Code ?? "";
    const message = payload?.Message ?? "";

    if (code.includes("Forbidden") || code.includes("Unauthorized") || /not authorized/i.test(message)) {
      return `${errorPrefix}：当前阿里云 AccessKey 没有邮件推送权限，请在 RAM 中授予 DirectMail 相关权限后重试`;
    }

    if (code === "FUNCTION_NOT_OPENED" || /not opened this function/i.test(message)) {
      return `${errorPrefix}：阿里云邮件推送服务尚未开通，请在阿里云控制台开通后重试`;
    }

    return `${errorPrefix}：${message || code || "阿里云邮件接口异常"}`;
  }

  private async sendAliyunStandardSmsCode(
    phone: string,
    code: string,
    expiresIn: number,
    config: AliyunSmsConfig
  ) {
    const templateParams = this.buildAliyunSmsTemplateParams(config, code, expiresIn, false);
    let payload: Awaited<ReturnType<typeof this.requestAliyunSmsApi>>;

    try {
      payload = await this.requestAliyunSmsApi(
        "SendSms",
        this.buildAliyunStandardSmsParams(phone, config, templateParams),
        config,
        "短信验证码发送失败"
      );
    } catch (error) {
      if (error instanceof AppException && this.shouldRetryAliyunSmsWithMinParam(error, templateParams)) {
        payload = await this.requestAliyunSmsApi(
          "SendSms",
          this.buildAliyunStandardSmsParams(
            phone,
            config,
            this.buildAliyunSmsTemplateParams(config, code, expiresIn, true)
          ),
          config,
          "短信验证码发送失败"
        );
      } else {
        throw error;
      }
    }

    return {
      requestId: payload.RequestId ?? null,
      status: payload.Code ?? "OK"
    };
  }

  private async sendAliyunSmsVerifyCode(phone: string, expiresIn: number, config: AliyunSmsConfig) {
    const templateParams = this.buildAliyunDypnsTemplateParams(config, expiresIn, false);
    let payload: Awaited<ReturnType<typeof this.requestAliyunSmsApi>>;

    try {
      payload = await this.requestAliyunSmsApi(
        "SendSmsVerifyCode",
        this.buildAliyunSmsVerifyCodeParams(phone, expiresIn, config, templateParams),
        config,
        "短信验证码发送失败"
      );
    } catch (error) {
      if (error instanceof AppException && this.shouldRetryAliyunSmsWithMinParam(error, templateParams)) {
        payload = await this.requestAliyunSmsApi(
          "SendSmsVerifyCode",
          this.buildAliyunSmsVerifyCodeParams(
            phone,
            expiresIn,
            config,
            this.buildAliyunDypnsTemplateParams(config, expiresIn, true)
          ),
          config,
          "短信验证码发送失败"
        );
      } else {
        throw error;
      }
    }

    return {
      requestId: payload.RequestId ?? null,
      status: payload.Code ?? "OK"
    };
  }

  private buildAliyunStandardSmsParams(
    phone: string,
    config: AliyunSmsConfig,
    templateParams: Record<string, string>
  ) {
    return {
      PhoneNumbers: phone,
      SignName: config.signName,
      TemplateCode: config.templateCode,
      TemplateParam: JSON.stringify(templateParams)
    };
  }

  private buildAliyunSmsVerifyCodeParams(
    phone: string,
    expiresIn: number,
    config: AliyunSmsConfig,
    templateParams: Record<string, string>
  ) {
    return {
      PhoneNumber: phone,
      SignName: config.signName,
      TemplateCode: config.templateCode,
      TemplateParam: JSON.stringify(templateParams),
      CodeType: "1",
      CodeLength: "6",
      ValidTime: String(expiresIn)
    };
  }

  private buildAliyunSmsTemplateParams(
    config: AliyunSmsConfig,
    code: string,
    expiresIn: number,
    includeDefaultMin: boolean
  ) {
    const templateParams = this.parseAliyunSmsTemplateExtraParams(config.templateParamExtraJson);

    if (includeDefaultMin && !Object.hasOwn(templateParams, "min")) {
      templateParams.min = String(Math.ceil(expiresIn / 60));
    }

    templateParams[config.templateParamCodeKey] = code;

    return templateParams;
  }

  private buildAliyunDypnsTemplateParams(config: AliyunSmsConfig, expiresIn: number, includeDefaultMin: boolean) {
    const templateParams = this.parseAliyunSmsTemplateExtraParams(config.templateParamExtraJson);

    if (includeDefaultMin && !Object.hasOwn(templateParams, "min")) {
      templateParams.min = String(Math.ceil(expiresIn / 60));
    }

    templateParams[config.templateParamCodeKey] = "##code##";

    return templateParams;
  }

  private parseAliyunSmsTemplateExtraParams(value: string) {
    if (!value.trim()) {
      return {} as Record<string, string>;
    }

    try {
      const parsed = JSON.parse(value) as unknown;

      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("invalid json");
      }

      return Object.fromEntries(
        Object.entries(parsed).map(([key, entryValue]) => [key, String(entryValue)])
      ) as Record<string, string>;
    } catch {
      throw new AppException(50001, "短信模板扩展参数 JSON 格式不正确，请在后台邮件短信配置中修正", HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private shouldRetryAliyunSmsWithMinParam(error: AppException, templateParams: Record<string, string>) {
    if (Object.hasOwn(templateParams, "min")) {
      return false;
    }

    return /模板内容与模板参数|template/i.test(error.message);
  }

  private async checkAliyunSmsVerifyCode(phone: string, code: string, config: AliyunSmsConfig) {
    const payload = await this.requestAliyunSmsApi(
      "CheckSmsVerifyCode",
      {
        PhoneNumber: phone,
        VerifyCode: code
      },
      config,
      "短信验证码校验失败"
    );
    const model = payload.Model;
    const verifyResult = typeof model === "string" ? model : model?.VerifyResult;

    if (verifyResult !== "PASS") {
      throw new AppException(40003, "验证码错误或已过期", HttpStatus.BAD_REQUEST);
    }
  }

  private async requestAliyunSmsApi(
    action: string,
    actionParams: Record<string, string>,
    config: AliyunSmsConfig,
    errorPrefix: string
  ) {
    const params: Record<string, string> = {
      AccessKeyId: config.accessKeyId,
      Action: action,
      Format: "JSON",
      RegionId: config.regionId,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: randomBytes(16).toString("hex"),
      SignatureVersion: "1.0",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: "2017-05-25",
      ...actionParams
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((key) => `${this.aliyunEncode(key)}=${this.aliyunEncode(params[key] ?? "")}`)
      .join("&");
    const stringToSign = `POST&%2F&${this.aliyunEncode(canonicalQuery)}`;
    const signature = createHmac("sha1", `${config.accessKeySecret}&`).update(stringToSign).digest("base64");
    const body = new URLSearchParams({
      ...params,
      Signature: signature
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body,
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as {
        Code?: string;
        Message?: string;
        RequestId?: string;
        AccessDeniedDetail?: string;
        Model?: {
          VerifyResult?: string;
        } | string;
      } | null;

      if (!response.ok || payload?.Code !== "OK") {
        throw new AppException(
          50201,
          this.formatAliyunSmsError(errorPrefix, payload),
          HttpStatus.BAD_GATEWAY
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(50201, `${errorPrefix}：阿里云短信接口请求超时或不可用`, HttpStatus.BAD_GATEWAY);
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatAliyunSmsError(
    errorPrefix: string,
    payload: {
      Code?: string;
      Message?: string;
      AccessDeniedDetail?: string;
    } | null
  ) {
    const code = payload?.Code ?? "";
    const message = payload?.Message ?? "";
    const accessDeniedDetail = payload?.AccessDeniedDetail ? `，详情：${payload.AccessDeniedDetail}` : "";

    if (code.includes("Forbidden") || code.includes("Unauthorized") || /not authorized/i.test(message)) {
      return `${errorPrefix}：当前阿里云 AccessKey 没有号码认证服务权限，请在 RAM 中授予 dypns:SendSmsVerifyCode 和 dypns:CheckSmsVerifyCode，或绑定 AliyunDypnsFullAccess 后重试${accessDeniedDetail}`;
    }

    if (code === "FUNCTION_NOT_OPENED" || /not opened this function/i.test(message)) {
      return `${errorPrefix}：阿里云号码认证服务或短信验证码能力尚未开通，请在阿里云控制台开通后重试`;
    }

    return `${errorPrefix}：${message || code || "阿里云短信接口异常"}`;
  }

  private resolveAliyunSmsProvider(provider?: string | null): AliyunSmsProvider {
    return provider?.trim() === aliyunDypnsSmsProvider ? aliyunDypnsSmsProvider : aliyunStandardSmsProvider;
  }

  private resolveAliyunSmsEndpoint(provider: AliyunSmsProvider, endpoint?: string | null) {
    const normalizedEndpoint = endpoint?.trim();

    if (provider === aliyunStandardSmsProvider) {
      if (!normalizedEndpoint || normalizedEndpoint.includes("dypnsapi.aliyuncs.com")) {
        return aliyunStandardSmsEndpoint;
      }

      return normalizedEndpoint;
    }

    if (!normalizedEndpoint || normalizedEndpoint.includes("dysmsapi.aliyuncs.com")) {
      return aliyunDypnsEndpoint;
    }

    return normalizedEndpoint;
  }

  private aliyunEncode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }

  private getAccessSecret() {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new AppException(50001, "认证服务配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return secret;
  }

  private createOpaqueToken() {
    return randomBytes(48).toString("base64url");
  }

  private hashToken(token: string) {
    return createHmac("sha256", this.getRefreshSecret()).update(token).digest("hex");
  }

  private getRefreshSecret() {
    const secret = process.env.JWT_REFRESH_SECRET;

    if (!secret) {
      throw new AppException(50001, "认证服务配置缺失", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return secret;
  }

  private getAccessMaxAge() {
    return parseExpiresIn(process.env.JWT_ACCESS_EXPIRES_IN, defaultAccessSessionSeconds);
  }

  private getRefreshMaxAge() {
    return parseExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN, defaultPersistentSessionSeconds);
  }
}

function safePositiveNumber(value: string | number | undefined | null, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}
