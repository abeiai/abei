import assert from "node:assert/strict";
import test from "node:test";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { AppException } from "../src/common/app-exception.js";
import { MediaService } from "../src/media/media.service.js";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { CoursesController, PublicCoursesController } from "../src/courses/courses.controller.js";
import { CoursesService } from "../src/courses/courses.service.js";

type SaveCourseInput = Parameters<CoursesService["createCourse"]>[1];

function saveCourseInput(): SaveCourseInput {
  return {
    name: " 小学英语入门 ",
    coverMediaId: "cover-1",
    summary: "循序渐进学习小学英语。",
    tags: [" 英语 ", "小学", "英语"],
    items: [
      {
        materialType: "VIDEO_GUIDE",
        materialId: "video-1",
        displayName: "视频导学"
      },
      {
        materialType: "ENGLISH_GUIDED_STUDY",
        materialId: "english-1",
        displayName: "英文带学"
      },
      {
        materialType: "LEARNING_FLASHCARD",
        materialId: "flashcard-1",
        displayName: "记忆闪卡"
      }
    ]
  };
}

function serviceWithPrisma(prisma: object) {
  const service = new CoursesService();
  (service as unknown as { prisma: object }).prisma = prisma;
  return service;
}

function coursePrismaFixture(options: { videoOwnerId?: string } = {}) {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const materials = {
    videoGuideLesson: {
      findMany: async () => [{
        id: "video-1",
        userId: options.videoOwnerId ?? "user-1",
        title: "视频导学",
        status: "SUCCEEDED",
        shareToken: "video-share-token",
        content: { summary: "视频内容" },
        updatedAt: now
      }]
    },
    englishGuidedStudyMaterial: {
      findMany: async () => [{
        id: "english-1",
        userId: "user-1",
        title: "英文带学",
        audioUrl: "/audio/english.mp3",
        content: { sentences: [{ id: "sentence-1", text: "Hello." }] },
        updatedAt: now
      }]
    },
    pictureBook: { findMany: async () => [] },
    learningFlashcardDeck: {
      findMany: async () => [{
        id: "flashcard-1",
        userId: "user-1",
        title: "记忆闪卡",
        summary: "重点词语",
        knowledgeMap: [],
        status: "READY",
        cards: [{ id: "card-1", front: "hello", back: "你好", sortOrder: 0, tags: [], type: "词义" }],
        updatedAt: now
      }]
    }
  };

  return {
    ...materials,
    mediaAsset: {
      findUnique: async () => ({
        id: "cover-1",
        createdByUserId: "user-1",
        mediaType: "IMAGE",
        url: "/uploads/cover.png"
      })
    },
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => {
      let publicationIndex = 0;
      let revisionData: Record<string, unknown> | null = null;
      const transaction = {
        ...materials,
        mediaAsset: {
          findUnique: async () => ({
            id: "cover-1",
            createdByUserId: "user-1",
            mediaType: "IMAGE",
            url: "/uploads/cover.png"
          })
        },
        course: {
          create: async ({ data }: { data: Record<string, unknown> }) => data,
          update: async () => ({}),
          findUnique: async () => {
            const data = revisionData as {
              courseId: string;
              coverMediaId: string;
              name: string;
              summary: string;
              tags: string[];
              items: { create: Array<Record<string, unknown>> };
            };
            return {
              id: data.courseId,
              userId: "user-1",
              reviewState: "DRAFT",
              approvedRevision: null,
              workingRevision: {
                ...data,
                id: "revision-1",
                items: data.items.create.map((item, index) => ({ id: `item-${index + 1}`, ...item }))
              }
            };
          }
        },
        courseRevision: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            revisionData = data;
            return { id: "revision-1", ...data };
          }
        },
        courseMaterialPublication: {
          upsert: async ({ create }: { create: Record<string, unknown> }) => ({
            id: `publication-${++publicationIndex}`,
            ...create
          })
        }
      };

      return callback(transaction);
    }
  };
}

function publicCoursePrismaFixture(coverMedia: Record<string, unknown> = { url: "/uploads/approved-cover.png" }) {
  const publishedAt = new Date("2026-07-17T12:00:00.000Z");

  return {
    course: {
      findMany: async (query: Record<string, unknown>) => {
        assert.deepEqual(query.orderBy, { publishedAt: "desc" });
        assert.ok((query.include as Record<string, unknown>).approvedRevision);
        assert.deepEqual((query.include as Record<string, unknown>)._count, {
          select: { enrollments: true }
        });
        assert.equal((query.include as Record<string, unknown>).workingRevision, undefined);

        return [{
        id: "0123456789abcdef01234567",
        reviewState: "PENDING_REVIEW",
        publishedAt,
        _count: { enrollments: 128 },
        user: { nickname: "张老师", avatarUrl: "https://cdn.xueleai.com/avatars/teacher.jpg" },
        approvedRevision: {
          name: "已审核课程名称",
          summary: "已审核课程简介",
          tags: ["英语"],
          coverMedia,
          items: []
        },
        workingRevision: {
          name: "待审核课程名称"
        }
        }];
      }
    }
  };
}

function publicCourseWithMaterialsFixture(
  reviewState: "PENDING_REVIEW" | "PUBLISHED",
  options: { flashcardChanged?: boolean; flashcardStatus?: string } = {}
) {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const video = {
    id: "video-1",
    userId: "user-1",
    title: "视频导学",
    status: "SUCCEEDED",
    shareToken: "video-share-token",
    content: { summary: "审核通过的视频" },
    updatedAt: now
  };
  const flashcard = {
    id: "flashcard-1",
    userId: "user-1",
    title: "学习闪卡",
    summary: "当前内容已变化",
    knowledgeMap: [],
    status: options.flashcardStatus ?? "READY",
    cards: [],
    updatedAt: now
  };
  const approvedVideoHash = hashCourseSnapshot(snapshotCourseMaterial("VIDEO_GUIDE", video));
  const flashcardHash = hashCourseSnapshot(snapshotCourseMaterial(
    "LEARNING_FLASHCARD",
    options.flashcardChanged === false
      ? flashcard
      : { ...flashcard, summary: "审核时的内容" }
  ));
  const course = {
    id: "0123456789abcdef01234567",
    reviewState,
    publishedAt: now,
    _count: { enrollments: 4 },
    user: { nickname: "张老师" },
    approvedRevision: {
      name: "已发布课程",
      summary: "课程简介",
      tags: ["英语"],
      coverMedia: { id: "cover-1", url: "/uploads/cover.png" },
      items: [
        {
          id: "item-video",
          materialType: "VIDEO_GUIDE",
          displayName: "视频导学",
          sortOrder: 0,
          publication: { approvedHash: approvedVideoHash, status: "APPROVED" },
          videoGuideLesson: video,
          englishGuidedStudyMaterial: null,
          learningFlashcardDeck: null
        },
        {
          id: "item-flashcard",
          materialType: "LEARNING_FLASHCARD",
          displayName: "学习闪卡",
          sortOrder: 1,
          publication: {
            approvedHash: flashcardHash,
            status: options.flashcardChanged === false ? "APPROVED" : "PENDING"
          },
          videoGuideLesson: null,
          englishGuidedStudyMaterial: null,
          learningFlashcardDeck: flashcard
        }
      ]
    }
  };

  return {
    course: {
      findMany: async () => [course],
      findFirst: async () => course
    }
  };
}

