# Email Verification Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email-code verification to user registration and password reset.

**Architecture:** Reuse the existing Auth module and send configuration. Add a focused email-code persistence model, API DTOs, and front-end forms.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, TailwindCSS, node:test.

## Global Constraints

- All user-facing copy is Simplified Chinese.
- Passwords remain hashed.
- No default universal email code.
- Do not modify SMS login, payment, AI, CMS, or admin login flows.
- Run TDD red-green cycles before production code.

---

### Task 1: Backend Email Code Model And Auth API

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260725090000_email_verification_codes/migration.sql`
- Modify: `apps/api-core/src/auth/auth.service.ts`
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Modify: `apps/api-core/src/auth/dto/register.dto.ts`
- Create: `apps/api-core/src/auth/dto/email-auth.dto.ts`
- Modify: `apps/api-core/src/security/rate-limit.interceptor.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

**Interfaces:**
- `AuthService.sendEmailCode(dto: SendEmailCodeDto): Promise<{ email: string; purpose: EmailCodePurpose; expiresIn: number; message: string }>`
- `AuthService.resetPassword(dto: ResetPasswordDto): Promise<{ message: string }>`
- `RegisterDto.emailCode: string`

- [x] Write failing backend tests for sending register codes, requiring register code, consuming code once, and reset password.
- [x] Run API unit test and confirm failure comes from missing email-code implementation.
- [x] Add Prisma enum/table and migration SQL.
- [x] Implement DTOs, Auth controller endpoints, Auth service email-code send/verify/reset helpers, Aliyun DirectMail request, and rate-limit rules.
- [x] Run API unit and rate-limit tests to confirm pass.

### Task 2: Frontend Registration And Forgot Password Forms

**Files:**
- Modify: `apps/web/src/components/auth/register-form.tsx`
- Modify: `apps/web/src/lib/auth-actions.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/forgot-password/page.tsx`
- Create: `apps/web/src/components/auth/forgot-password-form.tsx`
- Create: `apps/web/src/lib/email-auth.ts`
- Create: `apps/web/tests/email-auth.test.ts`

**Interfaces:**
- `sendRegisterEmailCodeAction(previousState, formData)`
- `resetPasswordAction(previousState, formData)`
- `emailCodePurpose` values: `REGISTER`, `RESET_PASSWORD`

- [x] Write failing web tests for safe forgot-password success URL and password confirmation helper.
- [x] Run web targeted test and confirm failure comes from missing helper.
- [x] Implement auth actions, register form code controls, forgot password form and page.
- [x] Run web targeted test and typecheck.

### Task 3: Verification And Review

**Files:**
- All touched files.

- [x] Run targeted API tests.
- [x] Run API typecheck and lint.
- [x] Run targeted web tests.
- [x] Run web typecheck and lint.
- [x] Request independent code review.
- [x] Fix critical/important findings.
