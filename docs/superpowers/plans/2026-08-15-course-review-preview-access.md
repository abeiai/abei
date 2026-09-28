# Course Review Preview Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/c/{courseId}` the single faithful course preview for creators and administrators while returning a non-leaking “资源审核中” page to unauthorized visitors before first approval and preserving the last approved version during re-review.

**Architecture:** NestJS resolves an optional user/admin viewer and projects either the working revision, approved revision, or a minimal reviewing state before data leaves the API. Next.js consumes a discriminated course-page response, renders the existing `PublicCourseDetail` for available content, and renders a generic reviewing state otherwise. Author and admin preview actions point to the same `/c/{courseId}` route; lesson clickability depends only on the lesson’s own approved fingerprint and learnable state.

**Tech Stack:** NestJS, TypeScript, Prisma, Next.js App Router, React, TailwindCSS, Node test runner

## Global Constraints

- All user-facing labels and errors remain Simplified Chinese.
- Pending title, summary, cover, tags, author, item names, item IDs, and internal keys must never reach unauthorized clients.
- The public course list remains anonymous and continues to exclude never-approved courses.
- A published course under re-review continues to expose only its last approved revision to ordinary visitors.
- No database schema, migration, seed, payment, wallet, AI precheck, lesson content model, or administrator role changes.
- `/c/{courseId}` remains the stable canonical course address.
- Existing unrelated worktree changes must be preserved.

---

### Task 1: Add access-aware course-page projection in the API service

**Files:**
- Modify: `apps/api-core/src/courses/courses.service.ts`
- Test: `apps/api-core/tests/courses-service.test.ts`

**Interfaces:**
- Produces: `CoursePageViewer = { userId: string | null; isAdmin: boolean }`
- Produces: `CoursePageResult = { state: "AVAILABLE"; course: PublicCourse; previewMode: "PUBLIC" | "CREATOR" | "ADMIN" } | { state: "REVIEWING"; courseId: string }`
- Produces: `CoursesService.getCoursePage(id: string, viewer: CoursePageViewer): Promise<CoursePageResult>`
- Preserves: `CoursesService.listPublicCourses(): Promise<PublicCourse[]>`

- [ ] **Step 1: Write failing service tests for first-review access and data minimization**

Add `coursePageFixture(options: { approved: boolean; approvedName?: string; workingName: string })` beside the existing public-course fixtures. It must return one course owned by `user-1`, set `publishedAt` and `approvedRevision` only when `approved` is true, always include a `workingRevision`, and implement `course.findUnique()` for the requested ID. Then add these assertions:

```ts
test("首次待审课程只向创作者和管理员返回工作版本", async () => {
  const service = serviceWithPrisma(coursePageFixture({ approved: false, workingName: "待审新版" }));

  assert.deepEqual(
    await service.getCoursePage(courseId, { userId: null, isAdmin: false }),
    { state: "REVIEWING", courseId }
  );

  const creator = await service.getCoursePage(courseId, { userId: "user-1", isAdmin: false });
  const admin = await service.getCoursePage(courseId, { userId: null, isAdmin: true });
  assert.equal(creator.state === "AVAILABLE" && creator.course.name, "待审新版");
  assert.equal(admin.state === "AVAILABLE" && admin.course.name, "待审新版");
});

test("非创作者登录用户不能读取首次待审字段", async () => {
  const result = await service.getCoursePage(courseId, { userId: "user-2", isAdmin: false });
  assert.deepEqual(result, { state: "REVIEWING", courseId });
  assert.doesNotMatch(JSON.stringify(result), /待审新版|待审简介|cover|item-/u);
});
```

- [ ] **Step 2: Run the service tests and verify RED**

Run:

```bash
set -a; source .env; set +a
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/courses-service.test.ts
```

Expected: FAIL because `getCoursePage`, the viewer types, and working-revision projection do not exist.

- [ ] **Step 3: Add failing tests for published re-review version selection**

```ts
test("已发布课程复审时访客看旧版而创作者和管理员看新版", async () => {
  const service = serviceWithPrisma(coursePageFixture({
    approved: true,
    approvedName: "已审核旧版",
    workingName: "待审新版"
  }));

  const visitor = await service.getCoursePage(courseId, { userId: null, isAdmin: false });
  const creator = await service.getCoursePage(courseId, { userId: "user-1", isAdmin: false });
  const admin = await service.getCoursePage(courseId, { userId: null, isAdmin: true });

  assert.equal(visitor.state === "AVAILABLE" && visitor.course.name, "已审核旧版");
  assert.equal(creator.state === "AVAILABLE" && creator.course.name, "待审新版");
  assert.equal(admin.state === "AVAILABLE" && admin.course.name, "待审新版");
});
```