function coursePagePrismaFixture(options: {
  approved: boolean;
  approvedName?: string;
  workingName: string;
}) {
  const courseId = "0123456789abcdef01234567";
  const now = new Date("2026-07-17T12:00:00.000Z");
  const revision = (name: string, summary: string, id: string) => ({
    id,
    name,
    summary,
    status: id === "approved-revision" ? "APPROVED" : "DRAFT",
    tags: ["英语"],
    updatedAt: now,
    coverMedia: { id: `${id}-cover`, url: `/uploads/${id}-cover.png` },
    items: []
  });
  const course = {
    id: courseId,
    userId: "user-1",
    approvedRevisionId: options.approved ? "approved-revision" : null,
    reviewState: "PENDING_REVIEW",
    publishedAt: options.approved ? now : null,
    _count: { enrollments: 4 },
    user: { nickname: "张老师" },
    approvedRevision: options.approved
      ? revision(options.approvedName ?? "已审核旧版", "已审核简介", "approved-revision")
      : null,
    workingRevision: revision(options.workingName, "待审简介", "working-revision")
  };

  return {
    course: {
      findUnique: async (query: Record<string, unknown>) => {
        assert.deepEqual(query.where, { id: courseId });
        const include = query.include as Record<string, unknown>;
        assert.ok(include.approvedRevision);
        assert.ok(include.workingRevision);
        return course;
      }
    }
  };
}

function validPngCoverFile() {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(400, 16);
  buffer.writeUInt32BE(225, 20);

  return {
    originalname: "课程封面.png",
    mimetype: "image/png",
    size: buffer.length,
    buffer
  };
}

test("创建课程保存 24 位 ID、规范标签和有序课件", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());
  const course = await service.createCourse("user-1", saveCourseInput());

  assert.match(course.id, /^[0-9a-f]{24}$/);
  assert.deepEqual(course.workingRevision.tags, ["英语", "小学"]);
  assert.deepEqual(course.workingRevision.items.map((item) => item.sortOrder), [0, 1, 2]);
});

test("不能选择其他用户或未完成课件", async () => {
  const service = serviceWithPrisma(coursePrismaFixture({ videoOwnerId: "user-2" }));

  await assert.rejects(
    () => service.createCourse("user-1", saveCourseInput()),
    /只能选择自己创建的课件/
  );
});

test("公开查询只读取已审核版本并返回课程学习次数", async () => {
  const service = serviceWithPrisma(publicCoursePrismaFixture());
  const courses = await service.listPublicCourses();

  assert.equal(courses[0]?.name, "已审核课程名称");
  assert.equal(courses[0]?.reviewing, true);
  assert.equal(courses[0]?.author.avatarUrl, "https://cdn.xueleai.com/avatars/teacher.jpg");
  assert.equal((courses[0] as { learningCount?: number } | undefined)?.learningCount, 128);
});

test("资源中心轻量查询只读取列表字段和课件名称", async () => {
  let capturedQuery: Record<string, unknown> | null = null;
  const publishedAt = new Date("2026-07-17T12:00:00.000Z");
  const service = serviceWithPrisma({
    course: {
      findMany: async (query: Record<string, unknown>) => {
        capturedQuery = query;
        return [{
          id: "0123456789abcdef01234567",
          reviewState: "PUBLISHED",
          publishedAt,
          _count: { enrollments: 128 },
          user: { nickname: "张老师", avatarUrl: null },
          approvedRevision: {
            name: "已审核课程名称",
            summary: "已审核课程简介",
            tags: ["英语"],
            coverMedia: { url: "/uploads/approved-cover.png" },
            _count: { items: 2 },
            items: [{ displayName: "字母发音" }, { displayName: "自然拼读闪卡" }]
          }
        }];
      }
    }
  });

  const courses = await service.listPublicCourseListing();

  assert.ok(capturedQuery);
  assert.equal(capturedQuery.include, undefined);
  assert.ok((capturedQuery.select as Record<string, unknown>).approvedRevision);
  assert.deepEqual(courses, [{
    id: "0123456789abcdef01234567",
    name: "已审核课程名称",
    coverUrl: "/uploads/approved-cover.png",
    summary: "已审核课程简介",
    tags: ["英语"],
    author: { nickname: "张老师", avatarUrl: null },
    reviewing: false,
    publishedAt,
    itemCount: 2,
    learningCount: 128,
    itemNames: ["字母发音", "自然拼读闪卡"]
  }]);
});

test("学习者资源中心只查询当前学习者已授权且主账号可用的课程", async () => {
  const capturedWheres: unknown[] = [];
  const service = serviceWithPrisma({
    course: {
      findMany: async ({ where }: { where: unknown }) => {
        capturedWheres.push(where);
        return [];
      }
    }
  });

  await service.listPublicCourses({
    userId: "user-1",
    mode: "LEARNER",
    learnerId: "learner-1"
  });
  await service.listPublicCourseListing({
    userId: "user-1",
    mode: "LEARNER",
    learnerId: "learner-1"
  });

  const expectedWhere = {
    approvedRevisionId: { not: null },
    publishedAt: { not: null },
    learnerAuthorizations: { some: { learnerId: "learner-1" } },
    OR: [
      { userId: "user-1" },
      { enrollments: { some: { userId: "user-1" } } }
    ]
  };
  assert.deepEqual(capturedWheres, [expectedWhere, expectedWhere]);
});

test("公开课程把历史 R2 私有封面地址转换为绑定域名", async () => {
  const originalS3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  const originalVideoGuidePublicBaseUrl = process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
  delete process.env.S3_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.xueleai.com";

  try {
    const service = serviceWithPrisma(publicCoursePrismaFixture({
      filename: "legacy-cover.png",
      storageProvider: "S3",
      url: "https://account.r2.cloudflarestorage.com/xueleai/uploads/legacy-cover.png"
    }));
    const courses = await service.listPublicCourses();

    assert.equal(courses[0]?.coverUrl, "https://cdn.xueleai.com/uploads/legacy-cover.png");
  } finally {
    if (originalS3PublicBaseUrl === undefined) delete process.env.S3_PUBLIC_BASE_URL;
    else process.env.S3_PUBLIC_BASE_URL = originalS3PublicBaseUrl;
    if (originalVideoGuidePublicBaseUrl === undefined) delete process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL;
    else process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = originalVideoGuidePublicBaseUrl;
  }
});

