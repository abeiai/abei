import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { PrismaClient } from "@xueleai/database";
import { AdminCourseReviewsController } from "../src/courses/admin-course-reviews.controller.js";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { CourseReviewService } from "../src/courses/course-review.service.js";

type FixtureOptions = {
  aiGenerate?: (input?: unknown) => Promise<{ taskId: string; text: string }>;
  materialChanged?: boolean;
  published?: boolean;
  scenarioAuthorization?: (
    subject: MutableRecord,
    scenarioSlug: string,
    callback: () => Promise<unknown>
  ) => Promise<unknown>;
  sharedMaterialCourseCount?: number;
};

type MutableRecord = Record<string, unknown>;

function reviewVersion(value: unknown) {
  return new Date(value as string | Date).toISOString();
}

function reviewServiceFixture(options: FixtureOptions = {}) {
  const now = new Date("2026-07-17T12:00:00.000Z");
  let clock = now.getTime();
  const events: string[] = [];
  const transactionOptions: Array<MutableRecord | undefined> = [];
  const cleanedCoverAssets: Array<{ assetIds: string[]; userId: string }> = [];
  let publicationUpdateCount = 0;
  const materialId = "flashcard-1";
  const oldMaterial = {
    id: materialId,
    userId: "user-1",
    title: "基础闪卡",
    summary: "审核时的内容",
    knowledgeMap: [],
    status: "READY",
    cards: [{ id: "card-1", type: "词义", front: "hello", back: "你好", source: null, tags: [], sortOrder: 0 }],
    updatedAt: now
  };
  const material = {
    ...oldMaterial,
    summary: options.materialChanged === false
      ? oldMaterial.summary
      : options.sharedMaterialCourseCount ? "课件已更新" : "当前内容"
  };
  const oldSnapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", oldMaterial);
  const currentSnapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", material);
  const publication: MutableRecord = {
    id: "publication-1",
    materialType: "LEARNING_FLASHCARD",
    learningFlashcardDeckId: materialId,
    videoGuideLessonId: null,
    englishGuidedStudyMaterialId: null,
    status: options.published || options.sharedMaterialCourseCount ? "APPROVED" : "PENDING",
    approvedHash: options.published || options.sharedMaterialCourseCount ? hashCourseSnapshot(oldSnapshot) : null,
    currentHash: hashCourseSnapshot(currentSnapshot),
    approvedSnapshot: options.published || options.sharedMaterialCourseCount ? oldSnapshot : null,
    currentSnapshot
  };
  const oldRevision: MutableRecord = {
    id: "revision-approved",
    courseId: "course-1",
    coverMediaId: "cover-1",
    name: "已上线课程",
    summary: "旧版课程简介",
    tags: ["英语"],
    status: "APPROVED",
    coverMedia: { id: "cover-1", url: "/uploads/old-cover.png" },
    items: []
  };
  const revision: MutableRecord = {
    id: "revision-working",
    courseId: "course-1",
    coverMediaId: "cover-2",
    name: "新版课程",
    summary: "新版课程简介",
    tags: ["英语", "入门"],
    status: "DRAFT",
    submittedAt: null,
    reviewedAt: null,
    rejectionReason: null,
    coverMedia: { id: "cover-2", url: "/uploads/new-cover.png" },
    items: []
  };
  const item: MutableRecord = {
    id: "item-working",
    revisionId: revision.id,
    publicationId: publication.id,
    materialType: "LEARNING_FLASHCARD",
    learningFlashcardDeckId: materialId,
    videoGuideLessonId: null,
    englishGuidedStudyMaterialId: null,
    displayName: "基础闪卡",
    sortOrder: 0,
    publication,
    learningFlashcardDeck: material,
    videoGuideLesson: null,
    englishGuidedStudyMaterial: null
  };
  revision.items = [item];
  oldRevision.items = [{ ...item, id: "item-approved", revisionId: oldRevision.id }];
  const course: MutableRecord = {
    id: "course-1",
    userId: "user-1",
    approvedRevisionId: options.published || options.sharedMaterialCourseCount ? oldRevision.id : null,
    workingRevisionId: revision.id,
    reviewState: options.published || options.sharedMaterialCourseCount ? "PUBLISHED" : "DRAFT",
    publishedAt: options.published || options.sharedMaterialCourseCount ? now : null,
    approvedRevision: options.published || options.sharedMaterialCourseCount ? oldRevision : null,
    workingRevision: revision
  };
  const courses: MutableRecord[] = [course];

  for (let index = 1; index < (options.sharedMaterialCourseCount ?? 0); index += 1) {
    const sharedRevision = {
      ...oldRevision,
      id: `revision-shared-${index}`,
      courseId: `course-shared-${index}`,
      items: [{ ...oldRevision.items[0], id: `item-shared-${index}`, revisionId: `revision-shared-${index}` }]
    };
    courses.push({
      id: `course-shared-${index}`,
      userId: `user-${index + 1}`,
      approvedRevisionId: sharedRevision.id,
      workingRevisionId: null,
      reviewState: "PUBLISHED",
      publishedAt: now,
      approvedRevision: sharedRevision,
      workingRevision: null
    });
  }

  const requests: MutableRecord[] = [];
  const preexistingRequest: MutableRecord = {
    id: "request-existing",
    scope: "COURSE_REVISION",
    status: "PENDING",
    courseId: course.id,
    courseRevisionId: revision.id,
    materialPublicationId: null,
    submittedByUserId: course.userId,
    reviewedByAdminId: null,
    beforeSnapshot: null,
    afterSnapshot: {
      name: revision.name,
      items: [{
        publicationId: publication.id,
        materialType: "LEARNING_FLASHCARD",
        learningFlashcardDeckId: materialId,
        displayName: item.displayName,
        sortOrder: 0,
        firstPublication: publication.approvedHash === null,
        materialHash: hashCourseSnapshot(currentSnapshot),
        materialSnapshot: currentSnapshot
      }]
    },
    diff: [],
    reviewNote: null,
    aiPrecheckStatus: "NOT_STARTED",
    aiPrecheckProgress: 0,
    aiPrecheckMessage: null,
    aiPrecheckResult: null,
    aiPrecheckTaskId: null,
    aiPrecheckTrigger: null,
    aiPrecheckStartedAt: null,
    aiPrecheckCompletedAt: null,
    submittedAt: now,
    reviewedAt: null,
    updatedAt: now,
    course,
    courseRevision: revision,
    materialPublication: null
  };

  if (options.published === undefined && options.sharedMaterialCourseCount === undefined) {
    course.reviewState = "PENDING_REVIEW";
    revision.status = "PENDING";
    requests.push(preexistingRequest);
  }

  const affectedCourses = () => courses
    .filter((candidate) => candidate.publishedAt && candidate.approvedRevision?.items.some(
      (candidateItem: MutableRecord) => candidateItem.publicationId === publication.id
    ))
    .map((candidate) => ({ id: candidate.id, name: candidate.approvedRevision.name }));

  function requestWithRelations(request: MutableRecord) {
    return {
      ...request,
      course: request.courseId ? courses.find((candidate) => candidate.id === request.courseId) ?? null : null,
      courseRevision: request.courseRevisionId === revision.id ? revision : null,
      materialPublication: request.materialPublicationId === publication.id
        ? { ...publication, affectedCourses: affectedCourses() }
        : null,
      affectedCourses: request.materialPublicationId ? affectedCourses() : []
    };
  }

  const prisma: MutableRecord = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "courses"')) {
        assert.match(sql, /FOR UPDATE/);
        events.push("LOCK_COURSE");
      } else if (sql.includes('FROM "course_revision_items"')) {
        assert.match(sql, /pg_advisory_xact_lock/);
        events.push("LOCK_REVISION_MATERIALS");
      } else if (sql.includes('JOIN "course_revision_items"')) {
        assert.match(sql, /FOR UPDATE/);
        events.push("LOCK_REVISION_PUBLICATIONS");
      } else if (sql.includes('FROM "course_material_publications"')) {
        assert.match(sql, /FOR UPDATE/);
        events.push("LOCK_PUBLICATION");
      } else {
        events.push("LOCK_MATERIAL");
      }
      return [{ locked: 1 }];
    },
    course: {
      findUnique: async ({ where }: MutableRecord) => {
        events.push("READ_COURSE");
        return courses.find((candidate) => candidate.id === where.id) ?? null;
      },
      findMany: async () => courses.filter((candidate) =>
        candidate.publishedAt && candidate.approvedRevision?.items.some(
          (candidateItem: MutableRecord) => candidateItem.publicationId === publication.id
        )
      ),
      update: async ({ where, data }: MutableRecord) => {
        const target = courses.find((candidate) => candidate.id === where.id);
        Object.assign(target!, data);
        target!.approvedRevision = target!.approvedRevisionId === revision.id
          ? revision
          : target!.approvedRevisionId === oldRevision.id ? oldRevision : null;
        target!.workingRevision = target!.workingRevisionId === revision.id ? revision : null;
        return target;
      }
    },
    courseRevision: {
      findMany: async ({ where }: MutableRecord) => {
        const revisions = course.approvedRevision ? [oldRevision, revision] : [revision];
        return revisions
          .filter((candidate) => candidate.courseId === where.courseId
            && candidate.coverMediaId !== (where.coverMediaId as MutableRecord | undefined)?.not)
          .map((candidate) => ({ coverMediaId: candidate.coverMediaId }));
      },
      updateMany: async ({ where, data }: MutableRecord) => {
        const revisions = (course.approvedRevision ? [oldRevision, revision] : [revision])
          .filter((candidate) => candidate.courseId === where.courseId);
        for (const candidate of revisions) Object.assign(candidate, data);
        return { count: revisions.length };
      },
      update: async ({ where, data }: MutableRecord) => {
        const target = where.id === revision.id ? revision : oldRevision;
        Object.assign(target, data);
        return target;
      }
    },
    courseMaterialPublication: {
      findUnique: async ({ where }: MutableRecord) => {
        const id = where.id
          ?? where.learningFlashcardDeckId
          ?? where.videoGuideLessonId
          ?? where.englishGuidedStudyMaterialId;
        return id === publication.id || id === materialId
          ? { ...publication, revisionItems: courses.flatMap((candidate) => candidate.approvedRevision?.items ?? []) }
          : null;
      },
      findMany: async () => affectedCourses().length > 0 ? [{ ...publication }] : [],
      update: async ({ where, data }: MutableRecord) => {
        assert.equal(where.id, publication.id);
        publicationUpdateCount += 1;
        Object.assign(publication, data);
        return publication;
      }
    },
    courseReviewRequest: {
      create: async ({ data }: MutableRecord) => {
        const request = {
          id: `request-${requests.length + 1}`,
          status: "PENDING",
          reviewedByAdminId: null,
          reviewNote: null,
          aiPrecheckStatus: "NOT_STARTED",
          aiPrecheckProgress: 0,
          aiPrecheckMessage: null,
          aiPrecheckResult: null,
          aiPrecheckTaskId: null,
          aiPrecheckTrigger: null,
          aiPrecheckStartedAt: null,
          aiPrecheckCompletedAt: null,
          reviewedAt: null,
          submittedAt: now,
          updatedAt: new Date(++clock),
          ...data
        };
        requests.push(request);
        return requestWithRelations(request);
      },
      findFirst: async ({ where }: MutableRecord) => {
        const request = requests.find((candidate) =>
          (!where.id || candidate.id === where.id)
          && (!where.scope || candidate.scope === where.scope)
          && (!where.status || candidate.status === where.status)
          && (!where.courseRevisionId || candidate.courseRevisionId === where.courseRevisionId)
          && (!where.materialPublicationId || candidate.materialPublicationId === where.materialPublicationId)
        );
        return request ? requestWithRelations(request) : null;
      },
      findUnique: async ({ where }: MutableRecord) => {
        const request = requests.find((candidate) => candidate.id === where.id);
        return request ? requestWithRelations(request) : null;
      },
      findMany: async () => requests.map(requestWithRelations),
      update: async ({ where, data }: MutableRecord) => {
        const request = requests.find((candidate) => candidate.id === where.id);
        Object.assign(request!, data, { updatedAt: new Date(++clock) });
        return requestWithRelations(request!);
      },
      updateMany: async ({ where, data }: MutableRecord) => {
        const request = requests.find((candidate) => candidate.id === where.id
          && candidate.status === where.status
          && (!where.updatedAt
            || new Date(candidate.updatedAt as string | Date).getTime()
              === new Date(where.updatedAt as string | Date).getTime()));
        if (!request) return { count: 0 };
        Object.assign(request, data, { updatedAt: new Date(++clock) });
        return { count: 1 };
      },
      deleteMany: async ({ where }: MutableRecord) => {
        const before = requests.length;
        for (let index = requests.length - 1; index >= 0; index -= 1) {
          const candidate = requests[index]!;
          if ((!where.scope || candidate.scope === where.scope)
            && (!where.status || candidate.status === where.status)
            && (!where.materialPublicationId || candidate.materialPublicationId === where.materialPublicationId)) {
            requests.splice(index, 1);
          }
        }
        return { count: before - requests.length };
      }
    },
    learningFlashcardDeck: {
      findUnique: async ({ where }: MutableRecord) => {
        events.push("READ_MATERIAL");
        return where.id === materialId ? material : null;
      }
    },
    videoGuideLesson: { findUnique: async () => null },
    englishGuidedStudyMaterial: { findUnique: async () => null },
    aiScenario: { upsert: async () => ({ id: "scenario-resource-ai-precheck" }) }
  };
  prisma.$transaction = async (
    callback: (transaction: MutableRecord) => Promise<unknown>,
    options?: MutableRecord
  ) => {
    transactionOptions.push(options);
    return callback(prisma);
  };

  const service = new CourseReviewService(
    options.aiGenerate ? {
      generateScenarioTextForExternalBilling: options.aiGenerate
    } as never : undefined,
    options.scenarioAuthorization ? {
      runWithScenarioAuthorization: options.scenarioAuthorization
    } as never : undefined,
    {
      cleanupUnreferencedCourseCoverAssets: async (userId: string, assetIds: string[]) => {
        cleanedCoverAssets.push({ assetIds, userId });
        return { deletedAssetIds: assetIds };
      }
    } as never
  );
  (service as unknown as { prisma: object }).prisma = prisma;
  const state = {
    course,
    revision,
    publications: [publication],
    materialId,
    request: preexistingRequest,
    material,
    requests,
    events,
    transactionOptions,
    cleanedCoverAssets,
    get publicationUpdateCount() {
      return publicationUpdateCount;
    },
    get pendingMaterialRequests() {
      return requests
        .filter((request) => request.scope === "MATERIAL_CHANGE" && request.status === "PENDING")
        .map(requestWithRelations);
    }
  };

  return { service, state };
}

