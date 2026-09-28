import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { getPrismaClient, type Prisma, type PrismaClient } from "@xueleai/database";
import { AsyncLocalStorage } from "node:async_hooks";
import { AppException } from "../common/app-exception.js";
import { mediaAssetPublicUrl } from "../media/media-object-url.js";
import type { UpdateLearnerAuthorizationsDto } from "./dto/profile.dto.js";
import { assertMembershipScenarioAccess } from "./membership-access.js";
import { learnerGradeLabel } from "./learner-grade.js";
import type { ProfileSubject } from "./profile-context.types.js";

export const learnerScenarioRoots = new Map<string, string>([
  ["video-guide-practice-questions", "video-guide-narration"],
  ["video-guide-narration-timeline", "video-guide-narration"],
  ["english-guided-study-practice", "english-guided-study-material"],
  ["english-guided-study-narration-nodes", "english-guided-study-material"],
  ["english-guided-study-image-extraction", "english-guided-study-material"],
  ["gushiwen-guided-study-practice", "gushiwen-guided-study-material"],
  ["daodu-image-extraction", "daodu"],
  ["daodu-practice", "daodu"]
]);

const learnerApplicationCatalog = new Map<string, { href: string; type: "EXPERIENCE" | "SCENARIO" }>([
  ["experience-ai-chat", { href: "/experience/chat", type: "EXPERIENCE" }],
  ["experience-image-generation", { href: "/experience/image", type: "EXPERIENCE" }],
  ["experience-video-generation", { href: "/experience/video", type: "EXPERIENCE" }],
  ["article-to-speech", { href: "/voice", type: "EXPERIENCE" }],
  ["video-guide-narration", { href: "/media-tutor", type: "SCENARIO" }],
  ["english-guided-study-material", { href: "/text2lesson", type: "SCENARIO" }],
  ["gushiwen-guided-study-material", { href: "/gushiwen", type: "SCENARIO" }],
  ["learning-flashcards-deck", { href: "/flashcard", type: "SCENARIO" }],
  ["zitie", { href: "/zitie", type: "SCENARIO" }],
  ["daodu", { href: "/daodu", type: "SCENARIO" }],
  ["typing", { href: "/typing", type: "SCENARIO" }]
]);

type AccessPrisma = PrismaClient | Prisma.TransactionClient;

export function normalizeLearnerAuthorizationIds(value: string[]) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new AppException(40001, "授权参数不正确", HttpStatus.BAD_REQUEST);
  }

  const normalized = value.map((id) => id.trim());

  if (normalized.some((id) => id.length === 0)) {
    throw new AppException(40001, "授权项不能为空", HttpStatus.BAD_REQUEST);
  }

  return [...new Set(normalized)];
}

export interface AuthorizedScenarioTarget {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isEnabled: boolean;
  requiredCapabilities: Prisma.JsonValue | null;
  minimumMembershipRank: number;
  membershipEarlyAccessUntil: Date | null;
  toolCategory: { isVisible: boolean } | null;
}

export interface AuthorizedCourseTarget {
  id: string;
  approvedRevisionId: string | null;
  publishedAt: Date | null;
  approvedRevision: {
    id: string;
    name: string;
    summary: string;
    tags: string[];
    coverMedia: { url: string; filename: string; storageProvider: string };
  } | null;
}

const learnerCourseProjectionSelect = {
  id: true,
  publishedAt: true,
  approvedRevision: {
    select: {
      name: true,
      summary: true,
      tags: true,
      coverMedia: { select: { url: true, filename: true, storageProvider: true } },
      items: {
        select: {
          id: true,
          materialType: true,
          displayName: true,
          sortOrder: true,
          publication: { select: { approvedSnapshot: true, approvedHash: true, currentHash: true } },
          videoGuideLesson: { select: { status: true } },
          englishGuidedStudyMaterial: { select: { audioUrl: true } },
          learningFlashcardDeck: { select: { status: true } }
        },
        orderBy: { sortOrder: "asc" as const }
      }
    }
  }
} satisfies Prisma.CourseSelect;

