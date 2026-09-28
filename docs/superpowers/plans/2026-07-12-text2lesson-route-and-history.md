# Text2Lesson Route And History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将英文带学页面迁移到 `/text2lesson` 与 `/text2lesson/:id`，移除旧页面路由，并让访客始终看到空历史、登录用户无需刷新即可看到服务器账号历史。

**Architecture:** 使用共享 URL helper 统一制作台和学习页地址；`/text2lesson` 服务端只读取一次当前用户，并把同一用户对象传给 `PublicShell` 与制作台。制作台用带 ownerUserId 的账号历史状态机隔离访客、加载、成功和失败状态，忽略切换账号后返回的陈旧请求。

**Tech Stack:** Next.js App Router、React、TypeScript、Node test runner、TailwindCSS。

## Global Constraints

- 所有页面和错误提示使用简体中文。
- 新页面路由只能是 `/text2lesson` 和 `/text2lesson/:id`。
- 旧页面路由直接返回 404，不新增 redirect、rewrite 或兼容页面。
- 未登录不读取、不显示、不合并 `localStorage` 历史。
- 已登录只显示 `/api/english-guided-study/materials` 返回的服务器账号历史。
- 不修改 NestJS API、数据库 schema、migration、seed、支付或权限体系。
- 使用现有端口 `3321`，不新增依赖。

---

### Task 1: 账号历史状态机

**Files:**
- Create: `apps/web/src/lib/english-guided-study-history.ts`
- Create: `apps/web/tests/english-guided-study-history.test.ts`

**Interfaces:**
- Consumes: `EnglishGuidedStudyMaterial` from `@/lib/english-guided-study-data`.
- Produces: `AccountHistoryState`, `accountHistoryForUser`, `accountHistoryLoaded`, `accountHistoryFailed`, `accountHistoryUpsert`, `accountHistoryPin`, `accountHistoryRemove`.

- [ ] **Step 1: Write the failing state-transition tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import * as historyModule from "../src/lib/english-guided-study-history";

test("未登录用户始终得到 guest 空历史", () => {
  assert.equal(typeof historyModule.accountHistoryForUser, "function");
  assert.deepEqual(historyModule.accountHistoryForUser(null), {
    ownerUserId: null,
    status: "guest",
    items: [],
    errorMessage: null
  });
});

test("登录和切换账号时清空旧历史并进入 loading", () => {
  assert.deepEqual(historyModule.accountHistoryForUser("user-2"), {
    ownerUserId: "user-2",
    status: "loading",
    items: [],
    errorMessage: null
  });
});

test("陈旧账号请求不能覆盖当前账号历史", () => {
  const current = historyModule.accountHistoryForUser("user-2");
  const stale = historyModule.accountHistoryLoaded(current, "user-1", []);
  assert.equal(stale, current);
});