test("课程审核通过为多课件核验预留足够的事务时间", async () => {
  const { service, state } = reviewServiceFixture();

  await service.approve("admin-1", state.request.id as string, reviewVersion(state.request.updatedAt));

  assert.deepEqual(state.transactionOptions, [{ maxWait: 5_000, timeout: 30_000 }]);
});

test("课程提交为多课件快照预留足够的事务时间", async () => {
  const { service, state } = reviewServiceFixture({
    published: true,
    materialChanged: false
  });

  await service.submitCourse("user-1", state.course.id as string);

  assert.deepEqual(state.transactionOptions, [{ maxWait: 5_000, timeout: 30_000 }]);
});

test("课程提交批量锁定版本中的全部课件", async () => {
  const { service, state } = reviewServiceFixture({ published: false });

  await service.submitCourse("user-1", state.course.id as string);

  assert.deepEqual(state.events.slice(0, 4), [
    "LOCK_COURSE",
    "READ_COURSE",
    "LOCK_REVISION_MATERIALS",
    "LOCK_REVISION_PUBLICATIONS"
  ]);
});

test("课程提交的批量课件锁结果可由 Prisma 反序列化", {
  skip: !process.env.COURSE_REVIEW_TEST_DATABASE_URL
}, async () => {
  const requireFromDatabasePackage = createRequire(
    new URL("../../../packages/database/package.json", import.meta.url)
  );
  const { PrismaPg } = requireFromDatabasePackage("@prisma/adapter-pg");
  const databaseUrl = process.env.COURSE_REVIEW_TEST_DATABASE_URL!;
  const schema = `course_review_lock_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema: "public" }) });
  const isolated = new PrismaClient({ adapter: new PrismaPg(databaseUrl, { schema }) });
  const service = new CourseReviewService(undefined, undefined, undefined);
  const lockRevisionMaterials = (
    service as unknown as {
      lockRevisionMaterials(transaction: unknown, revisionId: string): Promise<void>;
    }
  ).lockRevisionMaterials.bind(service);

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await isolated.$executeRawUnsafe(`
      CREATE TABLE "${schema}"."course_revision_items" (
        "revisionId" TEXT NOT NULL,
        "materialType" TEXT NOT NULL,
        "videoGuideLessonId" TEXT,
        "englishGuidedStudyMaterialId" TEXT,
        "learningFlashcardDeckId" TEXT
      )
    `);
    await isolated.$executeRawUnsafe(`
      INSERT INTO "${schema}"."course_revision_items" (
        "revisionId",
        "materialType",
        "learningFlashcardDeckId"
      ) VALUES ('revision-1', 'LEARNING_FLASHCARD', 'flashcard-1')
    `);

    await isolated.$transaction(async (transaction) => {
      await lockRevisionMaterials(transaction, "revision-1");
    });
  } finally {
    await isolated.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});

test("课程提交不重复写入未变化的已审核课件状态", async () => {
  const { service, state } = reviewServiceFixture({
    published: true,
    materialChanged: false
  });

  await service.submitCourse("user-1", state.course.id as string);

  assert.equal(state.publicationUpdateCount, 0);
});

test("首次课程审核通过同时批准课程版本和未审核课件", async () => {
  const { service, state } = reviewServiceFixture({ published: false });
  const request = await service.submitCourse("user-1", state.course.id);
  assert.deepEqual(state.events.slice(0, 2), ["LOCK_COURSE", "READ_COURSE"]);
  await service.approve("admin-1", request.id, reviewVersion(request.updatedAt));
  assert.equal(state.course.reviewState, "PUBLISHED");
  assert.equal(state.course.approvedRevisionId, state.revision.id);
  assert.ok(state.publications.every((item) => item.status === "APPROVED" && item.approvedHash === item.currentHash));
});

test("已上线课程复审保留旧版并在通过后切换", async () => {
  const { service, state } = reviewServiceFixture({ published: true });
  const oldRevisionId = state.course.approvedRevisionId;
  const request = await service.submitCourse("user-1", state.course.id);
  assert.equal(state.course.approvedRevisionId, oldRevisionId);
  assert.equal(state.course.reviewState, "PENDING_REVIEW");
  await service.approve("admin-1", request.id, reviewVersion(request.updatedAt));
  assert.notEqual(state.course.approvedRevisionId, oldRevisionId);
  assert.equal(state.course.approvedRevision.coverMediaId, "cover-2");
  assert.deepEqual(state.cleanedCoverAssets, [{
    assetIds: ["cover-1"],
    userId: "user-1"
  }]);
});

test("已发布课程只改基础信息时审核请求不携带已审核课件内容", async () => {
  const { service, state } = reviewServiceFixture({
    published: true,
    materialChanged: false
  });

  const request = await service.submitCourse("user-1", state.course.id as string);
  const afterSnapshot = request.afterSnapshot as {
    items: Array<Record<string, unknown>>;
  };
  const submittedItem = afterSnapshot.items[0]!;

  assert.equal("firstPublication" in submittedItem, false);
  assert.equal("materialHash" in submittedItem, false);
  assert.equal("materialSnapshot" in submittedItem, false);

  const reviews = await service.listReviews({ status: "PENDING" });
  assert.deepEqual(reviews.map((review) => review.scope), ["COURSE_REVISION"]);
});

test("课程基础信息提审后修改已审核课件时两个审核范围互不阻塞", async () => {
  const { service, state } = reviewServiceFixture({
    published: true,
    materialChanged: false
  });
  const courseRequest = await service.submitCourse("user-1", state.course.id as string);
  const approvedMaterialHash = state.publications[0]!.approvedHash;

  state.material.summary = "课程提审后单独修改的课件内容";
  const materialRequest = await service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    state.materialId
  );

  assert.equal(materialRequest?.scope, "MATERIAL_CHANGE");
  await service.approve(
    "admin-1",
    courseRequest.id as string,
    reviewVersion(courseRequest.updatedAt)
  );

  assert.equal(state.course.approvedRevisionId, state.revision.id);
  assert.equal(state.course.reviewState, "PUBLISHED");
  assert.equal(state.publications[0]!.approvedHash, approvedMaterialHash);
  assert.equal(materialRequest?.status, "PENDING");
});

test("课件变更只生成一条待审请求并列出全部受影响课程", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 2 });
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  assert.equal(state.pendingMaterialRequests.length, 1);
  assert.equal(state.pendingMaterialRequests[0]?.affectedCourses.length, 2);
  assert.deepEqual(state.requests.map((request) => ({
    courseId: request.courseId,
    materialPublicationId: request.materialPublicationId,
    scope: request.scope
  })), [{
    courseId: undefined,
    materialPublicationId: state.publications[0]!.id,
    scope: "MATERIAL_CHANGE"
  }]);
});

test("两个管理员不能重复处理同一请求", async () => {
  const { service, state } = reviewServiceFixture();
  await service.approve("admin-1", state.request.id, reviewVersion(state.request.updatedAt));
  await assert.rejects(
    () => service.approve("admin-2", state.request.id, reviewVersion(state.request.updatedAt)),
    /审核状态已发生变化/
  );
});

test("审核决定必须匹配管理员看到的请求更新时间", async () => {
  const { service, state } = reviewServiceFixture();

  await assert.rejects(
    () => service.approve("admin-1", state.request.id as string, "2026-07-17T11:59:59.000Z"),
    /审核状态已发生变化/
  );
  assert.equal(state.request.status, "PENDING");
});

test("课件变更记录按素材锁、publication 行锁、源内容顺序读取", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });

  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);

  assert.deepEqual(state.events.slice(0, 3), [
    "LOCK_MATERIAL",
    "LOCK_PUBLICATION",
    "READ_MATERIAL"
  ]);
});

test("课件审批发现源内容已偏离管理员看到的快照时返回冲突", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  const approvedHash = state.publications[0]!.approvedHash;
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  const request = state.pendingMaterialRequests[0]!;
  state.material.summary = "管理员未看到的第三版内容";

  await assert.rejects(
    () => service.approve("admin-1", request.id as string, reviewVersion(request.updatedAt)),
    /审核内容已发生变化/
  );
  assert.equal(state.publications[0]!.approvedHash, approvedHash);
  assert.equal(request.status, "PENDING");
});

test("首次课程提交为每个课件固化安全快照、指纹和首次公开标记", async () => {
  const { service, state } = reviewServiceFixture({ published: false });

  const request = await service.submitCourse("user-1", state.course.id as string);
  const afterSnapshot = request.afterSnapshot as {
    items: Array<Record<string, unknown>>;
  };
  const submittedItem = afterSnapshot.items[0]!;

  assert.equal(submittedItem.firstPublication, true);
  assert.equal(submittedItem.materialHash, hashCourseSnapshot(submittedItem.materialSnapshot));
  assert.deepEqual(submittedItem.materialSnapshot, snapshotCourseMaterial(
    "LEARNING_FLASHCARD",
    state.material
  ));
  assert.equal("userId" in (submittedItem.materialSnapshot as Record<string, unknown>), false);
});

test("首次发布课件在课程提审后完成生成时同步待审课程快照", async () => {
  const { service, state } = reviewServiceFixture();
  const request = state.request;
  const previousUpdatedAt = new Date(request.updatedAt as Date).getTime();
  state.material.summary = "课程提审后异步完成的新内容";

  const materialRequest = await service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    state.materialId
  );

  const afterSnapshot = request.afterSnapshot as {
    items: Array<Record<string, unknown>>;
  };
  const submittedItem = afterSnapshot.items[0]!;
  const currentSnapshot = snapshotCourseMaterial("LEARNING_FLASHCARD", state.material);

  assert.equal(materialRequest, null);
  assert.equal(submittedItem.materialHash, hashCourseSnapshot(currentSnapshot));
  assert.deepEqual(submittedItem.materialSnapshot, currentSnapshot);
  assert.ok(new Date(request.updatedAt as Date).getTime() > previousUpdatedAt);

  await service.approve(
    "admin-1",
    request.id as string,
    reviewVersion(request.updatedAt)
  );
  assert.equal(state.course.reviewState, "PUBLISHED");
});

test("首次发布课件同步待审课程快照时废弃旧 AI 预审结果", async () => {
  const { service, state } = reviewServiceFixture();
  Object.assign(state.request, {
    aiPrecheckStatus: "PASSED",
    aiPrecheckProgress: 100,
    aiPrecheckMessage: "AI 预审通过",
    aiPrecheckResult: { verdict: "PASS" },
    aiPrecheckTaskId: "task-old",
    aiPrecheckTrigger: "MANUAL",
    aiPrecheckStartedAt: new Date("2026-07-17T12:01:00.000Z"),
    aiPrecheckCompletedAt: new Date("2026-07-17T12:02:00.000Z")
  });
  state.material.summary = "AI 预审完成后异步生成的新内容";

  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);

  assert.equal(state.request.aiPrecheckStatus, "NOT_STARTED");
  assert.equal(state.request.aiPrecheckProgress, 0);
  assert.equal(state.request.aiPrecheckMessage, null);
  assert.deepEqual(state.request.aiPrecheckResult, {});
  assert.equal(state.request.aiPrecheckTaskId, null);
  assert.equal(state.request.aiPrecheckTrigger, null);
  assert.equal(state.request.aiPrecheckStartedAt, null);
  assert.equal(state.request.aiPrecheckCompletedAt, null);
});

test("首次课程审批发现任一源课件在提交后漂移时整体返回冲突", async () => {
  const { service, state } = reviewServiceFixture({ published: false });
  const request = await service.submitCourse("user-1", state.course.id as string);
  state.material.summary = "提交后继续编辑的未审核内容";

  await assert.rejects(
    () => service.approve("admin-1", request.id as string, reviewVersion(request.updatedAt)),
    /审核内容已发生变化/
  );
  assert.equal(state.course.approvedRevisionId, null);
  assert.equal(state.publications[0]!.approvedHash, null);
});

test("课程审批发现课件变为不可学习且快照未变时返回冲突", async () => {
  const { service, state } = reviewServiceFixture({ published: false });
  const request = await service.submitCourse("user-1", state.course.id as string);
  state.material.status = "GENERATING";

  await assert.rejects(
    () => service.approve("admin-1", request.id as string, reviewVersion(request.updatedAt)),
    /课件状态已发生变化/
  );
  assert.equal(state.course.approvedRevisionId, null);
});

test("课件审批发现课件变为不可学习且快照未变时返回冲突", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  const request = state.pendingMaterialRequests[0]!;
  state.material.status = "GENERATING";

  await assert.rejects(
    () => service.approve("admin-1", request.id as string, reviewVersion(request.updatedAt)),
    /课件状态已发生变化/
  );
  assert.equal(request.status, "PENDING");
});

test("课程复审不得覆盖已公开课件或删除独立课件待审请求", async () => {
  const { service, state } = reviewServiceFixture({ published: true });
  const approvedHash = state.publications[0]!.approvedHash;
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  const materialRequest = state.pendingMaterialRequests[0]!;
  const courseRequest = await service.submitCourse("user-1", state.course.id as string);

  await service.approve("admin-1", courseRequest.id as string, reviewVersion(courseRequest.updatedAt));

  assert.equal(state.publications[0]!.approvedHash, approvedHash);
  assert.equal(materialRequest.status, "PENDING");
  assert.equal(
    state.pendingMaterialRequests.some((request) => request.id === materialRequest.id),
    true
  );
});

test("首次审核拒绝课程，复审拒绝恢复旧版公开状态", async () => {
  for (const published of [false, true]) {
    const { service, state } = reviewServiceFixture({ published });
    const oldRevisionId = state.course.approvedRevisionId;
    const request = await service.submitCourse("user-1", state.course.id as string);
    await service.reject("admin-1", request.id, "内容不符合发布要求", reviewVersion(request.updatedAt));

    assert.equal(state.revision.status, "REJECTED");
    assert.equal(state.revision.rejectionReason, "内容不符合发布要求");
    assert.equal(state.course.reviewState, published ? "PUBLISHED" : "REJECTED");
    assert.equal(state.course.approvedRevisionId, oldRevisionId);
  }
});

test("课件审核通过复制当前快照，拒绝不改变公开课程版本", async () => {
  const approvedFixture = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  await approvedFixture.service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    approvedFixture.state.materialId
  );
  const approvedRequest = approvedFixture.state.pendingMaterialRequests[0]!;
  await approvedFixture.service.approve(
    "admin-1",
    approvedRequest.id as string,
    reviewVersion(approvedRequest.updatedAt)
  );
  assert.equal(approvedFixture.state.publications[0]!.status, "APPROVED");
  assert.equal(
    approvedFixture.state.publications[0]!.approvedHash,
    approvedFixture.state.publications[0]!.currentHash
  );
  assert.deepEqual(
    approvedFixture.state.publications[0]!.approvedSnapshot,
    approvedFixture.state.publications[0]!.currentSnapshot
  );

  const rejectedFixture = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  const approvedRevisionId = rejectedFixture.state.course.approvedRevisionId;
  await rejectedFixture.service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    rejectedFixture.state.materialId
  );
  const rejectedRequest = rejectedFixture.state.pendingMaterialRequests[0]!;
  await rejectedFixture.service.reject(
    "admin-2",
    rejectedRequest.id as string,
    "课件内容需要修改",
    reviewVersion(rejectedRequest.updatedAt)
  );
  assert.equal(rejectedFixture.state.publications[0]!.status, "REJECTED");
  assert.equal(rejectedFixture.state.course.approvedRevisionId, approvedRevisionId);
  assert.equal(rejectedFixture.state.course.reviewState, "PUBLISHED");
});

test("审核列表只读取已记录请求，不在请求链路扫描全部已发布课件", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });

  assert.equal(state.pendingMaterialRequests.length, 0);
  const reviews = await service.listReviews({ status: "PENDING" });
  assert.deepEqual(reviews, []);
  assert.equal(state.pendingMaterialRequests.length, 0);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.transactionOptions, []);
});

test("课件不再被公开课程引用时直接对账删除孤立待审请求", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  assert.equal(state.pendingMaterialRequests.length, 1);

  (state.course.approvedRevision as MutableRecord).items = [];
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);

  assert.equal(state.pendingMaterialRequests.length, 0);
  assert.equal(
    state.publications[0]?.currentHash,
    hashCourseSnapshot(state.publications[0]?.currentSnapshot)
  );
  assert.equal(state.publications[0]?.status, "PENDING");
});

test("审核列表隐藏课程切版后失去引用的孤立素材请求且不执行写操作", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  assert.equal(state.pendingMaterialRequests.length, 1);

  (state.course.approvedRevision as MutableRecord).items = [];
  const transactionCountBeforeList = state.transactionOptions.length;
  const reviews = await service.listReviews({ status: "PENDING" });

  assert.equal(reviews.length, 0);
  assert.equal(state.pendingMaterialRequests.length, 1);
  assert.equal(state.transactionOptions.length, transactionCountBeforeList);
});

test("课程移除素材后仍保留已通过和已拒绝的历史审核记录", async () => {
  for (const decision of ["APPROVED", "REJECTED"] as const) {
    const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 1 });
    await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
    const request = state.pendingMaterialRequests[0]!;

    if (decision === "APPROVED") {
      await service.approve("admin-1", request.id as string, reviewVersion(request.updatedAt));
    } else {
      await service.reject(
        "admin-1",
        request.id as string,
        "课件内容需要修改",
        reviewVersion(request.updatedAt)
      );
    }

    (state.course.approvedRevision as MutableRecord).items = [];
    const reviews = await service.listReviews({ status: decision });
    const detail = await service.getReview(request.id as string);

    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]?.id, detail.id);
    assert.equal(reviews[0]?.status, decision);
    assert.deepEqual(reviews[0]?.affectedCourses, []);
    assert.deepEqual(detail.affectedCourses, []);
  }
});

test("手动 AI 预审持久化进度、任务和不通过理由", async () => {
  const fixture = reviewServiceFixture({
    sharedMaterialCourseCount: 1,
    aiGenerate: async () => ({
      taskId: "ai-task-review-1",
      text: JSON.stringify({
        verdict: "REJECT",
        summary: "发现版权风险",
        reasons: [{
          category: "版权",
          location: "resource.cards[0].source",
          reason: "内容来源授权不明确",
          evidence: "来源字段为空"
        }]
      })
    })
  });
  await fixture.service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    fixture.state.materialId
  );
  const request = fixture.state.pendingMaterialRequests[0]!;

  const result = await fixture.service.runAiPrecheck(request.id as string, "MANUAL");
  const aiResult = result.aiPrecheckResult as Record<string, unknown>;

  assert.equal(result.aiPrecheckStatus, "REJECTED");
  assert.equal(result.aiPrecheckProgress, 100);
  assert.equal(result.aiPrecheckTaskId, "ai-task-review-1");
  assert.equal(result.aiPrecheckTrigger, "MANUAL");
  assert.equal(aiResult.verdict, "REJECT");
  assert.equal((aiResult.reasons as Array<Record<string, unknown>>)[0]?.reason, "内容来源授权不明确");
});

test("课程 AI 预审以提交用户的账号身份运行内部场景", async () => {
  const authorizationCalls: Array<{ subject: MutableRecord; scenarioSlug: string }> = [];
  const generationInputs: MutableRecord[] = [];
  const fixture = reviewServiceFixture({
    sharedMaterialCourseCount: 1,
    scenarioAuthorization: async (subject, scenarioSlug, callback) => {
      authorizationCalls.push({ subject, scenarioSlug });
      return callback();
    },
    aiGenerate: async (input) => {
      generationInputs.push(input as MutableRecord);
      return {
        taskId: "ai-task-account-subject",
        text: JSON.stringify({ verdict: "PASS", summary: "预审通过", reasons: [] })
      };
    }
  });
  await fixture.service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    fixture.state.materialId
  );
  const request = fixture.state.pendingMaterialRequests[0]!;

  await fixture.service.runAiPrecheck(request.id as string, "MANUAL");

  assert.deepEqual(authorizationCalls, [{
    subject: { mode: "ACCOUNT", userId: "user-1", learnerId: null },
    scenarioSlug: "course-resource-ai-precheck"
  }]);
  assert.equal(generationInputs[0]?.userId, "user-1");
  assert.equal(generationInputs[0]?.learnerId, null);
});

test("后台手动预审立即返回运行中状态并在后台完成", async () => {
  let finishAi: ((value: { taskId: string; text: string }) => void) | undefined;
  const fixture = reviewServiceFixture({
    sharedMaterialCourseCount: 1,
    aiGenerate: () => new Promise((resolve) => {
      finishAi = resolve;
    })
  });
  await fixture.service.recordMaterialChange(
    "LEARNING_FLASHCARD",
    fixture.state.materialId
  );
  const request = fixture.state.pendingMaterialRequests[0]!;

  const started = await fixture.service.runAiPrecheck(request.id as string, "MANUAL", false);
  assert.equal(started.aiPrecheckStatus, "RUNNING");

  for (let attempt = 0; !finishAi && attempt < 10; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(finishAi);
  finishAi({
    taskId: "ai-task-background",
    text: JSON.stringify({ verdict: "PASS", summary: "后台预审通过", reasons: [] })
  });

  let completed = await fixture.service.getReview(request.id as string);
  for (let attempt = 0; completed.aiPrecheckStatus === "RUNNING" && attempt < 10; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    completed = await fixture.service.getReview(request.id as string);
  }

  assert.equal(completed.aiPrecheckStatus, "PASSED");
  assert.equal(completed.aiPrecheckTaskId, "ai-task-background");
});

test("管理员审核端点先校验身份并写固定操作日志", async () => {
  const events: string[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const expectedUpdatedAt = "2026-07-18T08:00:00.000Z";
  const authService = {
    me: async () => {
      events.push("me");
      return { id: "admin-1" };
    }
  };
  const reviewService = {
    runAiPrecheck: async (_id: string, trigger: string, waitForCompletion: boolean) => {
      assert.equal(trigger, "MANUAL");
      assert.equal(waitForCompletion, false);
      events.push("ai-precheck");
      return { id: "request-ai", aiPrecheckStatus: "RUNNING" };
    },
    approve: async (_adminId: string, _id: string, version: string) => {
      assert.equal(version, expectedUpdatedAt);
      events.push("approve");
      return { id: "request-approve" };
    },
    reject: async (_adminId: string, _id: string, _reason: string, version: string) => {
      assert.equal(version, expectedUpdatedAt);
      events.push("reject");
      return { id: "request-reject" };
    }
  };
  const controller = new AdminCourseReviewsController(reviewService as never, authService as never);
  (controller as unknown as {
    writeOperationLog(input: Record<string, unknown>): Promise<void>;
  }).writeOperationLog = async (input) => {
    events.push("log");
    logs.push(input);
  };

  await controller.approve({}, "request-approve", { expectedUpdatedAt });
  assert.deepEqual(events, ["me", "approve", "log"]);
  assert.deepEqual(logs[0], {
    adminUserId: "admin-1",
    action: "APPROVE_COURSE_REVIEW",
    resourceType: "COURSE_REVIEW_REQUEST",
    resourceId: "request-approve",
    description: "通过资源发布审核",
    request: {}
  });

  events.length = 0;
  await controller.reject({}, "request-reject", { reason: "内容需要修改", expectedUpdatedAt });
  assert.deepEqual(events, ["me", "reject", "log"]);
  assert.equal(logs[1]?.action, "REJECT_COURSE_REVIEW");
  assert.equal(logs[1]?.resourceType, "COURSE_REVIEW_REQUEST");
  assert.equal(logs[1]?.resourceId, "request-reject");

  events.length = 0;
  await controller.runAiPrecheck({}, "request-ai");
  assert.deepEqual(events, ["me", "ai-precheck", "log"]);
  assert.equal(logs[2]?.action, "RUN_RESOURCE_AI_PRECHECK");
  assert.equal(logs[2]?.description, "手动执行资源 AI 预审：已启动");
});


test("legacy public course cover still supplies image bytes to AI review", async () => {
  const service = Object.create(CourseReviewService.prototype) as { courseCoverAttachment(url: string): Promise<{ dataUrl: string; mimeType: string; size: number }> };
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from("legacy image boundary fixture");
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://images.example.test/legacy-cover.png");
    assert.equal(init?.headers, undefined);
    return new Response(bytes, { headers: { "content-type": "image/png" } });
  };
  try {
    const image = await service.courseCoverAttachment("https://images.example.test/legacy-cover.png");
    assert.equal(image.dataUrl, `data:image/png;base64,${bytes.toString("base64")}`);
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.size, bytes.length);
  } finally { globalThis.fetch = originalFetch; }
});
