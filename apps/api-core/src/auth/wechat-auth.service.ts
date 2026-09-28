import { rewardNewReferral } from "../referrals/referral.service.js";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { hashPassword, type Prisma } from "@xueleai/database";
import type { ResponseLike } from "../security/cookies.js";
import { AuthService } from "./auth.service.js";
import {
  resolveWechatOAuthChannel,
  WechatOAuthClient
} from "./wechat-oauth.client.js";
import {
  WECHAT_OAUTH_STATE_STORE,
  type WechatOAuthStateStore
} from "./wechat-oauth-state.store.js";
import {
  WechatAuthError,
  type WechatIdentity,
  type WechatOAuthChannel
} from "./wechat-auth.types.js";

const stateTtlSeconds = 10 * 60;

interface WechatAuthUser {
  id: string;
  email: string;
  passwordHash: string;
  nickname: string;
  avatarUrl: string | null;
  status: string;
  wechatOpenId: string | null;
  wechatMpOpenId: string | null;
  wechatWebOpenId: string | null;
  wechatUnionId: string | null;
  lastLoginAt: Date | null;
}

interface WechatUserCreateData {
  email: string;
  passwordHash: string;
  nickname: string;
  avatarUrl: string | null;
  wechatMpOpenId?: string;
  wechatWebOpenId?: string;
  wechatUnionId: string;
  lastLoginAt: Date;
  wallet: { create: Record<string, never> };
}

export interface WechatAuthPrisma {
  $transaction?<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  user: {
    findUnique(input: {
      where: Partial<
        Record<"id" | "wechatMpOpenId" | "wechatWebOpenId" | "wechatUnionId", string>
      >;
    }): Promise<WechatAuthUser | null>;
    update(input: {
      where: { id: string };
      data: Partial<WechatAuthUser>;
    }): Promise<WechatAuthUser>;
    create(input: { data: WechatUserCreateData }): Promise<WechatAuthUser>;
  };
}

export interface WechatSessionStarter {
  startUserSession(userId: string, response: ResponseLike): Promise<unknown>;
}

interface WechatOAuthProvider {
  buildAuthorizationUrl(channel: WechatOAuthChannel, state: string): string;
  fetchIdentity(channel: WechatOAuthChannel, code: string): Promise<WechatIdentity>;
}

export const WECHAT_AUTH_PRISMA = Symbol("WECHAT_AUTH_PRISMA");

export function safeWechatNextPath(value: string | undefined) {
  const next = value?.trim() ?? "";

  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    /[\r\n]/u.test(next) ||
    /^\/admin(?:\/|$|\?|#)/u.test(next) ||
    next.length > 2048
  ) {
    return "/";
  }

  return next;
}

