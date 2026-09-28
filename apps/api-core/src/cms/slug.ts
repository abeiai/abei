import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

const reservedSlugs = new Set([
  "admin",
  "login",
  "register",
  "dashboard",
  "api",
  "articles",
  "pages",
  "settings"
]);

export function assertValidSlug(slug: string | undefined) {
  if (!slug) {
    throw new AppException(40001, "slug 不允许为空", HttpStatus.BAD_REQUEST);
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new AppException(40001, "slug 只能包含小写字母、数字和短横线", HttpStatus.BAD_REQUEST);
  }

  if (reservedSlugs.has(slug)) {
    throw new AppException(40001, "slug 为系统保留路由，不允许使用", HttpStatus.BAD_REQUEST);
  }
}
