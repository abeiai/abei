import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  hashPassword,
  type PrismaClient,
  type Prisma,
} from "@xueleai/database";
import { rewardNewReferral } from "../referrals/referral.service.js";
import type { ResponseLike } from "../security/cookies.js";
import { AuthService } from "./auth.service.js";
import { WechatMpClient, type WechatMpProvider } from "./wechat-mp.client.js";
import {
  scanKey,
  WECHAT_SCAN_STORE,
  type WechatScanStore,
} from "./wechat-mp.store.js";
import {
  recordOf,
  safeWechatNextPath,
  WechatAuthError,
  type RecordOf,
  type ScanRecord,
  type WechatIdentity,
} from "./wechat-mp.types.js";
export { safeWechatNextPath } from "./wechat-mp.types.js";
export const WECHAT_AUTH_PRISMA = Symbol("WECHAT_AUTH_PRISMA"),
  WECHAT_SCAN_CLOCK = Symbol("WECHAT_SCAN_CLOCK");
interface SessionStarter {
  startUserSession(id: string, response: ResponseLike): Promise<unknown>;
  sendWechatPhoneCode(
    phone: string,
  ): Promise<{ verificationId: string; expiresIn: number; message: string }>;
  verifyWechatPhoneCode(
    phone: string,
    code: string,
    verificationId: string,
  ): Promise<void>;
  verifyWechatEmailPassword(
    email: string,
    password: string,
  ): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    passwordLoginEnabled: boolean;
  }>;
}
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function uniqueError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
function phoneNumber(value: string) {
  if (!/^1[3-9]\d{9}$/.test(value)) throw new WechatAuthError("phone");
  return value;
}
@Injectable()
export class WechatAuthService {
  constructor(
    @Inject(WechatMpClient) private readonly provider: WechatMpProvider,
    @Inject(WECHAT_SCAN_STORE) private readonly store: WechatScanStore,
    @Inject(AuthService) private readonly auth: SessionStarter,
    @Inject(WECHAT_AUTH_PRISMA) private readonly prisma: PrismaClient,
    @Optional()
    @Inject(WECHAT_SCAN_CLOCK)
    private readonly clock: () => number = Date.now,
  ) {}
  private key(kind: string, value: string) {
    return scanKey(this.provider.config().appId, kind, value);
  }
  private contextKey(id: string) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw new WechatAuthError("state");
    return this.key("context", id);
  }
  private context(record: ScanRecord | null | undefined, csrf?: string) {
    const context = recordOf(record, "CONTEXT");
    if (!context || context.expiresAt <= this.clock())
      throw new WechatAuthError("state");
    if (csrf !== undefined && !equal(context.csrf, csrf))
      throw new WechatAuthError("csrf");
    return context;
  }
  private challenge(record: ScanRecord | null | undefined) {
    const challenge = recordOf(record, "CHALLENGE");
    if (!challenge || challenge.expiresAt <= this.clock())
      throw new WechatAuthError("state");
    return challenge;
  }
  async bootstrap(id: string | null) {
    this.provider.config();
    if (id && /^[A-Za-z0-9_-]{16,128}$/.test(id)) {
      const existing = recordOf(
        await this.store.read(this.contextKey(id)),
        "CONTEXT",
      );
      if (existing && existing.expiresAt > this.clock())
        return {
          contextId: id,
          csrfToken: existing.csrf,
          registrationEnabled: this.provider.config().registrationEnabled,
        };
    }
    const contextId = randomBytes(32).toString("base64url"),
      csrfToken = randomBytes(32).toString("base64url");
    await this.store.atomic([this.contextKey(contextId)], (values) => {
      values[0] = {
        kind: "CONTEXT",
        expiresAt: this.clock() + 600_000,
        csrf: csrfToken,
        busy: false,
        activeId: null,
        pendingId: null,
      };
      return { values, result: null };
    });
    return {
      contextId,
      csrfToken,
      registrationEnabled: this.provider.config().registrationEnabled,
    };
  }
  async createChallenge(
    contextId: string,
    csrf: string,
    next: unknown,
    referralToken: string | null,
  ) {
    const ctxKey = this.contextKey(contextId);
    this.context(await this.store.read(ctxKey), csrf);
    const id = randomBytes(16).toString("base64url"),
      scene = "ABEI2_L_" + randomBytes(16).toString("hex"),
      qrcode = await this.provider.createQrcode(scene);
    const expiresAt = this.clock() + Math.min(180, qrcode.expiresIn) * 1000;
    const snapshot = this.context(await this.store.read(ctxKey), csrf),
      oldKey = snapshot.activeId
        ? this.key("challenge", snapshot.activeId)
        : this.key("unused", id);
    await this.store.atomic(
      [ctxKey, this.key("challenge", id), this.key("scene", scene), oldKey],
      (values) => {
        const context = this.context(values[0], csrf);
        if (context.busy || context.activeId !== snapshot.activeId)
          throw new WechatAuthError("state");
        const old = recordOf(values[3], "CHALLENGE");
        if (old && old.status !== "CONSUMED") old.status = "CANCELLED";
        context.activeId = id;
        context.pendingId = null;
        context.expiresAt = this.clock() + 600_000;
        values[1] = {
          kind: "CHALLENGE",
          expiresAt,
          id,
          scene,
          contextKey: ctxKey,
          status: "WAITING",
          openId: null,
          confirmationCode: null,
          next: safeWechatNextPath(next),
          referralToken,
        };
        values[2] = { kind: "SCENE", id, expiresAt };
        return { values, result: null };
      },
    );
    return { challengeId: id, qrcodeUrl: qrcode.url, expiresAt };
  }
  async poll(contextId: string, id: string) {
    const ctxKey = this.contextKey(contextId),
      context = this.context(await this.store.read(ctxKey)),
      challenge = this.challenge(
        await this.store.read(this.key("challenge", id)),
      );
    if (context.activeId !== id || challenge.contextKey !== ctxKey)
      throw new WechatAuthError("state");
    return {
      status: challenge.status,
      expiresAt: challenge.expiresAt,
      ...(challenge.status === "SCANNED"
        ? { confirmationCode: challenge.confirmationCode! }
        : {}),
    };
  }
  async cancel(contextId: string, csrf: string, id: string) {
    const ctxKey = this.contextKey(contextId);
    await this.store.atomic([ctxKey, this.key("challenge", id)], (values) => {
      const context = this.context(values[0], csrf),
        challenge = this.challenge(values[1]);
      if (context.busy) throw new WechatAuthError("state");
      if (context.activeId !== id || challenge.contextKey !== ctxKey)
        throw new WechatAuthError("state");
      if (challenge.status !== "CONSUMED") challenge.status = "CANCELLED";
      context.activeId = null;
      return { values, result: null };
    });
  }
  async withAlternativeLogin<T>(
    contextId: string | null,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!contextId || !/^[A-Za-z0-9_-]{16,128}$/.test(contextId))
      return operation();
    const key = this.contextKey(contextId);
    const claimed = await this.store.atomic([key], (values) => {
      const context = recordOf(values[0], "CONTEXT");
      if (!context || context.expiresAt <= this.clock())
        return { values, result: false };
      if (context.busy) throw new WechatAuthError("state");
      context.busy = true;
      context.expiresAt = this.clock() + 600_000;
      context.activeId = null;
      context.pendingId = null;
      return { values, result: true };
    });
    try {
      return await operation();
    } finally {
      if (claimed)
        await this.store.atomic([key], (values) => {
          values[0] = null;
          return { values, result: null };
        });
    }
  }
  private eventKey(message: Record<string, string>) {
    return this.key(
      "event",
      JSON.stringify([
        message.FromUserName,
        message.CreateTime,
        message.MsgId ?? "",
        message.MsgType,
        message.Event ?? "",
        message.EventKey ?? "",
        message.Content ?? "",
      ]),
    );
  }
  async handleMessage(message: Record<string, string>): Promise<string | null> {
    const event = (message.Event ?? "").toLowerCase();
    if (
      message.MsgType === "event" &&
      (event === "subscribe" || event === "scan")
    ) {
      const scene =
        event === "subscribe"
          ? (message.EventKey ?? "").replace(/^qrscene_/, "")
          : (message.EventKey ?? "");
      if (!/^ABEI2_L_[a-f0-9]{32}$/.test(scene)) return null;
      return this.scan(message, scene);
    }
    if (message.MsgType === "text") {
      const match = /^登录\s*(\d{6})$/.exec((message.Content ?? "").trim());
      if (match) return this.confirm(message, match[1]!);
    }
    if (message.MsgType === "event" && event === "unsubscribe")
      await this.confirm(message, null);
    return null;
  }
  private async scan(message: Record<string, string>, scene: string) {
    const sceneKey = this.key("scene", scene),
      lookup = recordOf(await this.store.read(sceneKey), "SCENE");
    if (!lookup) return "二维码已失效，请返回网页刷新。";
    const challengeKey = this.key("challenge", lookup.id),
      snapshot = recordOf(await this.store.read(challengeKey), "CHALLENGE");
    if (!snapshot) return "二维码已失效，请返回网页刷新。";
    return this.store.atomic(
      [
        sceneKey,
        challengeKey,
        snapshot.contextKey,
        this.key("openid", message.FromUserName!),
        this.eventKey(message),
      ],
      (values) => {
        const previous = recordOf(values[4], "EVENT");
        if (previous) return { values, result: previous.reply };
        const challenge = recordOf(values[1], "CHALLENGE"),
          context = recordOf(values[2], "CONTEXT");
        const reply =
          "请返回你正在登录的阿贝页面查看确认码，回复「登录 确认码」。";
        if (
          !recordOf(values[0], "SCENE") ||
          !challenge ||
          !context ||
          challenge.expiresAt <= this.clock() ||
          context.activeId !== challenge.id ||
          challenge.status === "CANCELLED" ||
          challenge.status === "CONSUMED"
        )
          return { values, result: "二维码已失效，请返回网页刷新。" };
        if (challenge.openId && challenge.openId !== message.FromUserName)
          return { values, result: "此二维码已被扫描，请返回网页刷新。" };
        if (challenge.status === "WAITING") {
          const existing = recordOf(values[3], "OPENID"),
            entries = (existing?.entries ?? []).filter(
              (x) => x.expiresAt > this.clock(),
            );
          if (entries.length >= 8)
            return { values, result: "登录请求过多，请稍后重试。" };
          let code = String(randomInt(100000, 1000000));
          while (entries.some((x) => x.code === code))
            code = String(randomInt(100000, 1000000));
          challenge.openId = message.FromUserName!;
          challenge.confirmationCode = code;
          challenge.status = "SCANNED";
          values[3] = {
            kind: "OPENID",
            expiresAt: Math.max(
              challenge.expiresAt,
              ...entries.map((x) => x.expiresAt),
            ),
            failures: existing?.failures ?? 0,
            entries: [
              ...entries,
              { id: challenge.id, code, expiresAt: challenge.expiresAt },
            ],
          };
        }
        values[4] = { kind: "EVENT", expiresAt: this.clock() + 300_000, reply };
        return { values, result: reply };
      },
    );
  }
  private async confirm(message: Record<string, string>, code: string | null) {
    const indexKey = this.key("openid", message.FromUserName!),
      eventKey = this.eventKey(message),
      snapshot = recordOf(await this.store.read(indexKey), "OPENID");
    if (!snapshot) return "登录已失效，请返回网页刷新二维码。";
    const ids = snapshot.entries.map((x) => x.id),
      keys = ids.map((id) => this.key("challenge", id));
    return this.store.atomic([indexKey, eventKey, ...keys], (values) => {
      const previous = recordOf(values[1], "EVENT");
      if (previous) return { values, result: previous.reply };
      const index = recordOf(values[0], "OPENID");
      if (
        !index ||
        JSON.stringify(index.entries) !== JSON.stringify(snapshot.entries)
      )
        throw new WechatAuthError("state");
      const candidates = values
        .slice(2)
        .map((x) => recordOf(x, "CHALLENGE"))
        .filter(
          (x): x is RecordOf<"CHALLENGE"> =>
            !!x &&
            x.expiresAt > this.clock() &&
            x.openId === message.FromUserName &&
            (x.status === "SCANNED" || x.status === "CONFIRMED"),
        );
      let reply = "确认码错误或已失效，请核对网页上的确认码。";
      if (code === null) {
        for (const challenge of candidates) challenge.status = "CANCELLED";
        reply = "登录已取消。";
      } else {
        const matching = candidates.filter((x) => x.confirmationCode === code);
        if (matching.length === 1 && index.failures < 5) {
          matching[0]!.status = "CONFIRMED";
          reply = "确认成功，请返回阿贝网页。";
        } else {
          index.failures++;
          if (index.failures >= 5) {
            for (const challenge of candidates) challenge.status = "CANCELLED";
            reply = "尝试次数过多，请返回网页刷新二维码。";
          }
        }
      }
      values[1] = { kind: "EVENT", expiresAt: this.clock() + 300_000, reply };
      return { values, result: reply };
    });
  }
  private async knownUser(identity: WechatIdentity) {
    const byOpenId = await this.prisma.user.findUnique({
        where: { wechatMpOpenId: identity.openId },
      }),
      byUnion = identity.unionId
        ? await this.prisma.user.findUnique({
            where: { wechatUnionId: identity.unionId },
          })
        : null;
    if (byOpenId && byUnion && byOpenId.id !== byUnion.id)
      throw new WechatAuthError("identity_conflict");
    const user = byOpenId ?? byUnion;
    if (user?.status !== "ACTIVE" && user)
      throw new WechatAuthError("disabled");
    if (
      user &&
      identity.unionId &&
      user.wechatUnionId &&
      user.wechatUnionId !== identity.unionId
    )
      throw new WechatAuthError("identity_conflict");
    if (user?.wechatMpOpenId && user.wechatMpOpenId !== identity.openId)
      throw new WechatAuthError("identity_conflict");
    return user;
  }
  private async session(id: string, next: string, response: ResponseLike) {
    await this.auth.startUserSession(id, response);
    return {
      status: "AUTHENTICATED" as const,
      next:
        "/select-profile?next=" + encodeURIComponent(safeWechatNextPath(next)),
    };
  }
  async complete(
    contextId: string,
    csrf: string,
    id: string,
    response: ResponseLike,
  ) {
    const ctxKey = this.contextKey(contextId),
      challenge = await this.store.atomic(
        [ctxKey, this.key("challenge", id)],
        (values) => {
          const context = this.context(values[0], csrf),
            record = this.challenge(values[1]);
          if (
            context.activeId !== id ||
            record.contextKey !== ctxKey ||
            record.status !== "CONFIRMED" ||
            !record.openId
          )
            throw new WechatAuthError("state");
          record.status = "CONSUMED";
          context.busy = true;
          return { values, result: structuredClone(record) };
        },
      );
    try {
      const identity = await this.provider.identity(challenge.openId!);
      if (
        identity.appId !== this.provider.config().appId ||
        identity.openId !== challenge.openId
      )
        throw new WechatAuthError("identity_conflict");
      const user = await this.knownUser(identity);
      if (user) {
        const updated = await this.prisma.user.updateMany({
          where: {
            id: user.id,
            status: "ACTIVE",
            wechatMpOpenId: user.wechatMpOpenId,
            wechatUnionId: user.wechatUnionId,
          },
          data: {
            wechatMpOpenId: identity.openId,
            ...(identity.unionId ? { wechatUnionId: identity.unionId } : {}),
          },
        });
        if (updated.count !== 1) throw new WechatAuthError("identity_conflict");
        const result = await this.session(user.id, challenge.next, response);
        await this.store.atomic([ctxKey], (values) => {
          const context = recordOf(values[0], "CONTEXT");
          if (context?.activeId === id) values[0] = null;
          return { values, result: null };
        });
        return result;
      }
      const pendingId = randomBytes(16).toString("base64url");
      await this.store.atomic(
        [ctxKey, this.key("pending", pendingId)],
        (values) => {
          const context = this.context(values[0], csrf);
          if (context.activeId !== id) throw new WechatAuthError("state");
          context.activeId = null;
          context.pendingId = pendingId;
          context.busy = false;
          values[1] = {
            kind: "PENDING",
            expiresAt: this.clock() + 300_000,
            id: pendingId,
            contextKey: ctxKey,
            openId: identity.openId,
            unionId: identity.unionId,
            next: challenge.next,
            referralToken: challenge.referralToken,
            status: "READY",
            phone: null,
            verificationId: null,
            codeSentAt: 0,
          };
          return { values, result: null };
        },
      );
      return { status: "NEEDS_ACCOUNT_RESOLUTION" as const };
    } catch (error) {
      await this.store.atomic([ctxKey], (values) => {
        if (recordOf(values[0], "CONTEXT")?.activeId === id) values[0] = null;
        return { values, result: null };
      });
      throw error;
    }
  }
  private async pending(contextId: string, csrf: string) {
    const ctxKey = this.contextKey(contextId),
      context = this.context(await this.store.read(ctxKey), csrf);
    if (!context.pendingId) throw new WechatAuthError("state");
    const key = this.key("pending", context.pendingId),
      pending = recordOf(await this.store.read(key), "PENDING");
    if (
      !pending ||
      pending.expiresAt <= this.clock() ||
      pending.contextKey !== ctxKey ||
      pending.status !== "READY"
    )
      throw new WechatAuthError("state");
    return { ctxKey, key, pending };
  }
  async sendResolutionCode(contextId: string, csrf: string, phone: string) {
    phone = phoneNumber(phone);
    const { ctxKey, key, pending } = await this.pending(contextId, csrf);
    await this.store.atomic([ctxKey, key], (values) => {
      const context = this.context(values[0], csrf),
        record = recordOf(values[1], "PENDING");
      if (
        context.pendingId !== pending.id ||
        !record ||
        record.status !== "READY" ||
        record.expiresAt <= this.clock()
      )
        throw new WechatAuthError("state");
      if (record.codeSentAt && this.clock() - record.codeSentAt < 60_000)
        throw new WechatAuthError("phone");
      record.codeSentAt = this.clock();
      record.phone = null;
      record.verificationId = null;
      return { values, result: null };
    });
    const sent = await this.auth.sendWechatPhoneCode(phone);
    await this.store.atomic([ctxKey, key], (values) => {
      const context = this.context(values[0], csrf),
        record = recordOf(values[1], "PENDING");
      if (
        context.pendingId !== pending.id ||
        !record ||
        record.status !== "READY" ||
        record.expiresAt <= this.clock()
      )
        throw new WechatAuthError("state");
      record.phone = phone;
      record.verificationId = sent.verificationId;
      return { values, result: null };
    });
    return { expiresIn: sent.expiresIn, message: sent.message };
  }
  async resolvePhone(
    contextId: string,
    csrf: string,
    input: { phone: string; code: string; action: "BIND" | "CREATE" },
    response: ResponseLike,
  ) {
    const phone = phoneNumber(input.phone);
    if (!["BIND", "CREATE"].includes(input.action))
      throw new WechatAuthError("phone");
    const { ctxKey, key, pending } = await this.pending(contextId, csrf);
    await this.store.atomic([ctxKey, key], (values) => {
      const context = this.context(values[0], csrf),
        record = recordOf(values[1], "PENDING");
      if (
        context.pendingId !== pending.id ||
        !record ||
        record.status !== "READY" ||
        record.expiresAt <= this.clock() ||
        record.phone !== phone ||
        !record.verificationId
      )
        throw new WechatAuthError("phone");
      record.status = "CLAIMED";
      context.busy = true;
      return { values, result: null };
    });
    try {
      await this.auth.verifyWechatPhoneCode(
        phone,
        input.code,
        pending.verificationId!,
      );
      await this.store.atomic([ctxKey, key], (values) => {
        const context = this.context(values[0], csrf),
          record = recordOf(values[1], "PENDING");
        if (
          context.pendingId !== pending.id ||
          !record ||
          record.status !== "CLAIMED" ||
          record.expiresAt <= this.clock()
        )
          throw new WechatAuthError("state");
        return { values, result: null };
      });
      let user;
      try {
        user = await this.prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const byOpen = await tx.user.findUnique({
                where: { wechatMpOpenId: pending.openId },
              }),
              byPhone = await tx.user.findUnique({ where: { phone } }),
              byUnion = pending.unionId
                ? await tx.user.findUnique({
                    where: { wechatUnionId: pending.unionId },
                  })
                : null;
            if (byUnion && (!byPhone || byUnion.id !== byPhone.id))
              throw new WechatAuthError("identity_conflict");
            if (byOpen && (!byPhone || byPhone.id !== byOpen.id))
              throw new WechatAuthError("identity_conflict");
            if (byPhone) {
              if (byPhone.status !== "ACTIVE")
                throw new WechatAuthError("disabled");
              if (
                (byPhone.wechatMpOpenId &&
                  byPhone.wechatMpOpenId !== pending.openId) ||
                (pending.unionId &&
                  byPhone.wechatUnionId &&
                  pending.unionId !== byPhone.wechatUnionId)
              )
                throw new WechatAuthError("identity_conflict");
              const updated = await tx.user.updateMany({
                where: {
                  id: byPhone.id,
                  phone,
                  status: "ACTIVE",
                  wechatMpOpenId: byPhone.wechatMpOpenId,
                  wechatUnionId: byPhone.wechatUnionId,
                },
                data: {
                  wechatMpOpenId: pending.openId,
                  ...(pending.unionId
                    ? { wechatUnionId: pending.unionId }
                    : {}),
                  phoneVerifiedAt: byPhone.phoneVerifiedAt ?? new Date(),
                },
              });
              if (updated.count !== 1)
                throw new WechatAuthError("identity_conflict");
              return tx.user.findUniqueOrThrow({ where: { id: byPhone.id } });
            }
            if (input.action !== "CREATE") throw new WechatAuthError("phone");
            if (!this.provider.config().registrationEnabled)
              throw new WechatAuthError("registration_closed");
            const digest = createHash("sha256")
              .update(this.provider.config().appId + ":" + pending.openId)
              .digest("hex");
            const created = await tx.user.create({
              data: {
                email: `wechat-${digest}@users.abei.local`,
                phone,
                phoneVerifiedAt: new Date(),
                passwordHash: await hashPassword(
                  randomBytes(32).toString("base64url"),
                ),
                passwordLoginEnabled: false,
                nickname: "微信用户",
                wechatMpOpenId: pending.openId,
                ...(pending.unionId ? { wechatUnionId: pending.unionId } : {}),
              },
            });
            await tx.wallet.create({ data: { userId: created.id } });
            if (pending.referralToken)
              await rewardNewReferral(tx, created.id, pending.referralToken);
            return created;
          },
        );
      } catch (error) {
        if (uniqueError(error)) throw new WechatAuthError("identity_conflict");
        throw error;
      }
      const result = await this.session(user.id, pending.next, response);
      await this.store.atomic([ctxKey, key], (values) => {
        const context = recordOf(values[0], "CONTEXT");
        if (context?.pendingId === pending.id) values[0] = null;
        values[1] = null;
        return { values, result: null };
      });
      return result;
    } catch (error) {
      await this.store.atomic([ctxKey, key], (values) => {
        if (recordOf(values[0], "CONTEXT")?.pendingId === pending.id)
          values[0] = null;
        values[1] = null;
        return { values, result: null };
      });
      throw error;
    }
  }

  async resolveEmail(
    contextId: string,
    csrf: string,
    input: { email: string; password: string },
    response: ResponseLike,
  ) {
    const { ctxKey, key, pending } = await this.pending(contextId, csrf);
    await this.store.atomic([ctxKey, key], (values) => {
      const context = this.context(values[0], csrf),
        record = recordOf(values[1], "PENDING");
      if (
        context.pendingId !== pending.id ||
        !record ||
        record.status !== "READY" ||
        record.expiresAt <= this.clock()
      )
        throw new WechatAuthError("state");
      record.status = "CLAIMED";
      context.busy = true;
      return { values, result: null };
    });
    try {
      const proof = await this.auth.verifyWechatEmailPassword(
          input.email,
          input.password,
        ),
        userId = proof.id;
      await this.store.atomic([ctxKey, key], (values) => {
        const context = this.context(values[0], csrf),
          record = recordOf(values[1], "PENDING");
        if (
          context.pendingId !== pending.id ||
          !record ||
          record.status !== "CLAIMED" ||
          record.expiresAt <= this.clock()
        )
          throw new WechatAuthError("state");
        return { values, result: null };
      });
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUnique({ where: { id: userId } }),
          byOpen = await tx.user.findUnique({
            where: { wechatMpOpenId: pending.openId },
          }),
          byUnion = pending.unionId
            ? await tx.user.findUnique({
                where: { wechatUnionId: pending.unionId },
              })
            : null;
        if (!user || user.status !== "ACTIVE")
          throw new WechatAuthError("disabled");
        if (
          (byOpen && byOpen.id !== userId) ||
          (byUnion && byUnion.id !== userId) ||
          (user.wechatMpOpenId && user.wechatMpOpenId !== pending.openId) ||
          (pending.unionId &&
            user.wechatUnionId &&
            user.wechatUnionId !== pending.unionId)
        )
          throw new WechatAuthError("identity_conflict");
        const updated = await tx.user.updateMany({
          where: {
            id: userId,
            status: "ACTIVE",
            email: proof.email,
            passwordHash: proof.passwordHash,
            passwordLoginEnabled: proof.passwordLoginEnabled,
            wechatMpOpenId: user.wechatMpOpenId,
            wechatUnionId: user.wechatUnionId,
          },
          data: {
            wechatMpOpenId: pending.openId,
            ...(pending.unionId ? { wechatUnionId: pending.unionId } : {}),
          },
        });
        if (updated.count !== 1) throw new WechatAuthError("identity_conflict");
      });
      return await this.session(userId, pending.next, response);
    } catch (error) {
      if (uniqueError(error)) throw new WechatAuthError("identity_conflict");
      throw error;
    } finally {
      await this.store.atomic([ctxKey, key], (values) => {
        if (recordOf(values[0], "CONTEXT")?.pendingId === pending.id)
          values[0] = null;
        values[1] = null;
        return { values, result: null };
      });
    }
  }
}