test("首次待审课程只向创作者和管理员返回工作版本", async () => {
  const courseId = "0123456789abcdef01234567";
  const service = serviceWithPrisma(coursePagePrismaFixture({
    approved: false,
    workingName: "待审新版"
  }));

  assert.deepEqual(
    await service.getCoursePage(courseId, { userId: null, isAdmin: false }),
    { state: "REVIEWING", courseId }
  );

  const creator = await service.getCoursePage(courseId, {
    userId: "user-1",
    isAdmin: false
  });
  const admin = await service.getCoursePage(courseId, { userId: null, isAdmin: true });

  assert.equal(creator.state === "AVAILABLE" && creator.course.name, "待审新版");
  assert.equal(creator.state === "AVAILABLE" && creator.previewMode, "CREATOR");
  assert.equal(creator.state === "AVAILABLE" && creator.revisionStatus, "DRAFT");
  assert.equal(admin.state === "AVAILABLE" && admin.course.name, "待审新版");
  assert.equal(admin.state === "AVAILABLE" && admin.previewMode, "ADMIN");
  assert.equal(admin.state === "AVAILABLE" && admin.revisionStatus, "DRAFT");
});

test("非创作者登录用户不能读取首次待审字段", async () => {
  const courseId = "0123456789abcdef01234567";
  const service = serviceWithPrisma(coursePagePrismaFixture({
    approved: false,
    workingName: "待审新版"
  }));

  const result = await service.getCoursePage(courseId, {
    userId: "user-2",
    isAdmin: false
  });

  assert.deepEqual(result, { state: "REVIEWING", courseId });
  assert.doesNotMatch(JSON.stringify(result), /待审新版|待审简介|cover|item-/u);
});

test("已发布课程复审时访客看旧版而创作者和管理员看新版", async () => {
  const courseId = "0123456789abcdef01234567";
  const service = serviceWithPrisma(coursePagePrismaFixture({
    approved: true,
    approvedName: "已审核旧版",
    workingName: "待审新版"
  }));

  const visitor = await service.getCoursePage(courseId, {
    userId: null,
    isAdmin: false
  });
  const creator = await service.getCoursePage(courseId, {
    userId: "user-1",
    isAdmin: false
  });
  const admin = await service.getCoursePage(courseId, { userId: null, isAdmin: true });

  assert.equal(visitor.state === "AVAILABLE" && visitor.course.name, "已审核旧版");
  assert.equal(visitor.state === "AVAILABLE" && visitor.previewMode, "PUBLIC");
  assert.equal(visitor.state === "AVAILABLE" && visitor.revisionStatus, "APPROVED");
  assert.equal(creator.state === "AVAILABLE" && creator.course.name, "待审新版");
  assert.equal(creator.state === "AVAILABLE" && creator.revisionStatus, "DRAFT");
  assert.equal(admin.state === "AVAILABLE" && admin.course.name, "待审新版");
});

test("课程复审期间只锁定未审核课件，已审核课件仍可学习", async () => {
  const reviewingService = serviceWithPrisma(publicCourseWithMaterialsFixture("PENDING_REVIEW"));
  const reviewing = await reviewingService.getPublicCourse("0123456789abcdef01234567");

  assert.deepEqual(reviewing.items.map((item) => item.launchHref), [
    "/media-tutor/video-share-token",
    null
  ]);
  assert.deepEqual(reviewing.items.map((item) => item.reviewState), ["READY", "PENDING"]);

  const publishedService = serviceWithPrisma(publicCourseWithMaterialsFixture("PUBLISHED"));
  const published = await publishedService.getPublicCourse("0123456789abcdef01234567");

  assert.equal(published.items[0]?.launchHref, "/media-tutor/video-share-token");
  assert.equal(published.items[1]?.launchHref, null);
});

test("已审核闪卡生成仓库内可用的匿名学习地址", async () => {
  const service = serviceWithPrisma(
    publicCourseWithMaterialsFixture("PUBLISHED", { flashcardChanged: false })
  );
  const course = await service.getPublicCourse("0123456789abcdef01234567");

  assert.equal(course.items[1]?.launchHref, "/learn/flashcards/flashcard-1");
});

test("已审核古诗文带学课件生成古诗文学习地址", async () => {
  const now = new Date("2026-08-18T10:00:00Z");
  const material = {
    id: "gushiwen-1",
    userId: "user-1",
    title: "次北固山下",
    audioUrl: "/audio/gushiwen.mp3",
    content: { scene: "GUSHIWEN" },
    updatedAt: now
  };
  const approvedHash = hashCourseSnapshot(snapshotCourseMaterial("ENGLISH_GUIDED_STUDY", material));
  const service = serviceWithPrisma({
    course: {
      findFirst: async () => ({
        id: "0123456789abcdef01234567",
        reviewState: "PUBLISHED",
        publishedAt: now,
        _count: { enrollments: 1 },
        user: { nickname: "张老师" },
        approvedRevision: {
          name: "七年级古诗文",
          summary: "古诗文课程",
          tags: ["语文"],
          coverMedia: { url: "/uploads/cover.png" },
          items: [{
            id: "item-gushiwen",
            materialType: "ENGLISH_GUIDED_STUDY",
            displayName: "次北固山下",
            sortOrder: 0,
            publication: { approvedHash, status: "APPROVED" },
            videoGuideLesson: null,
            englishGuidedStudyMaterial: material,
            learningFlashcardDeck: null
          }]
        }
      })
    }
  });

  const course = await service.getPublicCourse("0123456789abcdef01234567");

  assert.equal(course.items[0]?.launchHref, "/gushiwen/gushiwen-1");
});

test("课件失去可学习状态时即使指纹未变也锁定匿名入口", async () => {
  const service = serviceWithPrisma(publicCourseWithMaterialsFixture("PUBLISHED", {
    flashcardChanged: false,
    flashcardStatus: "GENERATING"
  }));
  const course = await service.getPublicCourse("0123456789abcdef01234567");

  assert.equal(course.items[1]?.launchHref, null);
  assert.equal(course.items[1]?.reviewState, "PENDING");
});

test("用户批量加入已发布课程时去重并忽略已有关系", async () => {
  let courseQuery: Record<string, unknown> | null = null;
  let enrollmentWrite: Record<string, unknown> | null = null;
  const service = serviceWithPrisma({
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
      course: {
        findMany: async (query: Record<string, unknown>) => {
          courseQuery = query;
          return [{ id: "course-1" }, { id: "course-2" }];
        }
      },
      courseEnrollment: {
        createMany: async (write: Record<string, unknown>) => {
          enrollmentWrite = write;
          return { count: 1 };
        }
      }
    })
  });

  const result = await service.enrollCourses("user-1", ["course-1", "course-2", "course-1"]);

  assert.deepEqual(result, { addedCount: 1, courseIds: ["course-1", "course-2"] });
  assert.deepEqual((courseQuery as { where: unknown }).where, {
    id: { in: ["course-1", "course-2"] },
    approvedRevisionId: { not: null },
    publishedAt: { not: null }
  });
  assert.deepEqual(enrollmentWrite, {
    data: [
      { userId: "user-1", courseId: "course-1" },
      { userId: "user-1", courseId: "course-2" }
    ],
    skipDuplicates: true
  });
});