- [ ] **Step 4: Run the service tests and verify the new test is RED**

Run the Task 1 test command again.

Expected: FAIL because the service still has no viewer-aware revision selection.

- [ ] **Step 5: Implement minimal access-aware projection**

In `courses.service.ts`:

1. Extend the detail include to load `workingRevision` alongside `approvedRevision`, author nickname, enrollment count, and all existing course revision material data.
2. Export the exact viewer/result types from the Interfaces block.
3. Implement `getCoursePage` so it first finds the course by ID without a published-only filter, then chooses a revision on the server:

```ts
const canPreviewWorking = viewer.isAdmin || viewer.userId === course.userId;
const revision = canPreviewWorking && course.workingRevision
  ? course.workingRevision
  : course.approvedRevision;

if (!revision || (!canPreviewWorking && !course.publishedAt)) {
  return { state: "REVIEWING", courseId: course.id };
}
```

4. Return `previewMode: "ADMIN"` for administrators, `"CREATOR"` for the owner, and `"PUBLIC"` otherwise.
5. Refactor `toPublicCourse` to accept the selected revision explicitly. Use `course.publishedAt ?? revision.updatedAt` as the displayed date for a never-published authorized preview.
6. If the course ID does not exist, preserve the existing `AppException(40401, "课程不存在或尚未发布", HttpStatus.NOT_FOUND)` behavior.

- [ ] **Step 6: Make lesson links depend only on each lesson’s review state**

Replace:

```ts
launchHref: !reviewing && ready && record
```

with:

```ts
launchHref: ready && record
```

Keep `reviewing` as display metadata, but do not use it as a course-wide lesson lock.

- [ ] **Step 7: Run service tests and verify GREEN**

Run the Task 1 test command.

Expected: all `courses-service.test.ts` tests pass, including updated expectations that a ready lesson remains clickable during course re-review while a changed lesson remains locked.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/api-core/src/courses/courses.service.ts apps/api-core/tests/courses-service.test.ts
git commit -m "feat(api): project pending course pages by viewer"
```

---

### Task 2: Resolve optional creator and administrator identity at the public controller

**Files:**
- Modify: `apps/api-core/src/courses/courses.controller.ts`
- Test: `apps/api-core/tests/courses-service.test.ts`

**Interfaces:**
- Consumes: `CoursesService.getCoursePage(id, viewer)` from Task 1
- Consumes: existing `AuthService.me(request)` and `AdminAuthService.me(request)`
- Produces: `GET /api/public/courses/:id` returning `CoursePageResult`

- [ ] **Step 1: Write failing controller tests for anonymous, creator, and admin viewers**

Replace the old assertion that the public detail controller never reads login state with focused tests:

```ts
test("公开课程详情把可选用户和管理员身份传给课程页面服务", async () => {
  const viewers: unknown[] = [];
  const controller = new PublicCoursesController(
    { me: async () => ({ id: "user-1" }) } as never,
    { me: async () => ({ id: "admin-1" }) } as never,
    {
      listPublicCourses: async () => [],
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never
  );

  await controller.get({}, "course-1");
  assert.deepEqual(viewers, [{ userId: "user-1", isAdmin: true }]);
});
```

Add separate cases where either or both `me()` calls throw `AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED)` and assert the unresolved identity becomes `null`/`false`, while a non-401 exception is rethrown rather than treated as anonymous.

- [ ] **Step 2: Run the controller tests and verify RED**

Run the Task 1 test command.

Expected: FAIL because `PublicCoursesController` has no auth dependencies, request parameter, or `getCoursePage` call.

- [ ] **Step 3: Implement optional identity resolution**

Modify `PublicCoursesController` to inject `AuthService`, `AdminAuthService`, and `CoursesService`. Add `@Req() request` to the detail endpoint only. Resolve both identities without requiring login:

```ts
private async optionalIdentity<T>(reader: () => Promise<T>) {
  try {
    return await reader();
  } catch (error) {
    if (error instanceof AppException && error.getStatus() === HttpStatus.UNAUTHORIZED) {
      return null;
    }
    throw error;
  }
}
```

Call both readers with `Promise.all`, then pass `{ userId: user?.id ?? null, isAdmin: Boolean(admin) }` to `getCoursePage`. Leave the list endpoint anonymous and unchanged.

- [ ] **Step 4: Run API tests and verify GREEN**

Run the Task 1 test command.

Expected: all course service/controller tests pass and non-authentication failures remain visible.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api-core/src/courses/courses.controller.ts apps/api-core/tests/courses-service.test.ts
git commit -m "feat(api): authorize pending course detail previews"
```

