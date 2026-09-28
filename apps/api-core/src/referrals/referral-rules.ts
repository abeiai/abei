import { createHash, randomBytes } from "node:crypto";
import { AppException } from "../common/app-exception.js";

export const referralCookie = "xueleai_referral";
export const referralLifetimeSeconds = 72 * 60 * 60;
export const referralRewardCredits = 500;
const reserved = new Set(["admin", "administrator", "official", "support", "service", "system", "root", "login", "register", "dashboard", "settings", "api", "pages", "articles", "help", "security", "billing", "payment", "staff"]);

export const referralRules = {
  normalizeAlias(value: unknown) {
    const name = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!/^[a-z]{4,32}$/.test(name) || name.includes("xuele") || reserved.has(name)) {
      throw new AppException(40001, "名称须为4至32位英文字母，不能包含学乐品牌或官方保留名称", 400);
    }
    return name;
  },
  isActive(createdAt: Date, now = new Date()) {
    const age = now.getTime() - createdAt.getTime();
    return age >= 0 && age < referralLifetimeSeconds * 1000;
  },
  newToken() { return randomBytes(32).toString("hex"); },
  hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
};