test("批量加入包含未发布课程时整批拒绝且不写入关系", async () => {
  let createCalls = 0;
  const service = serviceWithPrisma({
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
      course: {
        findMany: async () => [{ id: "course-1" }]
      },
      courseEnrollment: {
        createMany: async () => {
          createCalls += 1;
          return { count: 0 };
        }
      }
    })
  });

  await assert.rejects(
    () => service.enrollCourses("user-1", ["course-1", "unpublished-course"]),
    /有课程不存在或尚未发布/
  );
  assert.equal(createCalls, 0);
});

test("我的已加入课程只按当前用户读取仍在发布的课程", async () => {
  let enrollmentQuery: Record<string, unknown> | null = null;
  const service = serviceWithPrisma({
    courseEnrollment: {
      findMany: async (query: Record<string, unknown>) => {
        enrollmentQuery = query;
        return [{
          course: {
            id: "course-1",
            publishedAt: new Date("2026-07-20T00:00:00.000Z"),
            reviewState: "PUBLISHED",
            _count: { enrollments: 12 },
            user: { nickname: "王老师", avatarUrl: "/avatars/teacher.png" },
            approvedRevision: {
              name: "已发布课程",
              summary: "课程简介",
              tags: ["英语"],
              coverMedia: { url: "/cover.png" },
              _count: { items: 3 }
            }
          }
        }];
      },
      count: async () => 1
    }
  });

  const result = await service.listEnrolledCourses("user-1", { page: 2, pageSize: 12 });

  assert.equal(result.items[0]?.name, "已发布课程");
  assert.equal(result.items[0]?.itemCount, 3);
  assert.equal((result.items[0] as { learningCount?: number } | undefined)?.learningCount, 12);
  assert.equal(result.total, 1);
  assert.deepEqual((enrollmentQuery as { where: unknown }).where, {
    userId: "user-1",
    course: {
      approvedRevisionId: { not: null },
      publishedAt: { not: null }
    }
  });
  assert.equal((enrollmentQuery as { skip: number }).skip, 12);
  assert.equal((enrollmentQuery as { take: number }).take, 12);
  assert.doesNotMatch(JSON.stringify(enrollmentQuery), /videoGuideLesson/u);
});

test("添加课程目录按当前用户排除已加入课程并返回轻量分页结果", async () => {
  const queries: Array<{ operation: string; query: Record<string, unknown> }> = [];
  const service = serviceWithPrisma({
    course: {
      count: async (query: Record<string, unknown>) => {
        queries.push({ operation: "count", query });
        return 1;
      },
      findMany: async (query: Record<string, unknown>) => {
        queries.push({ operation: "findMany", query });

        if ("select" in query && JSON.stringify(query.select).includes("_count")) {
          return [{
            id: "course-2",
            publishedAt: new Date("2026-07-20T00:00:00.000Z"),
            reviewState: "PUBLISHED",
            _count: { enrollments: 36 },
            user: { nickname: "王老师", avatarUrl: "/avatars/teacher.png" },
            approvedRevision: {
              name: "自然拼读",
              summary: "学习英语发音",
              tags: ["英语", "发音"],
              coverMedia: { url: "/cover.png" },
              _count: { items: 6 }
            }
          }];
        }

        return [{ approvedRevision: { tags: ["英语", "发音"] } }];
      }
    }
  });

  const result = await service.listAvailableCourseCatalog("user-1", {
    keyword: "自然",
    tag: "英语",
    page: 2,
    pageSize: 12
  });

  assert.deepEqual(result, {
    items: [{
      id: "course-2",
      name: "自然拼读",
      coverUrl: "/cover.png",
      summary: "学习英语发音",
      tags: ["英语", "发音"],
      author: { nickname: "王老师", avatarUrl: "/avatars/teacher.png" },
      reviewing: false,
      publishedAt: new Date("2026-07-20T00:00:00.000Z"),
      itemCount: 6,
      learningCount: 36
    }],
    page: 2,
    pageSize: 12,
    total: 1,
    tags: ["发音", "英语"]
  });
  const pageQuery = queries.find((entry) => entry.operation === "findMany" && "skip" in entry.query);
  assert.equal(pageQuery?.query.skip, 12);
  assert.equal(pageQuery?.query.take, 12);
  assert.match(JSON.stringify(pageQuery?.query.where), /user-1/u);
  assert.match(JSON.stringify(pageQuery?.query.where), /自然/u);
  assert.match(JSON.stringify(pageQuery?.query.where), /英语/u);

  queries.length = 0;
  await service.listAvailableCourseCatalog("user-1", {
    keyword: "自然",
    page: 1,
    pageSize: 12,
    includeTags: false
  });
  assert.equal(queries.filter((entry) => entry.operation === "findMany").length, 1);
});

test("用户课程查询只读取课件最近一次拒绝原因", async () => {
  let capturedQuery: Record<string, unknown> | null = null;
  const service = serviceWithPrisma({
    course: {
      findMany: async (query: Record<string, unknown>) => {
        capturedQuery = query;
        return [];
      }
    }
  });

  await service.listUserCourses("user-1");

  const query = capturedQuery as {
    include: {
      workingRevision: {
        include: {
          items: {
            include: {
              publication: {
                include: {
                  reviewRequests: Record<string, unknown>;
                };
              };
            };
          };
        };
      };
    };
  };
  const reviewRequests = query.include.workingRevision.include.items.include.publication.include.reviewRequests;

  assert.deepEqual(reviewRequests.where, { scope: "MATERIAL_CHANGE", status: "REJECTED" });
  assert.deepEqual(reviewRequests.orderBy, { reviewedAt: "desc" });
  assert.equal(reviewRequests.take, 1);
  assert.deepEqual(reviewRequests.select, { reviewNote: true });
});

test("审核中的工作版本不能被覆盖", async () => {
  let transactionCalls = 0;
  const service = serviceWithPrisma({
    course: {
      findFirst: async () => ({
        id: "0123456789abcdef01234567",
        reviewState: "PENDING_REVIEW",
        workingRevision: { id: "revision-1", status: "PENDING" }
      })
    },
    $transaction: async () => {
      transactionCalls += 1;
    }
  });

  await assert.rejects(
    () => service.saveCourse("user-1", "0123456789abcdef01234567", saveCourseInput()),
    /课程正在审核中/
  );
  assert.equal(transactionCalls, 0);
});