---

### Task 3: Render available and reviewing course-page states in Next.js

**Files:**
- Create: `apps/web/src/components/courses/course-reviewing-state.tsx`
- Modify: `apps/web/src/lib/course-types.ts`
- Modify: `apps/web/src/lib/course-api.ts`
- Modify: `apps/web/src/lib/public-course-metadata.ts`
- Modify: `apps/web/src/app/c/[id]/page.tsx`
- Test: `apps/web/tests/public-course-presentation.test.ts`

**Interfaces:**
- Produces: `CoursePageResult` matching the API discriminated union
- Produces: `getCoursePage(id: string): Promise<CoursePageResult>`
- Produces: `getCoursePageOrNull(id: string): Promise<CoursePageResult | null>`
- Produces: `buildReviewingCourseMetadata(courseId: string, siteUrl?: string, fallbackSiteUrl?: string): Metadata`
- Produces: `CourseReviewingState({ courseId }: { courseId: string })`

- [ ] **Step 1: Write failing API client tests proving cookies are forwarded for detail only**

In `public-course-presentation.test.ts`, read `course-api.ts` as source alongside the existing page-source tests and assert:

```ts
test("课程详情转发登录 Cookie 以支持创作者和管理员预览", async () => {
  const detailHelper = courseApiSource.slice(
    courseApiSource.indexOf("export async function getCoursePage"),
    courseApiSource.indexOf("export async function getCoursePageOrNull")
  );
  const listHelper = courseApiSource.slice(
    courseApiSource.indexOf("export async function getPublicCourses"),
    courseApiSource.indexOf("export async function getCoursePage")
  );

  assert.doesNotMatch(detailHelper, /includeCredentials:\s*false/u);
  assert.match(listHelper, /includeCredentials:\s*false/u);
});
```

- [ ] **Step 2: Run Web tests and verify RED**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/public-course-presentation.test.ts
```

Expected: FAIL because the detail client explicitly sets `includeCredentials: false` and has no union result.

- [ ] **Step 3: Add the result type and credential-aware detail client**

Add to `course-types.ts`:

```ts
export type CoursePageResult =
  | {
      state: "AVAILABLE";
      course: PublicCourse;
      previewMode: "PUBLIC" | "CREATOR" | "ADMIN";
    }
  | {
      state: "REVIEWING";
      courseId: string;
    };
```

Replace `getPublicCourse`/`getPublicCourseOrNull` detail helpers with `getCoursePage`/`getCoursePageOrNull`. Do not pass `includeCredentials: false` for the detail call. Keep the list helper unchanged and anonymous.

- [ ] **Step 4: Write failing rendering and metadata tests for reviewing state**

Add tests that render `CourseReviewingState` and inspect metadata:

```ts
test("未授权待审课程只显示资源审核中且不包含待审资料", () => {
  const html = renderToStaticMarkup(<CourseReviewingState courseId={courseId} />);
  assert.match(html, /资源审核中/u);
  assert.doesNotMatch(html, /课程作者|课程简介|课程封面|课件/u);
});