function equalOpaqueState(left: string | null, right: string | undefined) {
  if (!left || !right) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

@Injectable()
export class WechatAuthService {
  constructor(
    @Inject(WechatOAuthClient)
    private readonly oauthClient: WechatOAuthProvider,
    @Inject(WECHAT_OAUTH_STATE_STORE)
    private readonly stateStore: WechatOAuthStateStore,
    @Inject(AuthService)
    private readonly authService: WechatSessionStarter,
    @Inject(WECHAT_AUTH_PRISMA)
    private readonly prisma: WechatAuthPrisma
  ) {}

  async createAuthorization(
    userAgent: string | null,
    nextValue: string | undefined
  ) {
    const channel = this.resolveChannel(userAgent);
    const state = randomBytes(32).toString("base64url");
    const next = safeWechatNextPath(nextValue);

    await this.stateStore.put(
      state,
      {
        channel,
        next,
        issuedAt: Date.now()
      },
      stateTtlSeconds
    );

    return {
      channel,
      state,
      url: this.oauthClient.buildAuthorizationUrl(channel, state),
      maxAgeSeconds: stateTtlSeconds
    };
  }

  async completeAuthorization(input: {
    code: string | undefined;
    state: string | undefined;
    stateCookie: string | null;
    referralToken?: string | null;
    response: ResponseLike;
  }) {
    if (!equalOpaqueState(input.stateCookie, input.state)) {
      throw new WechatAuthError("state");
    }

    const record = await this.stateStore.consume(input.state ?? "");
    if (!record) {
      throw new WechatAuthError("state");
    }

    try {
      const identity = await this.oauthClient.fetchIdentity(
        record.channel,
        input.code ?? ""
      );
      if (identity.channel !== record.channel) {
        throw new WechatAuthError("upstream");
      }

      const user = await this.resolveUser(identity, input.referralToken);
      await this.authService.startUserSession(user.id, input.response);
      return { next: record.next };
    } catch (error) {
      if (error instanceof WechatAuthError) {
        throw new WechatAuthError(error.code, record.next);
      }
      throw new WechatAuthError("upstream", record.next);
    }
  }

  private resolveChannel(userAgent: string | null) {
    const channel = resolveWechatOAuthChannel(userAgent);
    if (!channel) {
      throw new WechatAuthError("mobile_browser");
    }
    return channel;
  }

  private async resolveUser(identity: WechatIdentity, referralToken?: string | null): Promise<WechatAuthUser> {
    const owners = await this.findIdentityOwners(identity);
    const existing = this.selectIdentityOwner(owners.byUnion, owners.byOpenId, identity);

    if (existing) {
      return this.updateWechatIdentity(existing, identity);
    }

    try {
      return await this.createWechatUser(identity, referralToken);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const raceOwners = await this.findIdentityOwners(identity);
      const raceWinner = this.selectIdentityOwner(
        raceOwners.byUnion,
        raceOwners.byOpenId,
        identity
      );
      if (!raceWinner) {
        throw new WechatAuthError("identity_conflict");
      }
      return this.updateWechatIdentity(raceWinner, identity);
    }
  }

  private async findIdentityOwners(identity: WechatIdentity) {
    const openIdWhere =
      identity.channel === "MP"
        ? { wechatMpOpenId: identity.openId }
        : { wechatWebOpenId: identity.openId };
    const [byUnion, byOpenId] = await Promise.all([
      this.prisma.user.findUnique({
        where: { wechatUnionId: identity.unionId }
      }),
      this.prisma.user.findUnique({ where: openIdWhere })
    ]);
    return { byUnion, byOpenId };
  }

  private selectIdentityOwner(
    byUnion: WechatAuthUser | null,
    byOpenId: WechatAuthUser | null,
    identity: WechatIdentity
  ) {
    if (byUnion && byOpenId && byUnion.id !== byOpenId.id) {
      throw new WechatAuthError("identity_conflict");
    }

    const existing = byUnion ?? byOpenId;
    if (!existing) {
      return null;
    }
    if (existing.status !== "ACTIVE") {
      throw new WechatAuthError("disabled");
    }
    if (existing.wechatUnionId && existing.wechatUnionId !== identity.unionId) {
      throw new WechatAuthError("identity_conflict");
    }

    const channelOpenId =
      identity.channel === "MP"
        ? existing.wechatMpOpenId
        : existing.wechatWebOpenId;
    if (channelOpenId && channelOpenId !== identity.openId) {
      throw new WechatAuthError("identity_conflict");
    }

    return existing;
  }

  private updateWechatIdentity(
    existing: WechatAuthUser,
    identity: WechatIdentity
  ) {
    const data: Partial<WechatAuthUser> = {
      wechatUnionId: identity.unionId,
      lastLoginAt: new Date()
    };
    if (identity.channel === "MP") {
      data.wechatMpOpenId = identity.openId;
    } else {
      data.wechatWebOpenId = identity.openId;
    }
    if (!existing.nickname.trim()) {
      data.nickname = identity.nickname.trim() || "微信用户";
    }
    if (!existing.avatarUrl?.trim() && identity.avatarUrl) {
      data.avatarUrl = identity.avatarUrl;
    }

    return this.prisma.user.update({
      where: { id: existing.id },
      data
    });
  }

  private async createWechatUser(identity: WechatIdentity, referralToken?: string | null) {
    const data: WechatUserCreateData = {
      email: `wechat-${this.identityDigest(identity.unionId)}@users.xueleai.local`,
      passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
      nickname: identity.nickname.trim() || "微信用户",
      avatarUrl: identity.avatarUrl,
      wechatUnionId: identity.unionId,
      lastLoginAt: new Date(),
      wallet: { create: {} }
    };
    if (identity.channel === "MP") {
      data.wechatMpOpenId = identity.openId;
    } else {
      data.wechatWebOpenId = identity.openId;
    }

    if (referralToken) {
      if (!this.prisma.$transaction) throw new WechatAuthError("upstream");
      return this.prisma.$transaction(async tx => {
        const user = await tx.user.create({ data });
        await rewardNewReferral(tx, user.id, referralToken);
        return user;
      });
    }
    return this.prisma.user.create({ data });
  }

  private identityDigest(unionId: string) {
    const secret = process.env.JWT_ACCESS_SECRET?.trim();
    if (!secret) {
      throw new WechatAuthError("config");
    }
    return createHmac("sha256", secret).update(unionId).digest("hex").slice(0, 32);
  }
}