test("保存课程先锁定课程再权威重读，锁后进入待审时不产生任何写入", async () => {
  const events: string[] = [];
  const writes: string[] = [];
  const service = serviceWithPrisma({
    course: {
      findFirst: async () => ({
        id: "0123456789abcdef01234567",
        userId: "user-1",
        reviewState: "DRAFT",
        workingRevision: { id: "revision-1", status: "DRAFT" }
      })
    },
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
      $queryRaw: async (strings: TemplateStringsArray) => {
        assert.match(strings.join("?"), /FROM "courses".*FOR UPDATE/);
        events.push("LOCK_COURSE");
        return [{ id: "0123456789abcdef01234567" }];
      },
      course: {
        findFirst: async () => {
          events.push("READ_COURSE");
          return {
            id: "0123456789abcdef01234567",
            userId: "user-1",
            reviewState: "PENDING_REVIEW",
            workingRevision: { id: "revision-1", status: "PENDING" }
          };
        },
        update: async () => {
          writes.push("course.update");
          return {};
        }
      },
      courseRevision: {
        update: async () => {
          writes.push("courseRevision.update");
          return {};
        },
        create: async () => {
          writes.push("courseRevision.create");
          return { id: "revision-new" };
        }
      },
      courseMaterialPublication: {
        upsert: async () => {
          writes.push("courseMaterialPublication.upsert");
          return { id: "publication-1" };
        }
      }
    })
  });

  await assert.rejects(
    () => service.saveCourse("user-1", "0123456789abcdef01234567", saveCourseInput()),
    /课程正在审核中/
  );
  assert.deepEqual(events, ["LOCK_COURSE", "READ_COURSE"]);
  assert.deepEqual(writes, []);
});

test("保存课程在同一事务替换草稿条目并刷新课件快照指纹", async () => {
  const base = coursePrismaFixture();
  const course = {
    id: "0123456789abcdef01234567",
    userId: "user-1",
    approvedRevisionId: null,
    reviewState: "DRAFT",
    workingRevision: { id: "revision-1", status: "DRAFT" }
  };
  const publicationWrites: Array<Record<string, unknown>> = [];
  let revisionWrite: Record<string, unknown> | null = null;
  let transactionCalls = 0;
  const prisma = {
    ...base,
    course: {
      findFirst: async () => course
    },
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => {
      transactionCalls += 1;
      const transaction = {
        $queryRaw: async () => [],
        creatorWork: { updateMany: async () => ({ count: 0 }) },
        videoGuideLesson: base.videoGuideLesson,
        englishGuidedStudyMaterial: base.englishGuidedStudyMaterial,
        learningFlashcardDeck: base.learningFlashcardDeck,
        pictureBook: base.pictureBook,
        mediaAsset: base.mediaAsset,
        course: {
          findFirst: async () => course,
          update: async () => ({}),
          findUnique: async () => ({ ...course, workingRevision: { id: "revision-1", items: [] } })
        },
        courseRevision: {
          update: async (write: Record<string, unknown>) => {
            revisionWrite = write;
            return {};
          }
        },
        courseMaterialPublication: {
          upsert: async (write: Record<string, unknown>) => {
            publicationWrites.push(write);
            return { id: `publication-${publicationWrites.length}` };
          }
        }
      };

      return callback(transaction);
    }
  };
  const service = serviceWithPrisma(prisma);

  await service.saveCourse("user-1", course.id, saveCourseInput());

  assert.equal(transactionCalls, 1);
  const revisionData = revisionWrite?.data as {
    items: { create: Array<{ sortOrder: number }>; deleteMany: Record<string, never> };
  };
  assert.deepEqual(revisionData.items.deleteMany, {});
  assert.deepEqual(revisionData.items.create.map((item) => item.sortOrder), [0, 1, 2]);
  assert.equal(publicationWrites.length, 3);
  for (const write of publicationWrites) {
    assert.match((write.create as { currentHash: string }).currentHash, /^[0-9a-f]{64}$/);
    assert.ok((write.create as { currentSnapshot: unknown }).currentSnapshot);
    assert.match((write.update as { currentHash: string }).currentHash, /^[0-9a-f]{64}$/);
  }
});

test("工作版本指向已审核版本时创建新草稿且绝不修改已审核条目", async () => {
  const base = coursePrismaFixture();
  const approvedRevisionId = "approved-revision-1";
  const course = {
    id: "0123456789abcdef01234567",
    userId: "user-1",
    approvedRevisionId,
    reviewState: "PUBLISHED",
    workingRevision: { id: approvedRevisionId, status: "APPROVED" }
  };
  const revisionCreates: Array<Record<string, unknown>> = [];
  const revisionUpdates: Array<Record<string, unknown>> = [];
  const courseUpdates: Array<Record<string, unknown>> = [];
  let publicationIndex = 0;
  const service = serviceWithPrisma({
    ...base,
    course: {
      findFirst: async () => course
    },
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
      $queryRaw: async () => [],
        creatorWork: { updateMany: async () => ({ count: 0 }) },
      videoGuideLesson: base.videoGuideLesson,
      englishGuidedStudyMaterial: base.englishGuidedStudyMaterial,
      learningFlashcardDeck: base.learningFlashcardDeck,
        pictureBook: base.pictureBook,
      mediaAsset: base.mediaAsset,
      course: {
        findFirst: async () => course,
        update: async (write: Record<string, unknown>) => {
          courseUpdates.push(write);
          return {};
        },
        findUnique: async () => ({
          ...course,
          workingRevisionId: "new-draft-revision",
          workingRevision: { id: "new-draft-revision", status: "DRAFT", items: [] }
        })
      },
      courseRevision: {
        update: async (write: Record<string, unknown>) => {
          revisionUpdates.push(write);
          return {};
        },
        create: async (write: Record<string, unknown>) => {
          revisionCreates.push(write);
          return { id: "new-draft-revision" };
        }
      },
      courseMaterialPublication: {
        upsert: async () => ({ id: `publication-${++publicationIndex}` })
      }
    })
  });

  const saved = await service.saveCourse("user-1", course.id, saveCourseInput());

  assert.equal(revisionUpdates.length, 0);
  assert.equal(revisionCreates.length, 1);
  assert.equal((revisionCreates[0]?.data as { status: string }).status, "DRAFT");
  assert.equal(saved.approvedRevisionId, approvedRevisionId);
  assert.deepEqual(courseUpdates[0]?.data, {
    workingRevisionId: "new-draft-revision",
    reviewState: "PUBLISHED"
  });
  assert.equal((courseUpdates[0]?.data as Record<string, unknown>).approvedRevisionId, undefined);
});

