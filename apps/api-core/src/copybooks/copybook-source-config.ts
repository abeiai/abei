import { HttpStatus } from "@nestjs/common";
import type { Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

export const copybookSourceConfigVersion = 1;

const maxSourceConfigBytes = 6 * 1024 * 1024;

export function normalizeCopybookSourceConfig(
  value: unknown,
  templateId: unknown
): Prisma.InputJsonObject | null {
  if (normalizeTemplateId(templateId) !== "name-label" || value === undefined || value === null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidSourceConfig();
  }

  let serialized: string;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw invalidSourceConfig();
  }

  if (!serialized || Buffer.byteLength(serialized, "utf8") > maxSourceConfigBytes) {
    throw new AppException(40001, "姓名贴设置数据过大，请减小背景图片后重试", HttpStatus.BAD_REQUEST);
  }

  const parsed = JSON.parse(serialized) as Record<string, unknown>;

  if (parsed.version !== copybookSourceConfigVersion || parsed.templateId !== "name-label") {
    throw invalidSourceConfig();
  }

  return parsed as Prisma.InputJsonObject;
}

function normalizeTemplateId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invalidSourceConfig() {
  return new AppException(40001, "姓名贴设置数据无效", HttpStatus.BAD_REQUEST);
}