test("审核中元数据使用稳定地址和通用文案", () => {
  const metadata = buildReviewingCourseMetadata(courseId, "https://xueleai.com");
  assert.equal(metadata.title, "资源审核中");
  assert.deepEqual(metadata.alternates, { canonical: `https://xueleai.com/c/${courseId}` });
  assert.doesNotMatch(JSON.stringify(metadata), /待审新版|待审简介/u);
});
```

- [ ] **Step 5: Run Web tests and verify the rendering tests are RED**

Run the Task 3 Web test command again.

Expected: FAIL because the state component and metadata helper do not exist.

- [ ] **Step 6: Implement reviewing state, metadata, and page branching**

1. Build `CourseReviewingState` with the existing `PublicShell` page width, `TextbookBreadcrumbs`, and a centered bordered status panel containing only “资源审核中”和“该资源正在审核，审核完成后即可访问。”
2. Implement `buildReviewingCourseMetadata` using the existing trusted site URL normalization and `/c/{courseId}` canonical logic. Do not include course image, author, tags, or pending text.
3. Update `apps/web/src/app/c/[id]/page.tsx` so `loadCoursePage` validates the 24-character ID and returns the union. `AVAILABLE` renders the existing `PublicCourseDetail`; `REVIEWING` renders `CourseReviewingState`.
4. In `generateMetadata`, call `buildPublicCourseMetadata` only for `AVAILABLE`; otherwise call `buildReviewingCourseMetadata`.
5. Preserve 404 for invalid IDs and truly missing courses, and preserve thrown service/network errors.

- [ ] **Step 7: Run Web tests and verify GREEN**

Run the Task 3 Web test command.

Expected: all public course presentation, error, metadata, and reviewing-state tests pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/web/src/components/courses/course-reviewing-state.tsx apps/web/src/lib/course-types.ts apps/web/src/lib/course-api.ts apps/web/src/lib/public-course-metadata.ts 'apps/web/src/app/c/[id]/page.tsx' apps/web/tests/public-course-presentation.test.ts
git commit -m "feat(web): render secure pending course pages"
```

---

### Task 4: Unify author/admin preview entry points and lesson click rules

**Files:**
- Modify: `apps/web/src/lib/course-editor-state.ts`
- Modify: `apps/web/src/components/courses/course-editor.tsx`
- Modify: `apps/web/src/app/dashboard/courses/page.tsx`
- Replace: `apps/web/src/app/dashboard/courses/[id]/preview/page.tsx`
- Modify: `apps/web/src/components/admin/resource-review-manager.tsx`
- Test: `apps/web/tests/public-course-presentation.test.ts`
- Test: `apps/web/tests/course-editor-state.test.ts`
- Test: `apps/web/tests/resource-review-manager.test.ts`

**Interfaces:**
- Consumes: stable `/c/{courseId}` route from Task 3
- Consumes: `CourseReviewRequest.courseId` and `CourseReviewRequest.affectedCourses`
- Produces: `courseReviewPreviewCourses(review)` returning deduplicated `{ id: string; name: string; href: string }[]`

- [ ] **Step 1: Write failing tests for lesson-level locking during course review**

Change the current Web assertion from “课程复审时所有课件禁用” to:

```ts
test("课程复审时只禁用真实待审课件", () => {
  const course = publicCourseFixture({
    reviewing: true,
    itemStates: ["READY", "PENDING", "READY"]
  });

  assert.deepEqual(
    course.items.map((item) => publicCourseItemPresentation(course, item).href),
    ["/media-tutor/share-1", null, "/flashcard/deck-1"]
  );
});
```

- [ ] **Step 2: Write failing tests for unified preview URLs**

Add source/behavior assertions that:

- course editor preview links use `/c/${courseId}`;
- dashboard author preview links use `/c/${course.id}`;
- the legacy dashboard preview page calls `redirect(`/c/${id}`)`;
- a course review produces one `/c/{courseId}` preview target;
- a material review with multiple affected courses produces one deduplicated link per affected course;
- the admin manager no longer renders `JSON.stringify(localizeCourseReviewValue(review.afterSnapshot), null, 2)` as the primary preview.

- [ ] **Step 3: Run the three Web test files and verify RED**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/public-course-presentation.test.ts tests/course-editor-state.test.ts tests/resource-review-manager.test.ts
```

Expected: FAIL because course-wide locking and the old preview pages/modal are still present.

- [ ] **Step 4: Remove course-wide locking in Web presentation**

Update `publicCourseItemPresentation` so it returns an href whenever `item.reviewState === "READY" && item.launchHref`, regardless of `course.reviewing`. Preserve the existing status labels for pending and rejected items.

- [ ] **Step 5: Point author preview actions at the real course page**

Change both author-facing links to `/c/{courseId}`. Replace the legacy preview page implementation with a server redirect:

```ts
import { redirect } from "next/navigation";

export default async function CoursePreviewPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/c/${id}`);
}
```

The existing `/dashboard` proxy still requires a user login before this compatibility redirect.

- [ ] **Step 6: Replace the admin JSON preview with real course links**

Add a pure `courseReviewPreviewCourses(review)` helper next to the manager:

- for `COURSE_REVISION`, use `review.courseId` and `courseReviewTitle(review)`;
- for `MATERIAL_CHANGE`, map `review.affectedCourses` to `/c/{course.id}`;
- deduplicate by course ID;
- return an empty list only for malformed historical records.