type LearnerCourseProjectionRecord = Prisma.CourseGetPayload<{ select: typeof learnerCourseProjectionSelect }>;

@Injectable()
export class LearnerAccessService {
  private readonly prisma: PrismaClient;
  private readonly scenarioAuthorization = new AsyncLocalStorage<{
    subject: ProfileSubject;
    rootSlug: string;
  }>();

  constructor(@Optional() prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async listAuthorizationOptions() {
    const [scenarioRows, courseRows] = await Promise.all([
      this.prisma.aiScenario.findMany({
        where: { isEnabled: true },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isEnabled: true,
          sortOrder: true,
          toolCategory: {
            select: { id: true, name: true, slug: true, isVisible: true }
          }
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      this.prisma.course.findMany({
        where: {
          approvedRevisionId: { not: null },
          publishedAt: { not: null }
        },
        select: {
          id: true,
          publishedAt: true,
          approvedRevision: {
            select: {
              id: true,
              name: true,
              summary: true,
              tags: true,
              coverMedia: { select: { url: true, filename: true, storageProvider: true } }
            }
          }
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
      })
    ]);

    return {
      scenarios: scenarioRows.filter((scenario) => this.isGrantableScenario(scenario)).map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        slug: scenario.slug,
        description: scenario.description,
        category: scenario.toolCategory
          ? { id: scenario.toolCategory.id, name: scenario.toolCategory.name, slug: scenario.toolCategory.slug }
          : null
      })),
      courses: courseRows.flatMap((course) => {
        const revision = course.approvedRevision;
        return revision
          ? [{
              id: course.id,
              name: revision.name,
              summary: revision.summary,
              tags: revision.tags,
              coverUrl: mediaAssetPublicUrl(revision.coverMedia),
              publishedAt: course.publishedAt
            }]
          : [];
      })
    };
  }

  async getAuthorizations(userId: string, learnerId: string) {
    await this.requireOwnedLearner(this.prisma, userId, learnerId, false);
    const [scenarioRows, courseRows] = await Promise.all([
      this.prisma.learnerScenarioAuthorization.findMany({
        where: { learnerId },
        select: {
          scenarioId: true,
          scenario: {
            select: { slug: true, isEnabled: true }
          }
        },
        orderBy: { authorizedAt: "asc" }
      }),
      this.prisma.learnerCourseAuthorization.findMany({
        where: { learnerId },
        select: { courseId: true },
        orderBy: { authorizedAt: "asc" }
      })
    ]);

    return {
      scenarioIds: scenarioRows
        .filter((row) => this.isGrantableScenario(row.scenario))
        .map((row) => row.scenarioId),
      courseIds: courseRows.map((row) => row.courseId)
    };
  }

  async replaceAuthorizations(userId: string, learnerId: string, input: UpdateLearnerAuthorizationsDto) {
    return this.prisma.$transaction(
      (transaction) => this.replaceAuthorizationsInTransaction(transaction, userId, learnerId, input),
      { isolationLevel: "Serializable" }
    );
  }

  async replaceAuthorizationsInTransaction(
    transaction: AccessPrisma,
    userId: string,
    learnerId: string,
    input: Pick<UpdateLearnerAuthorizationsDto, "scenarioIds" | "courseIds">
  ) {
    const scenarioIds = normalizeLearnerAuthorizationIds(input.scenarioIds);
    const courseIds = normalizeLearnerAuthorizationIds(input.courseIds);
    await this.requireOwnedLearner(transaction, userId, learnerId, true);

    const scenarios = scenarioIds.length
      ? await transaction.aiScenario.findMany({
          where: { id: { in: scenarioIds }, isEnabled: true },
          select: {
            id: true,
            slug: true,
            isEnabled: true,
            toolCategory: { select: { isVisible: true } }
          }
        })
      : [];
    const validScenarioIds = new Set(
      scenarios.filter((scenario) => this.isGrantableScenario(scenario)).map((scenario) => scenario.id)
    );

    if (scenarioIds.some((id) => !validScenarioIds.has(id))) {
      throw new AppException(40004, "包含当前账号不可授权的应用", HttpStatus.BAD_REQUEST);
    }

    const courses = courseIds.length
      ? await transaction.course.findMany({
          where: {
            id: { in: courseIds },
            approvedRevisionId: { not: null },
            publishedAt: { not: null }
          },
          select: { id: true }
        })
      : [];
    const validCourseIds = new Set(courses.map((course) => course.id));

    if (courseIds.some((id) => !validCourseIds.has(id))) {
      throw new AppException(40004, "包含当前账号不可授权的课程", HttpStatus.BAD_REQUEST);
    }

    await transaction.learnerScenarioAuthorization.deleteMany({
      where: scenarioIds.length ? { learnerId, scenarioId: { notIn: scenarioIds } } : { learnerId }
    });
    await transaction.learnerCourseAuthorization.deleteMany({
      where: courseIds.length ? { learnerId, courseId: { notIn: courseIds } } : { learnerId }
    });

    if (scenarioIds.length) {
      await transaction.learnerScenarioAuthorization.createMany({
        data: scenarioIds.map((scenarioId) => ({ learnerId, scenarioId })),
        skipDuplicates: true
      });
    }
    if (courseIds.length) {
      await transaction.learnerCourseAuthorization.createMany({
        data: courseIds.map((courseId) => ({ learnerId, courseId })),
        skipDuplicates: true
      });
    }

    return { scenarioIds, courseIds };
  }

  async assertScenarioAuthorized(
    subject: ProfileSubject,
    scenarioIdOrSlug: string
  ): Promise<AuthorizedScenarioTarget | null> {
    if (subject.mode === "LEARNER") await this.requireActiveSubject(subject);
    const requested = await this.prisma.aiScenario.findFirst({
      where: { OR: [{ id: scenarioIdOrSlug }, { slug: scenarioIdOrSlug }] },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isEnabled: true,
        requiredCapabilities: true,
        minimumMembershipRank: true,
        membershipEarlyAccessUntil: true,
        toolCategory: { select: { isVisible: true } }
      }
    });

    if (!requested?.isEnabled) {
      throw new AppException(40401, "当前应用暂不可用", HttpStatus.NOT_FOUND);
    }

    const rootSlug = learnerScenarioRoots.get(requested.slug) ?? requested.slug;
    const root = rootSlug === requested.slug
      ? requested
      : await this.prisma.aiScenario.findFirst({
          where: { slug: rootSlug },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isEnabled: true,
            requiredCapabilities: true,
            minimumMembershipRank: true,
            membershipEarlyAccessUntil: true,
            toolCategory: { select: { isVisible: true } }
          }
        });