test("登录用户历史请求失败时保持 error 而不是 guest", () => {
  const loading = historyModule.accountHistoryForUser("user-1");
  assert.equal(historyModule.accountHistoryFailed(loading, "user-1", "加载失败").status, "error");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-history.test.ts
```

Expected: FAIL because `english-guided-study-history.ts` does not exist or the exported functions are undefined.

- [ ] **Step 3: Implement the minimal state machine**

```ts
import type { EnglishGuidedStudyMaterial } from "@/lib/english-guided-study-data";

export type AccountHistoryStatus = "guest" | "loading" | "ready" | "error";

export interface AccountHistoryState {
  ownerUserId: string | null;
  status: AccountHistoryStatus;
  items: EnglishGuidedStudyMaterial[];
  errorMessage: string | null;
}

export function accountHistoryForUser(userId: string | null): AccountHistoryState {
  return userId
    ? { ownerUserId: userId, status: "loading", items: [], errorMessage: null }
    : { ownerUserId: null, status: "guest", items: [], errorMessage: null };
}

export function accountHistoryLoaded(
  current: AccountHistoryState,
  userId: string,
  items: EnglishGuidedStudyMaterial[]
) {
  return current.ownerUserId === userId
    ? { ownerUserId: userId, status: "ready" as const, items, errorMessage: null }
    : current;
}

export function accountHistoryFailed(current: AccountHistoryState, userId: string, message: string) {
  return current.ownerUserId === userId
    ? { ...current, status: "error" as const, errorMessage: message }
    : current;
}

export function accountHistoryUpsert(current: AccountHistoryState, material: EnglishGuidedStudyMaterial) {
  if (current.status === "guest") return current;
  return {
    ...current,
    status: "ready" as const,
    items: [material, ...current.items.filter((item) => item.id !== material.id)].slice(0, 20),
    errorMessage: null
  };
}

export function accountHistoryPin(current: AccountHistoryState, materialId: string) {
  const material = current.items.find((item) => item.id === materialId);
  return material
    ? { ...current, items: [material, ...current.items.filter((item) => item.id !== materialId)] }
    : current;
}

export function accountHistoryRemove(current: AccountHistoryState, materialId: string) {
  return { ...current, items: current.items.filter((item) => item.id !== materialId) };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: all history state tests PASS.

- [ ] **Step 5: Commit the state machine**

```bash
git add apps/web/src/lib/english-guided-study-history.ts apps/web/tests/english-guided-study-history.test.ts
git commit -m "test: define account history state transitions"
```

---

### Task 2: Text2Lesson URL 与页面路由

**Files:**
- Modify: `apps/web/src/lib/english-guided-study-data.ts`
- Modify: `apps/web/tests/english-guided-study-node-timeline.test.ts`
- Create: `apps/web/src/app/text2lesson/page.tsx`
- Create: `apps/web/src/app/text2lesson/[id]/page.tsx`
- Delete: `apps/web/src/app/experience/english-guided-study/page.tsx`
- Delete: `apps/web/src/app/study/english-guided-study/[id]/page.tsx`

**Interfaces:**
- Produces: `text2lessonHomePath = "/text2lesson"` and `text2lessonStudyPath(id: string): string`.
- Consumes: existing `EnglishGuidedStudyConsole`, `EnglishGuidedStudyLearningPlayer`, `PublicShell`, `getOptionalCurrentUser`.

- [ ] **Step 1: Write failing URL tests**

Add to `apps/web/tests/english-guided-study-node-timeline.test.ts`:

```ts
test("英文带学使用新的唯一页面地址", () => {
  assert.equal(englishGuidedStudyData.text2lessonHomePath, "/text2lesson");
  assert.equal(
    englishGuidedStudyData.text2lessonStudyPath?.("lesson id"),
    "/text2lesson/lesson%20id"
  );
});
```

- [ ] **Step 2: Run the URL test and verify RED**

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-node-timeline.test.ts
```

Expected: FAIL because URL exports do not exist.

- [ ] **Step 3: Add URL helpers**

```ts
export const text2lessonHomePath = "/text2lesson";

export function text2lessonStudyPath(materialId: string) {
  return `${text2lessonHomePath}/${encodeURIComponent(materialId)}`;
}
```

- [ ] **Step 4: Create the new console page**

`apps/web/src/app/text2lesson/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EnglishGuidedStudyConsole } from "@/components/experience/english-guided-study-console";
import { PublicShell } from "@/components/shell/public-shell";
export const metadata: Metadata = {
  title: "英文带学 - 学乐 AI",
  description: "上传图片或粘贴英文文本，按英语水平生成逐句讲解、同步音频和练习题。"
};

export default function Text2LessonPage() {
  return (
    <PublicShell showFooter={false}>
      <EnglishGuidedStudyConsole />
    </PublicShell>
  );
}
```

- [ ] **Step 5: Move the learning page without compatibility routing**

Create `apps/web/src/app/text2lesson/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EnglishGuidedStudyLearningPlayer } from "@/components/experience/english-guided-study-learning-player";
import { PublicShell } from "@/components/shell/public-shell";
import { getPublicEnglishGuidedStudyMaterial } from "@/lib/english-guided-study-public-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const material = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);
  return {
    title: material ? `英文带学 - ${material.title}` : `英文带学学习页 - ${id}`,
    description: "可分享的英文带学学习页面，包含讲解音频、逐句高亮和练习巩固。"
  };
}