For one target, the “预览” button opens that URL in a new tab with `rel="noreferrer"`. For multiple targets, keep the preview modal but render a list of named “打开课程页” links; remove the cover/summary/raw JSON snapshot preview. If no target exists, disable the button with a concise tooltip/title “暂无可预览课程”。

- [ ] **Step 7: Run the three Web test files and verify GREEN**

Run the Task 4 Web test command.

Expected: all click-rule and preview-entry tests pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/web/src/lib/course-editor-state.ts apps/web/src/components/courses/course-editor.tsx apps/web/src/app/dashboard/courses/page.tsx 'apps/web/src/app/dashboard/courses/[id]/preview/page.tsx' apps/web/src/components/admin/resource-review-manager.tsx apps/web/tests/public-course-presentation.test.ts apps/web/tests/course-editor-state.test.ts apps/web/tests/resource-review-manager.test.ts
git commit -m "feat(web): unify course review preview entry points"
```

---

### Task 5: Run strict verification and authenticated access review

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Verifies the API/Web contract and the exact access matrix from the design spec.

- [ ] **Step 1: Generate Prisma client and run API checks**

```bash
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/api-core lint
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/api-core build
```

Expected: exit code 0; the full API suite reports zero failures.

- [ ] **Step 2: Run Web checks**

```bash
pnpm --filter @xueleai/web lint
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web build
```

Expected: exit code 0; the full Web suite reports zero failures and `/c/[id]`, `/admin/course-reviews`, and the legacy preview route compile.

- [ ] **Step 3: Run database contract checks without migration**

```bash
pnpm --filter @xueleai/database test
pnpm --filter @xueleai/database exec prisma validate --schema prisma/schema.prisma
git diff --exit-code -- packages/database/prisma/schema.prisma packages/database/prisma/migrations
```

Expected: tests/validation pass and there is no schema or migration diff from this feature.

- [ ] **Step 4: Perform independent code review**

Ask a separate reviewer to inspect only the commits from Tasks 1–4 for:

- unauthorized pending-field leakage;
- visitor/creator/admin version-selection mistakes;
- swallowed non-authentication failures;
- public list regressions;
- course-wide lesson locking regressions;
- incorrect admin preview targets for material changes.

Address every confirmed high/medium issue with a new failing regression test before changing production code.

- [ ] **Step 5: Verify browser states using the selected browser**

Use a read-only database query to identify one never-approved pending course and one published course under re-review before opening the browser:

```bash
psql "$DATABASE_URL" -Atc 'SELECT "id", "userId", "approvedRevisionId", "workingRevisionId" FROM "courses" WHERE "reviewState" = '\''PENDING_REVIEW'\'' ORDER BY "updatedAt" DESC LIMIT 10;'
```

Choose one row with a null `approvedRevisionId` and one row with a non-null `approvedRevisionId`, then verify:

1. Anonymous first-review URL: HTTP-rendered “资源审核中”; no pending name, cover, summary, tags, author, or items in visible page content.
2. Creator first-review URL: the same `PublicCourseDetail` layout with the working revision.
3. Administrator first-review URL opened from `/admin/course-reviews`: the working revision in a new tab.
4. Anonymous re-review URL: last approved revision.
5. Creator/admin re-review URL: working revision.
6. A re-review course with one changed lesson: ready lessons remain clickable and only the changed lesson is locked.

If the selected browser lacks the required authenticated role, report that exact missing manual state rather than substituting another browser or claiming it passed.

- [ ] **Step 6: Commit confirmed verification fixes when Step 4 or 5 changed code**

```bash
git add apps/api-core/src/courses/courses.service.ts apps/api-core/src/courses/courses.controller.ts apps/api-core/tests/courses-service.test.ts apps/web/src/lib/course-types.ts apps/web/src/lib/course-api.ts apps/web/src/lib/public-course-metadata.ts apps/web/src/lib/course-editor-state.ts 'apps/web/src/app/c/[id]/page.tsx' 'apps/web/src/app/dashboard/courses/[id]/preview/page.tsx' apps/web/src/app/dashboard/courses/page.tsx apps/web/src/components/courses/course-reviewing-state.tsx apps/web/src/components/courses/course-editor.tsx apps/web/src/components/admin/resource-review-manager.tsx apps/web/tests/public-course-presentation.test.ts apps/web/tests/course-editor-state.test.ts apps/web/tests/resource-review-manager.test.ts
git commit -m "fix: close course preview access regressions"
```

Skip this commit when verification produces no code changes.