test("事务内课件归属或状态变化时以事务内查询为准并拒绝保存", async () => {
  const base = coursePrismaFixture();
  const now = new Date("2026-07-17T12:00:00.000Z");

  for (const [overrides, error] of [
    [{ userId: "user-2" }, /只能选择自己创建的课件/],
    [{ status: "GENERATING" }, /只能选择已完成的视频导学课件/]
  ] as const) {
    let courseCreateCalls = 0;
    const service = serviceWithPrisma({
      ...base,
      $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
        mediaAsset: base.mediaAsset,
        videoGuideLesson: {
          findMany: async () => [{
            id: "video-1",
            userId: "user-1",
            title: "视频导学",
            status: "SUCCEEDED",
            shareToken: "video-share-token",
            content: { summary: "事务内内容" },
            updatedAt: now,
            ...overrides
          }]
        },
        englishGuidedStudyMaterial: base.englishGuidedStudyMaterial,
        learningFlashcardDeck: base.learningFlashcardDeck,
        pictureBook: base.pictureBook,
        course: {
          create: async () => {
            courseCreateCalls += 1;
            return {};
          },
          update: async () => ({}),
          findUnique: async () => ({ id: "0123456789abcdef01234567" })
        },
        courseRevision: {
          create: async () => ({ id: "revision-1" })
        },
        courseMaterialPublication: {
          upsert: async () => ({ id: "publication-1" })
        }
      })
    });

    await assert.rejects(() => service.createCourse("user-1", saveCourseInput()), error);
    assert.equal(courseCreateCalls, 0);
  }
});

test("课件发布快照和指纹使用事务内最新内容", async () => {
  const base = coursePrismaFixture();
  const now = new Date("2026-07-17T12:00:00.000Z");
  const publicationWrites: Array<Record<string, unknown>> = [];
  let revisionData: Record<string, unknown> | null = null;
  const service = serviceWithPrisma({
    ...base,
    $transaction: async (callback: (transaction: object) => Promise<unknown>) => callback({
      mediaAsset: base.mediaAsset,
      videoGuideLesson: {
        findMany: async () => [{
          id: "video-1",
          userId: "user-1",
          title: "视频导学",
          status: "SUCCEEDED",
          shareToken: "video-share-token",
          content: { summary: "事务内最新视频内容" },
          updatedAt: now
        }]
      },
      englishGuidedStudyMaterial: base.englishGuidedStudyMaterial,
      learningFlashcardDeck: base.learningFlashcardDeck,
        pictureBook: base.pictureBook,
      course: {
        create: async () => ({}),
        update: async () => ({}),
        findUnique: async () => ({
          id: "0123456789abcdef01234567",
          workingRevision: revisionData
        })
      },
      courseRevision: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          revisionData = data;
          return { id: "revision-1" };
        }
      },
      courseMaterialPublication: {
        upsert: async (write: Record<string, unknown>) => {
          publicationWrites.push(write);
          return { id: `publication-${publicationWrites.length}` };
        }
      }
    })
  });

  await service.createCourse("user-1", saveCourseInput());

  const videoWrite = publicationWrites.find((write) =>
    (write.create as { materialType: string }).materialType === "VIDEO_GUIDE"
  );
  const snapshot = (videoWrite?.create as { currentSnapshot: { summary: string } }).currentSnapshot;
  assert.equal(snapshot.summary, "事务内最新视频内容");
  assert.equal(
    (videoWrite?.create as { currentHash: string }).currentHash,
    hashCourseSnapshot(snapshot)
  );
});

test("课程名称 trim 后为空时返回中文参数错误", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());

  await assert.rejects(
    () => service.createCourse("user-1", { ...saveCourseInput(), name: "   " }),
    /课程名称不能为空/
  );
});

test("课程名称 trim 后不足两个字符时返回中文参数错误", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());

  await assert.rejects(
    () => service.createCourse("user-1", { ...saveCourseInput(), name: " 一 " }),
    /课程名称至少需要 2 个字符/
  );
});

test("课程简介 trim 后为空时返回中文参数错误", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());

  await assert.rejects(
    () => service.createCourse("user-1", { ...saveCourseInput(), summary: "   " }),
    /课程简介不能为空/
  );
});

test("课件名称 trim 后为空时返回中文参数错误", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());
  const input = saveCourseInput();
  input.items[0] = { ...input.items[0]!, displayName: "   " };

  await assert.rejects(
    () => service.createCourse("user-1", input),
    /课件名称不能为空/
  );
});

test("本人可选课件按三类统一返回并按更新时间排序", async () => {
  const queries: unknown[] = [];
  const service = serviceWithPrisma({
    videoGuideLesson: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return [{ id: "video-1", title: "视频导学", updatedAt: new Date("2026-07-17T10:00:00Z") }];
      }
    },
    englishGuidedStudyMaterial: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return [{ id: "english-1", title: "英文带学", updatedAt: new Date("2026-07-17T12:00:00Z") }];
      }
    },
    pictureBook: { findMany: async (query: unknown) => { queries.push(query); return []; } },
    learningFlashcardDeck: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return [{ id: "flashcard-1", title: "学习闪卡", updatedAt: new Date("2026-07-17T11:00:00Z") }];
      }
    }
  });

  const options = await service.listMaterialOptions("user-1");

  assert.deepEqual(options.map((item) => item.materialType), [
    "ENGLISH_GUIDED_STUDY",
    "LEARNING_FLASHCARD",
    "VIDEO_GUIDE"
  ]);
  assert.equal(queries.length, 4);
  assert.deepEqual(
    (queries[0] as { where: unknown }).where,
    { userId: "user-1", status: "SUCCEEDED" }
  );
});

test("课程编排根据带学场景区分学古诗文和英文带学", async () => {
  const updatedAt = new Date("2026-08-18T10:00:00Z");
  const service = serviceWithPrisma({
    videoGuideLesson: { findMany: async () => [] },
    englishGuidedStudyMaterial: {
      findMany: async () => [
        {
          id: "gushiwen-1",
          title: "次北固山下",
          audioUrl: "/audio/gushiwen.mp3",
          content: { scene: "GUSHIWEN" },
          updatedAt
        },
        {
          id: "english-1",
          title: "The Road Not Taken",
          audioUrl: "/audio/english.mp3",
          content: { scene: "ENGLISH" },
          updatedAt
        }
      ]
    },
    learningFlashcardDeck: { findMany: async () => [] },
    pictureBook: { findMany: async () => [] }
  });

  const options = await service.listMaterialOptions("user-1");

  assert.deepEqual(
    options.map((item) => [
      item.materialId,
      item.subtitle,
      (item as { guidedStudyScene?: string }).guidedStudyScene
    ]),
    [
      ["gushiwen-1", "学古诗文", "GUSHIWEN"],
      ["english-1", "英文带学", "ENGLISH"]
    ]
  );
});

test("用户课程封面上传要求文件并写入用户归属", async () => {
  const mediaService = new MediaService();

  await assert.rejects(
    () => mediaService.uploadUserCourseCover("user-1", undefined),
    /请选择课程封面/
  );

  let persisted: Record<string, unknown> | null = null;
  (mediaService as unknown as { persistFile(input: Record<string, unknown>): Promise<unknown> }).persistFile = async (input) => {
    persisted = input;
    return { id: "cover-1" };
  };
  const uploaded = await mediaService.uploadUserCourseCover("user-1", validPngCoverFile());

  assert.deepEqual(uploaded, { id: "cover-1" });
  assert.equal(persisted?.createdByUserId, "user-1");
  assert.equal(persisted?.mediaType, "IMAGE");
  assert.equal(persisted?.sourceType, "USER_UPLOAD");
  assert.equal(persisted?.storageProvider, "S3");
});