export default async function Text2LessonStudyPage({ params }: PageProps) {
  const { id } = await params;
  const material = await getPublicEnglishGuidedStudyMaterial(id).catch(() => null);
  return (
    <PublicShell showFooter={false}>
      <EnglishGuidedStudyLearningPlayer material={material} materialId={id} />
    </PublicShell>
  );
}
```

Delete both old page files. Do not add redirects or rewrites.

- [ ] **Step 6: Run URL tests and typecheck**

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-node-timeline.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: URL tests and typecheck PASS.

- [ ] **Step 7: Commit route files and helpers**

```bash
git add apps/web/src/app/text2lesson apps/web/src/app/experience/english-guided-study/page.tsx apps/web/src/app/study/english-guided-study/'[id]'/page.tsx apps/web/src/lib/english-guided-study-data.ts apps/web/tests/english-guided-study-node-timeline.test.ts
git commit -m "feat: move english lessons to text2lesson routes"
```

---

### Task 3: 公共布局登录态与制作台账号历史

**Files:**
- Modify: `apps/web/src/components/shell/public-shell.tsx`
- Modify: `apps/web/src/components/experience/english-guided-study-console.tsx`
- Modify: `apps/web/src/lib/auth-actions.ts`
- Modify: `apps/web/src/lib/english-guided-study-data.ts`
- Modify: `apps/web/src/app/text2lesson/page.tsx`
- Test: `apps/web/tests/english-guided-study-history.test.ts`

**Interfaces:**
- Consumes: `AccountHistoryState` and transitions from Task 1, `PublicUser` from auth actions.
- Produces: optional `PublicShell.currentUser?: PublicUser | null` and required `EnglishGuidedStudyConsole.currentUser: PublicUser | null`.

- [ ] **Step 1: Extend state tests for upsert and logout**

```ts
test("退出登录清空现有账号历史", () => {
  const material = { id: "material-1" } as EnglishGuidedStudyMaterial;
  const ready = historyModule.accountHistoryLoaded(
    historyModule.accountHistoryForUser("user-1"),
    "user-1",
    [material]
  );
  assert.deepEqual(historyModule.accountHistoryForUser(null), {
    ownerUserId: null,
    status: "guest",
    items: [],
    errorMessage: null
  });
  assert.equal(ready.items.length, 1);
});

test("新生成材料只更新当前账号内存历史", () => {
  const material = { id: "material-1" } as EnglishGuidedStudyMaterial;
  const ready = historyModule.accountHistoryLoaded(
    historyModule.accountHistoryForUser("user-1"),
    "user-1",
    []
  );
  assert.deepEqual(historyModule.accountHistoryUpsert(ready, material).items, [material]);
  assert.deepEqual(historyModule.accountHistoryUpsert(historyModule.accountHistoryForUser(null), material).items, []);
});

test("置顶和移除只改变当前账号内存历史", () => {
  const first = { id: "material-1" } as EnglishGuidedStudyMaterial;
  const second = { id: "material-2" } as EnglishGuidedStudyMaterial;
  const ready = historyModule.accountHistoryLoaded(
    historyModule.accountHistoryForUser("user-1"),
    "user-1",
    [first, second]
  );
  assert.deepEqual(historyModule.accountHistoryPin(ready, second.id).items, [second, first]);
  assert.deepEqual(historyModule.accountHistoryRemove(ready, first.id).items, [second]);
});
```

- [ ] **Step 2: Verify the new tests fail before integration changes**

Run the Task 1 test command. Expected: tests fail if the upsert/guest transitions are incomplete.

- [ ] **Step 3: Pass one server user through PublicShell**

Add `currentUser?: PublicUser | null` to `PublicShell` props. Resolve the user with:

```ts
const [configs, user] = await Promise.all([
  loadPublicConfigMap(),
  currentUser === undefined ? getOptionalCurrentUser() : Promise.resolve(currentUser)
]);
```

All existing `PublicShell` call sites remain compatible because the prop is optional.

Convert `apps/web/src/app/text2lesson/page.tsx` to the final dynamic page:

```tsx
import type { Metadata } from "next";
import { EnglishGuidedStudyConsole } from "@/components/experience/english-guided-study-console";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "英文带学 - 学乐 AI",
  description: "上传图片或粘贴英文文本，按英语水平生成逐句讲解、同步音频和练习题。"
};