    if (!root?.isEnabled || (subject.mode === "LEARNER" && !this.isGrantableScenario(root))) {
      throw new AppException(40004, "当前应用暂不可用", HttpStatus.BAD_REQUEST);
    }

    await assertMembershipScenarioAccess(this.prisma, subject.userId, root);
    if (requested.id !== root.id) {
      await assertMembershipScenarioAccess(this.prisma, subject.userId, requested);
    }
    if (subject.mode === "ACCOUNT") return null;

    const authorization = await this.prisma.learnerScenarioAuthorization.findUnique({
      where: { learnerId_scenarioId: { learnerId: subject.learnerId, scenarioId: root.id } }
    });

    if (!authorization) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }

    return root;
  }

  async assertCourseAuthorized(subject: ProfileSubject, courseId: string): Promise<AuthorizedCourseTarget | null> {
    if (subject.mode === "ACCOUNT") {
      return null;
    }

    await this.requireActiveSubject(subject);
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        approvedRevisionId: { not: null },
        publishedAt: { not: null }
      },
      select: {
        id: true,
        approvedRevisionId: true,
        publishedAt: true,
        approvedRevision: {
          select: {
            id: true,
            name: true,
            summary: true,
            tags: true,
            coverMedia: { select: { url: true, filename: true, storageProvider: true } }
          }
        }
      }
    });

    if (!course?.approvedRevision) {
      throw new AppException(40004, "当前课程暂不可学习", HttpStatus.BAD_REQUEST);
    }

    const authorization = await this.prisma.learnerCourseAuthorization.findUnique({
      where: { learnerId_courseId: { learnerId: subject.learnerId, courseId } }
    });

    if (!authorization) {
      throw new AppException(40301, "当前学习者未获得此课程授权", HttpStatus.FORBIDDEN);
    }

    return course;
  }

  async filterAuthorizedScenarios<T extends { id?: string; slug: string }>(
    subject: ProfileSubject,
    rows: T[]
  ): Promise<T[]> {
    if (subject.mode === "ACCOUNT") return rows;
    await this.requireActiveSubject(subject);
    const grants = await this.prisma.learnerScenarioAuthorization.findMany({
      where: { learnerId: subject.learnerId },
      include: { scenario: { include: { toolCategory: true } } },
      orderBy: { authorizedAt: "asc" }
    });
    const authorizedRoots = new Set(
      grants
        .map((grant) => grant.scenario)
        .filter((scenario) => scenario?.isEnabled && this.isGrantableScenario(scenario))
        .map((scenario) => scenario.slug)
    );
    return rows.filter((row) => authorizedRoots.has(row.slug) && !learnerScenarioRoots.has(row.slug));
  }

  async assertHasAuthorizedCapability(subject: ProfileSubject, capability: string) {
    if (subject.mode === "ACCOUNT") return;
    await this.requireActiveSubject(subject);
    const grants = await this.prisma.learnerScenarioAuthorization.findMany({
      where: { learnerId: subject.learnerId },
      include: { scenario: { include: { toolCategory: true } } },
      orderBy: { authorizedAt: "asc" }
    });
    const available = grants.some(({ scenario }) =>
      scenario?.isEnabled
      && this.isGrantableScenario(scenario)
      && Array.isArray(scenario.requiredCapabilities)
      && scenario.requiredCapabilities.includes(capability));
    if (!available) {
      throw new AppException(40301, "当前学习者未获得可用的语音应用授权", HttpStatus.FORBIDDEN);
    }
  }

  runWithScenarioAuthorization<T>(
    subject: ProfileSubject,
    rootSlug: string,
    callback: () => Promise<T>
  ): Promise<T> {
    return this.scenarioAuthorization.run({ subject, rootSlug }, callback);
  }

  async assertInternalScenarioAuthorized(
    context: { userId: string; learnerId: string | null; rootScenarioId?: string | null },
    scenarioSlug: string
  ) {
    const authorization = this.scenarioAuthorization.getStore();
    if (!authorization) {
      throw new AppException(40301, "内部任务缺少执行身份", HttpStatus.FORBIDDEN);
    }
    const requestedRoot = learnerScenarioRoots.get(scenarioSlug) ?? scenarioSlug;
    if (
      authorization.subject.userId !== context.userId
      || authorization.subject.learnerId !== context.learnerId
    ) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }
    if (authorization.subject.mode === "ACCOUNT") {
      await this.assertScenarioAuthorized(authorization.subject, authorization.rootSlug);
      if (scenarioSlug !== authorization.rootSlug) {
        await this.assertScenarioAuthorized(authorization.subject, scenarioSlug);
      }
      return;
    }
    if (requestedRoot !== authorization.rootSlug) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }
    const currentRoot = await this.assertScenarioAuthorized(authorization.subject, scenarioSlug);
    if (
      context.rootScenarioId
      && currentRoot?.id !== context.rootScenarioId
    ) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }
    if (authorization.subject.mode === "LEARNER" && currentRoot?.slug !== authorization.rootSlug) {
      throw new AppException(40301, "当前学习者未获得此应用授权", HttpStatus.FORBIDDEN);
    }
  }

  async listAuthorizedCourses(subject: ProfileSubject) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份访问课程", HttpStatus.FORBIDDEN);
    }
    await this.requireActiveSubject(subject);
    const grants = await this.prisma.learnerCourseAuthorization.findMany({
      where: {
        learnerId: subject.learnerId,
        course: {
          approvedRevisionId: { not: null },
          publishedAt: { not: null }
        }
      },
      select: { course: { select: learnerCourseProjectionSelect } },
      orderBy: { authorizedAt: "asc" }
    });
    return grants.flatMap((grant) => {
      const projection = this.toLearnerCourseProjection(grant.course);
      return projection ? [projection] : [];
    });
  }

  async getAuthorizedCourse(subject: ProfileSubject, courseId: string) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份访问课程", HttpStatus.FORBIDDEN);
    }
    await this.assertCourseAuthorized(subject, courseId);
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        approvedRevisionId: { not: null },
        publishedAt: { not: null }
      },
      select: learnerCourseProjectionSelect
    });
    const projection = course ? this.toLearnerCourseProjection(course) : null;
    if (!projection) {
      throw new AppException(40004, "当前课程暂不可学习", HttpStatus.BAD_REQUEST);
    }
    return projection;
  }

  private toLearnerCourseProjection(course: LearnerCourseProjectionRecord) {
    if (!course.approvedRevision || !course.publishedAt) return null;
    return {
      id: course.id,
      name: course.approvedRevision.name,
      summary: course.approvedRevision.summary,
      tags: course.approvedRevision.tags,
      coverUrl: mediaAssetPublicUrl(course.approvedRevision.coverMedia),
      publishedAt: course.publishedAt,
      items: course.approvedRevision.items.flatMap((item) => (
        item.publication.approvedSnapshot
        && item.publication.approvedHash
        && item.publication.approvedHash === item.publication.currentHash
        && (
          (item.materialType === "VIDEO_GUIDE" && item.videoGuideLesson?.status === "SUCCEEDED")
          || (item.materialType === "ENGLISH_GUIDED_STUDY" && Boolean(item.englishGuidedStudyMaterial?.audioUrl))
          || (item.materialType === "LEARNING_FLASHCARD" && item.learningFlashcardDeck?.status === "READY")
        )
      )
        ? [{
            id: item.id,
            materialType: item.materialType,
            displayName: item.displayName,
            sortOrder: item.sortOrder,
            approvedSnapshot: item.publication.approvedSnapshot
          }]
        : [])
    };
  }

  async listAuthorizedHome(subject: ProfileSubject) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份访问学习首页", HttpStatus.FORBIDDEN);
    }

    const learner = await this.requireActiveSubject(subject);
    const [
      scenarioRows,
      courseRows,
      aiTasks,
      audioTasks,
      videoGuides,
      guidedStudies,
      flashcardDecks,
      copybooks
    ] = await Promise.all([
      this.prisma.learnerScenarioAuthorization.findMany({
        where: { learnerId: subject.learnerId },
        select: {
          scenario: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              isEnabled: true,
              toolCategory: { select: { isVisible: true } }
            }
          }
        },
        orderBy: { authorizedAt: "asc" }
      }),
      this.prisma.learnerCourseAuthorization.findMany({
        where: {
          learnerId: subject.learnerId,
          course: {
            approvedRevisionId: { not: null },
            publishedAt: { not: null }
          }
        },
        select: {
          course: {
            select: {
              id: true,
              approvedRevisionId: true,
              publishedAt: true,
              approvedRevision: {
                select: {
                  name: true,
                  summary: true,
                  tags: true,
                  coverMedia: { select: { url: true, filename: true, storageProvider: true } }
                }
              }
            }
          }
        },
        orderBy: { authorizedAt: "asc" }
      }),
      this.prisma.aiTask.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: {
          id: true,
          status: true,
          scenarioId: true,
          scenario: { select: { name: true, slug: true } },
          createdAt: true
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.audioTask.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: {
          id: true,
          type: true,
          status: true,
          scenarioId: true,
          scenario: { select: { name: true, slug: true } },
          createdAt: true
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.videoGuideLesson.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: { id: true, title: true, status: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.englishGuidedStudyMaterial.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: { id: true, title: true, audioUrl: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.learningFlashcardDeck.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: { id: true, title: true, status: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      }),
      this.prisma.copybookRecord.findMany({
        where: { userId: subject.userId, learnerId: subject.learnerId },
        select: { id: true, templateName: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5
      })
    ]);

    const authorizedScenarioIds = new Set<string>();
    const authorizedScenarioSlugs = new Set<string>();
    const scenarios = scenarioRows
      .map((row) => row.scenario)
      .filter((scenario) => scenario?.isEnabled && this.isGrantableScenario(scenario))
      .map((scenario) => {
        authorizedScenarioIds.add(scenario.id);
        authorizedScenarioSlugs.add(scenario.slug);
        return {
          id: scenario.id,
          name: scenario.name,
          slug: scenario.slug,
          description: scenario.description
        };
      });

    const hasAuthorizedRoot = (slug: string) => authorizedScenarioSlugs.has(slug);
    const recentRecords = [
      ...aiTasks.map((task) => ({
        id: task.id,
        type: "AI_TASK" as const,
        title: task.scenario.name,
        status: task.status,
        href: authorizedScenarioIds.has(task.scenarioId)
          ? this.scenarioHomeHref(task.scenario.slug)
          : "/learn",
        createdAt: task.createdAt.toISOString()
      })),
      ...audioTasks.map((task) => ({
        id: task.id,
        type: "AUDIO_TASK" as const,
        title: task.scenario?.name ?? this.audioTaskTitle(task.type),
        status: task.status,
        href: task.scenarioId && authorizedScenarioIds.has(task.scenarioId)
          ? this.scenarioHomeHref(task.scenario?.slug ?? "", task.id)
          : "/learn",
        createdAt: task.createdAt.toISOString()
      })),
      ...videoGuides.map((lesson) => ({
        id: lesson.id,
        type: "VIDEO_GUIDE" as const,
        title: lesson.title,
        status: lesson.status,
        href: hasAuthorizedRoot("video-guide-narration")
          ? `/media-tutor/creator/${encodeURIComponent(lesson.id)}`
          : "/learn",
        createdAt: lesson.createdAt.toISOString()
      })),
      ...guidedStudies.map((material) => ({
        id: material.id,
        type: "GUIDED_STUDY" as const,
        title: material.title,
        status: material.audioUrl ? "READY" : "DRAFT",
        href: hasAuthorizedRoot("english-guided-study-material")
          ? `/text2lesson/creator/${encodeURIComponent(material.id)}`
          : "/learn",
        createdAt: material.createdAt.toISOString()
      })),
      ...flashcardDecks.map((deck) => ({
        id: deck.id,
        type: "FLASHCARD_DECK" as const,
        title: deck.title,
        status: deck.status,
        href: hasAuthorizedRoot("learning-flashcards-deck")
          ? `/flashcard/${encodeURIComponent(deck.id)}`
          : "/learn",
        createdAt: deck.createdAt.toISOString()
      })),
      ...copybooks.map((record) => ({
        id: record.id,
        type: "COPYBOOK" as const,
        title: record.templateName,
        status: "SUCCEEDED",
        href: "/learn",
        createdAt: record.createdAt.toISOString()
      }))
    ].sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.type.localeCompare(right.type)
      || left.id.localeCompare(right.id)
    )).slice(0, 12);

    return {
      learner: {
        id: learner.id,
        nickname: learner.nickname,
        grade: learner.grade,
        gradeLabel: learnerGradeLabel(learner.grade),
        avatarUrl: learner.avatarUrl
      },
      scenarios,
      courses: courseRows.flatMap((row) => {
        const course = row.course;
        const revision = course?.approvedRevision;
        return course?.approvedRevisionId && course.publishedAt && revision
          ? [{
              id: course.id,
              name: revision.name,
              summary: revision.summary,
              tags: revision.tags,
              coverUrl: mediaAssetPublicUrl(revision.coverMedia),
              publishedAt: course.publishedAt
            }]
          : [];
      }),
      recentRecords
    };
  }

  async listLearningStatistics(subject: ProfileSubject) {
    if (subject.mode !== "LEARNER") {
      throw new AppException(40301, "请使用学习者身份查看学习统计", HttpStatus.FORBIDDEN);
    }

    await this.requireActiveSubject(subject);
    const completedEventTypes = [
      "CREATE_COMPLETED",
      "LEARNING_COMPLETED",
      "REVIEW_COMPLETED"
    ] as const;
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
    const [completedActivityCount, recentCompletedActivityCount, lastActivity] = await Promise.all([
      this.prisma.learnerActivityEvent.count({
        where: {
          userId: subject.userId,
          learnerId: subject.learnerId,
          eventType: { in: [...completedEventTypes] }
        }
      }),
      this.prisma.learnerActivityEvent.count({
        where: {
          userId: subject.userId,
          learnerId: subject.learnerId,
          eventType: { in: [...completedEventTypes] },
          occurredAt: { gte: recentCutoff }
        }
      }),
      this.prisma.learnerActivityEvent.findFirst({
        where: {
          userId: subject.userId,
          learnerId: subject.learnerId,
          eventType: { in: [...completedEventTypes] }
        },
        select: { occurredAt: true },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }]
      })
    ]);

    return {
      completedActivityCount,
      recentCompletedActivityCount,
      lastActivityAt: lastActivity?.occurredAt.toISOString() ?? null
    };
  }

  private async requireActiveSubject(subject: Extract<ProfileSubject, { mode: "LEARNER" }>) {
    const learner = await this.prisma.learner.findFirst({
      where: { id: subject.learnerId, userId: subject.userId, status: "ACTIVE" },
      select: { id: true, nickname: true, grade: true, avatarUrl: true }
    });

    if (!learner) {
      throw new AppException(40301, "当前学习者身份已失效", HttpStatus.FORBIDDEN);
    }

    return learner;
  }

  private scenarioHomeHref(slug: string, resourceId?: string) {
    const base = learnerApplicationCatalog.get(slug)?.href ?? `/tools/${encodeURIComponent(slug)}`;
    return resourceId && slug === "article-to-speech"
      ? `${base}?task=${encodeURIComponent(resourceId)}`
      : base;
  }

  private audioTaskTitle(type: string) {
    return ({
      ASR: "语音识别",
      TTS: "语音合成",
      VOICE_CLONE: "声音复刻",
      VOICE_DESIGN: "声音设计"
    } as Record<string, string>)[type] ?? "语音任务";
  }

  private async requireOwnedLearner(
    transaction: AccessPrisma,
    userId: string,
    learnerId: string,
    requireActive: boolean
  ) {
    const learner = await transaction.learner.findFirst({
      where: { id: learnerId, userId, ...(requireActive ? { status: "ACTIVE" as const } : {}) },
      select: { id: true }
    });

    if (!learner) {
      throw new AppException(40401, "学习者不存在或无权操作", HttpStatus.NOT_FOUND);
    }

    return learner;
  }

  private isGrantableScenario(scenario: {
    slug: string;
    isEnabled: boolean;
  }) {
    return (
      scenario.isEnabled &&
      !learnerScenarioRoots.has(scenario.slug) &&
      learnerApplicationCatalog.has(scenario.slug)
    );
  }
}