test("课程封面上传复用视频导学的 R2 绑定域名", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    prefix: process.env.S3_KEY_PREFIX,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
    videoGuidePublicBaseUrl: process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL
  };
  process.env.S3_ENDPOINT = "https://account.r2.cloudflarestorage.com";
  process.env.S3_BUCKET = "xueleai";
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_KEY_PREFIX = "uploads/";
  delete process.env.S3_PUBLIC_BASE_URL;
  process.env.VIDEO_GUIDE_R2_PUBLIC_BASE_URL = "https://cdn.xueleai.com";
  globalThis.fetch = async () => new Response(null, { status: 200 });

  try {
    const mediaService = new MediaService();
    (mediaService as unknown as { prisma: object }).prisma = {
      mediaAsset: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "cover-1",
          ...data,
          createdAt: new Date("2026-07-20T00:00:00.000Z"),
          createdByAdmin: null
        })
      }
    };
    const uploaded = await mediaService.uploadUserCourseCover("user-1", validPngCoverFile());

    assert.match(uploaded.url, /^https:\/\/cdn\.xueleai\.com\/uploads\/[0-9]{8}-[0-9a-f]{16}\.png$/u);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      S3_ENDPOINT: originalEnv.endpoint,
      S3_BUCKET: originalEnv.bucket,
      S3_REGION: originalEnv.region,
      S3_ACCESS_KEY_ID: originalEnv.accessKeyId,
      S3_SECRET_ACCESS_KEY: originalEnv.secretAccessKey,
      S3_KEY_PREFIX: originalEnv.prefix,
      S3_PUBLIC_BASE_URL: originalEnv.publicBaseUrl,
      VIDEO_GUIDE_R2_PUBLIC_BASE_URL: originalEnv.videoGuidePublicBaseUrl
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("课程新版封面生效后只清理已无课程或文章引用的旧封面", async () => {
  const events: string[] = [];
  const mediaService = new MediaService() as MediaService & Record<string, unknown>;
  mediaService["prisma"] = {
    mediaAsset: {
      findFirst: async () => ({
        id: "cover-old",
        filename: "old-cover.png",
        originalName: "旧封面.png",
        mimeType: "image/png",
        size: 1024,
        url: "https://cdn.example.com/uploads/old-cover.png",
        mediaType: "IMAGE",
        sourceType: "USER_UPLOAD",
        storageProvider: "S3",
        createdByAdminId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }),
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        events.push("DELETE_ROW");
        assert.deepEqual(where.courseRevisionCovers, { none: {} });
        assert.deepEqual(where.coverArticles, { none: {} });
        return { count: 1 };
      }
    }
  };
  mediaService["deleteMediaObject"] = async () => {
    events.push("DELETE_OBJECT");
  };

  const result = await mediaService.cleanupUnreferencedCourseCoverAssets("user-1", [
    "cover-old",
    "cover-old"
  ]);

  assert.deepEqual(result, { deletedAssetIds: ["cover-old"] });
  assert.deepEqual(events, ["DELETE_ROW", "DELETE_OBJECT"]);
});

test("仍被其他内容引用的旧课程封面不会从对象存储删除", async () => {
  let objectDeleted = false;
  const mediaService = new MediaService() as MediaService & Record<string, unknown>;
  mediaService["prisma"] = {
    mediaAsset: {
      findFirst: async () => ({
        id: "cover-shared",
        filename: "shared-cover.png",
        originalName: "共享封面.png",
        mimeType: "image/png",
        size: 1024,
        url: "https://cdn.example.com/uploads/shared-cover.png",
        mediaType: "IMAGE",
        sourceType: "USER_UPLOAD",
        storageProvider: "S3",
        createdByAdminId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }),
      deleteMany: async () => ({ count: 0 })
    }
  };
  mediaService["deleteMediaObject"] = async () => {
    objectDeleted = true;
  };

  const result = await mediaService.cleanupUnreferencedCourseCoverAssets("user-1", ["cover-shared"]);

  assert.deepEqual(result, { deletedAssetIds: [] });
  assert.equal(objectDeleted, false);
});

test("用户课程控制器逐接口校验账号身份，资源中心公开列表可选读取当前身份", async () => {
  let authCalls = 0;
  const publicSubjects: unknown[] = [];
  const authService = {
    me: async () => {
      authCalls += 1;
      return { id: "user-1" };
    }
  };
  const courseService = {
    enrollCourses: async () => ({ addedCount: 2, courseIds: ["course-1", "course-2"] }),
    listAvailableCourseCatalog: async () => ({ items: [], page: 1, pageSize: 20, total: 0, tags: [] }),
    listEnrolledCourses: async () => ({ items: ["enrolled-course"], page: 1, pageSize: 12, total: 1 }),
    listUserCourses: async () => ["user-course"],
    createCourse: async () => ({ id: "created-course" }),
    getUserCourse: async () => ({ id: "user-course" }),
    saveCourse: async () => ({ id: "saved-course" }),
    listMaterialOptions: async () => ["material-option"],
    listPublicCourses: async (subject: unknown) => {
      publicSubjects.push(subject);
      return ["public-course"];
    },
    listPublicCourseListing: async (subject: unknown) => {
      publicSubjects.push(subject);
      return ["public-course-listing"];
    },
    getPublicCourse: async () => ({ id: "public-course" }),
    getCoursePage: async () => ({ state: "AVAILABLE", course: { id: "public-course" } })
  };
  const mediaService = {
    uploadUserCourseCover: async () => ({ id: "cover-1" })
  };
  const profileContextService = {
    requireAccount: async () => ({ userId: "user-1", mode: "ACCOUNT", learnerId: null }),
    optional: async () => ({ mode: "ACCOUNT", learnerId: null, learner: null })
  };
  const controller = new CoursesController(
    authService as never,
    courseService as never,
    mediaService as never,
    profileContextService as never
  );

  assert.deepEqual(await controller.list({}), { code: 0, message: "成功", data: ["user-course"] });
  assert.deepEqual(await controller.enrolled({}, {}), {
    code: 0,
    message: "成功",
    data: { items: ["enrolled-course"], page: 1, pageSize: 12, total: 1 }
  });
  assert.deepEqual((await controller.catalog({}, {})).data, {
    items: [], page: 1, pageSize: 20, total: 0, tags: []
  });
  assert.equal((await controller.enroll({}, { courseIds: ["course-1", "course-2"] })).data.addedCount, 2);
  assert.equal((await controller.create({}, saveCourseInput())).data.id, "created-course");
  assert.equal((await controller.get({}, "course-1")).data.id, "user-course");
  assert.equal((await controller.save({}, "course-1", saveCourseInput())).data.id, "saved-course");
  assert.deepEqual((await controller.materialOptions({})).data, ["material-option"]);
  assert.equal((await controller.uploadCover({}, validPngCoverFile())).data.id, "cover-1");
  assert.equal(authCalls, 9);

  const publicController = new PublicCoursesController(
    courseService as never,
    authService as never,
    profileContextService as never,
    { me: async () => ({ id: "admin-1" }) } as never
  );
  assert.deepEqual((await publicController.list({})).data, ["public-course"]);
  assert.deepEqual((await publicController.list({}, "listing")).data, ["public-course-listing"]);
  assert.equal((await publicController.get({}, "course-1")).data.course.id, "public-course");
  assert.equal(authCalls, 12);
  assert.deepEqual(publicSubjects, [
    { userId: "user-1", mode: "ACCOUNT", learnerId: null },
    { userId: "user-1", mode: "ACCOUNT", learnerId: null }
  ]);
});