export default async function Text2LessonPage() {
  const currentUser = await getOptionalCurrentUser();
  return (
    <PublicShell currentUser={currentUser} showFooter={false}>
      <EnglishGuidedStudyConsole currentUser={currentUser} />
    </PublicShell>
  );
}
```

- [ ] **Step 4: Replace local history in the console**

Change the console signature to:

```ts
export function EnglishGuidedStudyConsole({ currentUser }: { currentUser: PublicUser | null })
```

Replace `history` state and mount-only local history effect with `AccountHistoryState`. On `currentUser?.id` change:

```ts
useEffect(() => {
  const userId = currentUser?.id ?? null;
  setAccountHistory(accountHistoryForUser(userId));
  if (!userId) return;

  let cancelled = false;
  void getUserEnglishGuidedStudyMaterials()
    .then((items) => {
      if (!cancelled) setAccountHistory((current) => accountHistoryLoaded(current, userId, items));
    })
    .catch((error) => {
      if (!cancelled) {
        setAccountHistory((current) => accountHistoryFailed(
          current,
          userId,
          error instanceof Error ? error.message : "账号历史加载失败"
        ));
      }
    });

  return () => { cancelled = true; };
}, [currentUser?.id, historyRetry]);
```

Replace `saveHistory()` with state-only `accountHistoryUpsert()`. Change the existing置顶 and删除 handlers to `accountHistoryPin()` and `accountHistoryRemove()`. Delete `readHistory()`, `writeHistory()`, `mergeMaterials()` and the storage-key import; remove the now-unused `englishGuidedStudyStorageKey` export from `english-guided-study-data.ts`.

- [ ] **Step 5: Render distinct left-sidebar states**

Use this state branch before rendering the existing history item list:

```tsx
{accountHistory.status === "guest" ? (
  <div className="grid gap-3 px-3 py-6 text-center text-xs text-muted-foreground">
    <span>登录后查看账号历史</span>
    <Button asChild size="sm" variant="outline">
      <Link href="/login?next=%2Ftext2lesson">登录</Link>
    </Button>
  </div>
) : accountHistory.status === "loading" ? (
  <p className="px-3 py-6 text-center text-xs text-muted-foreground">正在加载账号历史</p>
) : accountHistory.status === "error" ? (
  <div className="grid gap-3 px-3 py-6 text-center text-xs text-muted-foreground">
    <span>{accountHistory.errorMessage ?? "账号历史加载失败"}</span>
    <Button onClick={() => setHistoryRetry((value) => value + 1)} size="sm" variant="outline">
      重新加载
    </Button>
  </div>
) : accountHistory.items.length === 0 ? (
  <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无账号历史</p>
) : null}
```

Keep the complete existing history-row and three-dot menu JSX inline. Make only these mechanical list substitutions inside that unchanged block:

```text
history.length > 0         -> accountHistory.status === "ready" && accountHistory.items.length > 0
history.map((item) => ...) -> accountHistory.items.map((item) => ...)
```

Render the guest/loading/error/ready-empty branch before that list. Do not create a new decorative history-row component.

- [ ] **Step 6: Invalidate public layout after auth changes**

Add this immediately before redirects in `userLoginAction`, `phoneLoginAction`, `registerAction`, and `userLogoutAction`:

```ts
revalidatePath("/", "layout");
```

This clears prefetched guest/user layout results after cookies change.

- [ ] **Step 7: Run history tests and typecheck**

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-history.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: all history tests and typecheck PASS.

- [ ] **Step 8: Commit auth/history integration**

```bash
git add apps/web/src/app/text2lesson/page.tsx apps/web/src/components/shell/public-shell.tsx apps/web/src/components/experience/english-guided-study-console.tsx apps/web/src/lib/auth-actions.ts apps/web/src/lib/english-guided-study-data.ts apps/web/src/lib/english-guided-study-history.ts apps/web/tests/english-guided-study-history.test.ts
git commit -m "fix: refresh account history after authentication"
```

---

### Task 4: Update every visible link and remove old URL references

**Files:**
- Modify: `apps/web/src/components/experience/english-guided-study-console.tsx`
- Modify: `apps/web/src/components/experience/english-guided-study-learning-player.tsx`
- Modify: `apps/web/src/components/shell/public-shell.tsx`
- Modify: `apps/web/src/components/shell/dashboard-shell.tsx`
- Modify: `apps/web/src/components/home/learning-workspace.tsx`
- Modify: `apps/web/src/lib/product-data.ts`
- Modify: `apps/web/src/app/tools/page.tsx`

**Interfaces:**
- Consumes: `text2lessonHomePath`, `text2lessonStudyPath` from Task 2.
- Produces: no user-visible reference to either old page URL.

- [ ] **Step 1: Add a failing old-reference audit**

Run before editing:

```bash
rg -n '"/experience/english-guided-study|`/study/english-guided-study|href: "/experience/english-guided-study' apps/web/src
```

Expected: existing old route references are printed.

- [ ] **Step 2: Replace all visible links with URL helpers or `/text2lesson`**

Apply these exact replacements:

```text
apps/web/src/components/experience/english-guided-study-console.tsx
  studyShareHrefForMaterial(material) -> text2lessonStudyPath(material.id)

