import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppException } from "../common/app-exception.js";
import { getProfileContextSecret } from "../profiles/profile-context-token.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";

interface LearnerAudioCapabilityPayload {
  assetId: string;
  expiresAt: number;
  issuedAt: number;
  learnerId: string;
  root: string;
  userId: string;
}

const learnerAudioCapabilitySeconds = 5 * 60;
const learnerAudioCapabilityKeys = ["assetId", "expiresAt", "issuedAt", "learnerId", "root", "userId"];

@Injectable()
export class LearnerAudioCapabilityService {
  private readonly secret: string;

  constructor(@Optional() secret?: string) {
    this.secret = secret ?? getProfileContextSecret();
  }

  issueLearnerSample(
    subject: ProfileSubject,
    assetId: string,
    root: string,
    now = new Date()
  ) {
    if (subject.mode !== "LEARNER") {
      throw this.invalidProof();
    }
    const issuedAt = Math.floor(now.getTime() / 1000);
    const payload: LearnerAudioCapabilityPayload = {
      assetId,
      expiresAt: issuedAt + learnerAudioCapabilitySeconds,
      issuedAt,
      learnerId: subject.learnerId,
      root,
      userId: subject.userId
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  assertLearnerSample(
    proof: string,
    subject: ProfileSubject,
    assetId: string,
    root: string,
    now = new Date()
  ) {
    const payload = this.verify(proof, now);
    if (
      subject.mode !== "LEARNER"
      || !payload
      || payload.userId !== subject.userId
      || payload.learnerId !== subject.learnerId
      || payload.assetId !== assetId
      || payload.root !== root
    ) {
      throw this.invalidProof();
    }
  }

  private verify(proof: string, now: Date): LearnerAudioCapabilityPayload | null {
    const [encoded = "", signature = "", extra] = proof.split(".");
    if (extra !== undefined || !this.canonical(encoded) || !this.canonical(signature)) return null;
    const expected = Buffer.from(this.signature(encoded), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    if (!this.validPayload(parsed) || Buffer.from(JSON.stringify(parsed)).toString("base64url") !== encoded) return null;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    return parsed.issuedAt <= nowSeconds && parsed.expiresAt > nowSeconds ? parsed : null;
  }

  private validPayload(value: unknown): value is LearnerAudioCapabilityPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return keys.length === learnerAudioCapabilityKeys.length
      && keys.every((key, index) => key === learnerAudioCapabilityKeys[index])
      && [record.assetId, record.learnerId, record.root, record.userId].every(this.boundedId)
      && Number.isSafeInteger(record.issuedAt)
      && Number.isSafeInteger(record.expiresAt)
      && (record.expiresAt as number) === (record.issuedAt as number) + learnerAudioCapabilitySeconds;
  }

  private readonly boundedId = (value: unknown) =>
    typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;

  private canonical(value: string) {
    return Boolean(value)
      && /^[A-Za-z0-9_-]+$/.test(value)
      && Buffer.from(value, "base64url").toString("base64url") === value;
  }

  private signature(encoded: string) {
    return createHmac("sha256", this.secret).update(encoded).digest("base64url");
  }

  private invalidProof() {
    return new AppException(40301, "声音样本授权已失效，请重新上传", HttpStatus.FORBIDDEN);
  }
}
