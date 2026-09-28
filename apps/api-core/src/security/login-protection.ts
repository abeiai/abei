import { HttpStatus } from "@nestjs/common";
import { getPrismaClient } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";

const prisma = getPrismaClient();
const lockMessage = "登录失败次数过多，请稍后再试。";

type LoginSubjectType = "USER" | "ADMIN";

function secondsFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function maxAttempts() {
  const value = Number(process.env.LOGIN_FAILURE_MAX_ATTEMPTS);

  return Number.isFinite(value) && value > 0 ? value : 5;
}

function windowMs() {
  return secondsFromEnv("LOGIN_FAILURE_WINDOW_SECONDS", 15 * 60) * 1000;
}

function lockMs() {
  return secondsFromEnv("LOGIN_FAILURE_LOCK_SECONDS", 15 * 60) * 1000;
}

function subject(type: LoginSubjectType, email: string) {
  return `${type}:${email.trim().toLowerCase()}`;
}

function throwLocked() {
  throw new AppException(42902, lockMessage, HttpStatus.TOO_MANY_REQUESTS);
}

export async function assertLoginAllowed(type: LoginSubjectType, email: string) {
  const record = await prisma.loginFailure.findUnique({
    where: {
      subject: subject(type, email)
    }
  });

  if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    throwLocked();
  }
}

export async function recordLoginFailure(type: LoginSubjectType, email: string) {
  const key = subject(type, email);
  const now = new Date();
  const record = await prisma.loginFailure.findUnique({
    where: {
      subject: key
    }
  });

  if (!record || now.getTime() - record.firstFailedAt.getTime() > windowMs()) {
    await prisma.loginFailure.upsert({
      where: {
        subject: key
      },
      update: {
        failedCount: 1,
        firstFailedAt: now,
        lockedUntil: null
      },
      create: {
        subject: key,
        failedCount: 1,
        firstFailedAt: now
      }
    });
    return;
  }

  const failedCount = record.failedCount + 1;
  const lockedUntil = failedCount >= maxAttempts() ? new Date(now.getTime() + lockMs()) : null;

  await prisma.loginFailure.update({
    where: {
      subject: key
    },
    data: {
      failedCount,
      lockedUntil
    }
  });

  if (lockedUntil) {
    throwLocked();
  }
}

export async function clearLoginFailures(type: LoginSubjectType, email: string) {
  await prisma.loginFailure.deleteMany({
    where: {
      subject: subject(type, email)
    }
  });
}