apps/web/src/components/experience/english-guided-study-learning-player.tsx
  href="/experience/english-guided-study" -> href={text2lessonHomePath}

apps/web/src/components/shell/public-shell.tsx
apps/web/src/components/shell/dashboard-shell.tsx
apps/web/src/components/home/learning-workspace.tsx
apps/web/src/lib/product-data.ts
apps/web/src/app/tools/page.tsx
  "/experience/english-guided-study" -> "/text2lesson"
```

Remove `studyShareHrefForMaterial()` after its final caller is replaced. Do not change `/api/english-guided-study/**` strings.

- [ ] **Step 3: Verify old page URL references are absent**

Run the Step 1 command again. Expected: no matches and exit status 1 from `rg`.

- [ ] **Step 4: Commit link updates**

```bash
git add apps/web/src/components/experience/english-guided-study-console.tsx apps/web/src/components/experience/english-guided-study-learning-player.tsx apps/web/src/components/shell/public-shell.tsx apps/web/src/components/shell/dashboard-shell.tsx apps/web/src/components/home/learning-workspace.tsx apps/web/src/lib/product-data.ts apps/web/src/app/tools/page.tsx
git commit -m "refactor: point english lesson links to text2lesson"
```

---

### Task 5: Full verification and browser acceptance

**Files:**
- Verify only; edit the smallest relevant file only if a verification failure identifies a defect.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified route, auth and history behavior.

- [ ] **Step 1: Run Web tests**

```bash
pnpm --filter @xueleai/web test
```

Expected: all tests PASS.

- [ ] **Step 2: Run Web typecheck**

```bash
pnpm --filter @xueleai/web typecheck
```

Expected: TypeScript exits with status 0.

- [ ] **Step 3: Run Web build because routes changed**

```bash
pnpm --filter @xueleai/web build
```

Expected: Next.js build exits with status 0 and route output includes `/text2lesson` and `/text2lesson/[id]` but not the two old page routes.

- [ ] **Step 4: Run diff integrity checks**

```bash
git diff --check
rg -n 'experience/english-guided-study|study/english-guided-study' apps/web/src --glob '!app/api/**'
```

Expected: `git diff --check` passes; old page URL audit has no matches.

- [ ] **Step 5: Browser acceptance on port 3321**

Verify:

1. `/text2lesson` opens the console.
2. `/text2lesson/<existing-id>` opens the learning page.
3. `/experience/english-guided-study` returns the Next.js 404 page.
4. `/study/english-guided-study/<existing-id>` returns the Next.js 404 page.
5. Guest left sidebar shows no browser-local history.
6. Login with `next=/text2lesson` returns to the console and shows account history without manual refresh.
7. Logout clears the account history state.

- [ ] **Step 6: Commit verification-only fixes when needed**

Do not create an empty commit. If verification required a code correction, stage only that correction and commit with a focused `fix:` message.