test("资源中心公开列表把服务端解析的学习者身份传给课程查询", async () => {
  const receivedSubjects: unknown[] = [];
  const courseService = {
    listPublicCourses: async (subject: unknown) => {
      receivedSubjects.push(subject);
      return [];
    }
  };
  const controller = new PublicCoursesController(
    courseService as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => ({
        mode: "LEARNER",
        learnerId: "learner-1",
        learner: { id: "learner-1" }
      })
    } as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await controller.list({
    headers: { cookie: "xueleai_user_access=server-token" }
  });

  assert.deepEqual(receivedSubjects, [{
    userId: "user-1",
    mode: "LEARNER",
    learnerId: "learner-1"
  }]);
});

test("资源中心游客仍可读取全部公开课程", async () => {
  const receivedSubjects: unknown[] = [];
  const controller = new PublicCoursesController(
    {
      listPublicCourses: async (subject: unknown) => {
        receivedSubjects.push(subject);
        return ["public-course"];
      }
    } as never,
    {
      me: async () => {
        throw new AppException(40101, "请先登录", 401);
      }
    } as never,
    {
      optional: async () => {
        throw new Error("游客不应读取身份上下文");
      }
    } as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  assert.deepEqual((await controller.list({ headers: {} })).data, ["public-course"]);
  assert.deepEqual(receivedSubjects, [null]);
});

test("资源中心不会把失效登录态降级为游客", async () => {
  let courseCalls = 0;
  const controller = new PublicCoursesController(
    {
      listPublicCourses: async () => {
        courseCalls += 1;
        return [];
      }
    } as never,
    {
      me: async () => {
        throw new AppException(40101, "登录状态已失效，请重新登录", 401);
      }
    } as never,
    {} as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await assert.rejects(
    () => controller.list({ headers: { cookie: "xueleai_user_access=expired" } }),
    /登录状态已失效/u
  );
  assert.equal(courseCalls, 0);
});

test("公开课程详情把账号创作者和管理员身份传给课程页面服务", async () => {
  const viewers: unknown[] = [];
  const controller = new PublicCoursesController(
    {
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => ({ mode: "ACCOUNT", learnerId: null, learner: null })
    } as never,
    { me: async () => ({ id: "admin-1" }) } as never
  );

  await controller.get({}, "course-1");

  assert.deepEqual(viewers, [{ userId: "user-1", isAdmin: true }]);
});

test("学习者身份不能获得同一主账号创建课程的待审预览权限", async () => {
  const viewers: unknown[] = [];
  const controller = new PublicCoursesController(
    {
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => ({
        mode: "LEARNER",
        learnerId: "learner-1",
        learner: { id: "learner-1" }
      })
    } as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await controller.get({}, "course-1");

  assert.deepEqual(viewers, [{ userId: null, isAdmin: false }]);
});

test("公开课程详情允许游客访问并把缺失身份解析为空", async () => {
  const viewers: unknown[] = [];
  const unauthorized = (message: string) => async () => {
    throw new AppException(40101, message, 401);
  };
  const controller = new PublicCoursesController(
    {
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: unauthorized("请先登录") } as never,
    {
      optional: async () => {
        throw new Error("游客不应读取身份上下文");
      }
    } as never,
    { me: unauthorized("请先登录管理员账号") } as never
  );

  await controller.get({}, "course-1");

  assert.deepEqual(viewers, [{ userId: null, isAdmin: false }]);
});

test("公开课程详情把失效的账号资料身份降级为游客", async () => {
  const viewers: unknown[] = [];
  const controller = new PublicCoursesController(
    {
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => {
        throw new AppException(40101, "身份上下文已失效", 401);
      }
    } as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await controller.get({}, "course-1");

  assert.deepEqual(viewers, [{ userId: null, isAdmin: false }]);
});

test("失效的账号资料身份不影响有效管理员预览课程", async () => {
  const viewers: unknown[] = [];
  const controller = new PublicCoursesController(
    {
      getCoursePage: async (_id: string, viewer: unknown) => {
        viewers.push(viewer);
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => {
        throw new AppException(40101, "身份上下文已失效", 401);
      }
    } as never,
    { me: async () => ({ id: "admin-1" }) } as never
  );

  await controller.get({}, "course-1");

  assert.deepEqual(viewers, [{ userId: null, isAdmin: true }]);
});

test("公开课程详情不会吞掉账号资料身份服务的非认证异常", async () => {
  let courseCalls = 0;
  const controller = new PublicCoursesController(
    {
      getCoursePage: async () => {
        courseCalls += 1;
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => ({ id: "user-1" }) } as never,
    {
      optional: async () => {
        throw new AppException(50001, "身份上下文服务异常", 500);
      }
    } as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await assert.rejects(() => controller.get({}, "course-1"), /身份上下文服务异常/u);
  assert.equal(courseCalls, 0);
});

test("公开课程详情禁止缓存并按 Cookie 区分响应", () => {
  assert.deepEqual(
    Reflect.getMetadata(HEADERS_METADATA, PublicCoursesController.prototype.get),
    [
      { name: "Cache-Control", value: "private, no-store" },
      { name: "Vary", value: "Cookie" }
    ]
  );
});

test("公开课程详情不会把非认证异常降级为游客", async () => {
  let courseCalls = 0;
  const controller = new PublicCoursesController(
    {
      getCoursePage: async () => {
        courseCalls += 1;
        return { state: "REVIEWING", courseId: "course-1" };
      }
    } as never,
    { me: async () => { throw new AppException(50001, "身份服务异常", 500); } } as never,
    {} as never,
    { me: async () => { throw new AppException(40101, "请先登录管理员账号", 401); } } as never
  );

  await assert.rejects(() => controller.get({}, "course-1"), /身份服务异常/u);
  assert.equal(courseCalls, 0);
});
