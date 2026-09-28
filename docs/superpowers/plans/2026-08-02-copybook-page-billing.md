# Copybook Per-Page Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge copybook generation from the validated page count at 2 credits per page without a watermark and 5 credits per page with a watermark.

**Architecture:** Add a server-side pure pricing function that parses Layout JSON and is the only source used by `CopybooksService` for balance checks, records, wallet consumption, and responses. Record creation and wallet consumption commit in one database transaction, and idempotent ledger reuse requires an exact amount match. Add a small client-side pricing helper only for confirmation copy; generation requests stop sending a client-selected credit value.

**Tech Stack:** NestJS, TypeScript, Node test runner, Next.js, React.

## Global Constraints

- Server pricing is authoritative and ignores request `credits`.
- A valid watermark on any page prices the complete document at 5 credits per page.
- No watermark prices the complete document at 2 credits per page.
- Existing idempotent records retain their original stored page count and credits.
- No database migration.

---

### Task 1: Server-Side Copybook Pricing

**Files:**
- Create: `apps/api-core/src/copybooks/copybook-pricing.ts`
- Create: `apps/api-core/tests/copybook-pricing.test.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.service.ts`
- Modify: `apps/api-core/src/wallet/wallet.service.ts`

**Interfaces:**
- Produces: `calculateCopybookPricing(layout: unknown): { pageCount: number; hasWatermark: boolean; creditsPerPage: number; credits: number }`.
- Consumes: `parseLayoutDocument(layout)` for page validation and effective watermark normalization.

- [x] **Step 1: Write failing pricing tests**

Cover one and ten unwatermarked pages, ten watermarked pages, an invalid/empty watermark, wallet acceptance of calculated multi-page totals, and a two-page request that claims only 2 credits but is rejected when the wallet has fewer than 4 credits.

- [x] **Step 2: Run the pricing tests and verify RED**

Run: `node --import tsx --test tests/copybook-pricing.test.ts`

Expected: FAIL because `calculateCopybookPricing` does not exist and current service trusts request credits.

- [x] **Step 3: Implement authoritative pricing**

Use these formulas:

```ts
const creditsPerPage = hasWatermark ? 5 : 2;
const credits = pageCount * creditsPerPage;
```

Remove `normalizeCredits(input.credits)` from `CopybooksService.generate`; use the calculated values for `assertWalletCanCover`, `CopybookRecord.credits`, `CopybookRecord.pageCount`, and `consumeCopybookGenerateCredits`. Keep the DTO field only for compatibility. Update the wallet's copybook credit validator to accept integer totals from 1 through 500, remove the public wallet charging endpoint, reject idempotency amount mismatches, and commit the record plus wallet debit atomically.

- [x] **Step 4: Run the pricing tests and verify GREEN**

Run: `node --import tsx --test tests/copybook-pricing.test.ts`

Expected: all pricing and trust-boundary tests pass.

### Task 2: Frontend Confirmation Pricing

**Files:**
- Create: `apps/web/src/components/zitie/copybook-pricing.ts`
- Create: `apps/web/tests/zitie-copybook-pricing.test.ts`
- Modify: `apps/web/src/components/zitie/zitie-generator.tsx`

**Interfaces:**
- Produces: `copybookPricingForPages(pages)` with `pageCount`, `hasWatermark`, `credits`, and exact `confirmationMessage`.
- Consumes: generated preview Layout pages, where an active watermark is represented by a non-null `watermark`.

- [x] **Step 1: Write failing frontend pricing tests**

Assert exact messages:

```text
本次生成字帖10页，需消耗20点，确认生成将自动扣除。
本次生成带水印字帖10页，需消耗50点，确认生成将自动扣除。
```

- [x] **Step 2: Run the frontend test and verify RED**

Run: `node --import tsx --test tests/zitie-copybook-pricing.test.ts`

Expected: FAIL because the pricing helper does not exist.

- [x] **Step 3: Implement confirmation pricing and request changes**

Replace fixed 2/10 credit constants and modal strings with the helper result. Remove `credits` from the generate request body. Keep the success message based on `payload.data.credits` returned by the server.

- [x] **Step 4: Run the frontend test and verify GREEN**

Run: `node --import tsx --test tests/zitie-copybook-pricing.test.ts`

Expected: both exact confirmation messages pass.

### Task 3: Integrated Verification

**Files:**
- Verify all files from Tasks 1 and 2.

- [x] **Step 1: Run targeted and full relevant tests**

```bash
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/web test
```

- [x] **Step 2: Run type checks and builds**

```bash
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/api-core build
pnpm --filter @xueleai/web build
```

- [x] **Step 3: Review billing diff and commit**

Confirm no client-provided amount reaches the server charging path, no migration exists, and the worktree contains no unrelated changes. Commit the implementation as one billing change and push the current branch.
