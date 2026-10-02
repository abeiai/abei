import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, type Prisma } from "@xueleai/database";
import { AppException } from "../common/app-exception.js";
import { mediaAssetPublicUrl } from "../media/media-object-url.js";
import type { ProfileSubject } from "../profiles/profile-context.types.js";
import {
  createCourseId,
  hashCourseSnapshot,
  normalizeCourseTags,
  snapshotCourseMaterial,
  type CourseMaterialSnapshot,
  type CourseMaterialType
} from "./course-domain.js";
import type { CourseItemInputDto, SaveCourseDto } from "./dto/course.dto.js";

type CourseMaterialRecord = {
  audioUrl?: string | null;
  cards?: unknown[];
  content?: unknown;
  pages?: unknown;
  style?: string;
  aspectRatio?: string;
  id: string;
  knowledgeMap?: unknown;
  shareToken?: string;
  status?: string;
  summary?: string;
  title: string;
  updatedAt: Date;
  userId: string;
};

type ValidatedCourseItem = {
  displayName: string;
  materialId: string;
  materialType: CourseMaterialType;
  record: CourseMaterialRecord;
  snapshot: CourseMaterialSnapshot;
};

type NormalizedCourseInput = {
  coverMediaId: string;
  items: CourseItemInputDto[];
  name: string;
  summary: string;
  tags: string[];
};

export type PublicCourse = {
  id: string;
  name: string;
  coverUrl: string;
  summary: string;
  tags: string[];
  author: { nickname: string; avatarUrl: string | null };
  reviewing: boolean;
  publishedAt: Date;
  learningCount: number;
  items: Array<{
    id: string;
    materialType: CourseMaterialType;
    displayName: string;
    sortOrder: number;
    reviewState: "READY" | "PENDING" | "REJECTED";
    launchHref: string | null;
  }>;
};

export type CoursePageViewer = {
  userId: string | null;
  isAdmin: boolean;
};

export type CoursePageResult =
  | {
      state: "AVAILABLE";
      course: PublicCourse;
      hasPublishedRevision: boolean;
      previewMode: "PUBLIC" | "CREATOR" | "ADMIN";
      revisionStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
    }
  | {
      state: "REVIEWING";
      courseId: string;
    };

export type CourseListItem = {
  id: string;
  name: string;
  coverUrl: string;
  summary: string;
  tags: string[];
  author: { nickname: string; avatarUrl: string | null };
  reviewing: boolean;
  publishedAt: Date;
  itemCount: number;
  learningCount: number;
};

export type PublicCourseListingItem = CourseListItem & {
  itemNames: string[];
};

export type CourseListPage = {
  items: CourseListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type CourseCatalogPage = CourseListPage & {
  tags: string[];
};

const courseRevisionInclude = {
  coverMedia: {
    select: {
      id: true,
      filename: true,
      storageProvider: true,
      url: true
    }
  },
  items: {
    include: {
      publication: {
        include: {
          reviewRequests: {
            where: {
              scope: "MATERIAL_CHANGE" as const,
              status: "REJECTED" as const
            },
            orderBy: {
              reviewedAt: "desc" as const
            },
            take: 1,
            select: {
              reviewNote: true
            }
          }
        }
      },
      videoGuideLesson: true,
      englishGuidedStudyMaterial: true,
      pictureBook: true,
      learningFlashcardDeck: {
        include: {
          cards: {
            orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }]
          }
        }
      }
    },
    orderBy: {
      sortOrder: "asc" as const
    }
  }
} satisfies Prisma.CourseRevisionInclude;

const courseInclude = {
  approvedRevision: {
    include: courseRevisionInclude
  },
  workingRevision: {
    include: courseRevisionInclude
  }
} satisfies Prisma.CourseInclude;

const publicCourseInclude = {
  _count: {
    select: {
      enrollments: true
    }
  },
  user: {
    select: {
      avatarUrl: true,
      nickname: true
    }
  },
  approvedRevision: {
    include: courseRevisionInclude
  }
} satisfies Prisma.CourseInclude;

type PublicCourseRecord = Prisma.CourseGetPayload<{ include: typeof publicCourseInclude }>;

const coursePageInclude = {
  _count: {
    select: {
      enrollments: true
    }
  },
  user: {
    select: {
      avatarUrl: true,
      nickname: true
    }
  },
  approvedRevision: {
    include: courseRevisionInclude
  },
  workingRevision: {
    include: courseRevisionInclude
  }
} satisfies Prisma.CourseInclude;

type CoursePageRecord = Prisma.CourseGetPayload<{ include: typeof coursePageInclude }>;
type CoursePageRevision = NonNullable<CoursePageRecord["approvedRevision"]>;
type CoursePageProjectionRecord = Pick<
  CoursePageRecord,
  "_count" | "id" | "reviewState" | "user"
>;

const courseListSelect = {
  id: true,
  publishedAt: true,
  reviewState: true,
  _count: {
    select: {
      enrollments: true
    }
  },
  user: {
    select: {
      avatarUrl: true,
      nickname: true
    }
  },
  approvedRevision: {
    select: {
      name: true,
      summary: true,
      tags: true,
      coverMedia: {
        select: {
          filename: true,
          storageProvider: true,
          url: true
        }
      },
      _count: {
        select: {
          items: true
        }
      }
    }
  }
} satisfies Prisma.CourseSelect;

const publicCourseListingSelect = {
  ...courseListSelect,
  approvedRevision: {
    select: {
      ...courseListSelect.approvedRevision.select,
      items: {
        select: {
          displayName: true
        }
      }
    }
  }
} satisfies Prisma.CourseSelect;

type CourseListRecord = Prisma.CourseGetPayload<{
  select: typeof courseListSelect;
}>;

type PublicCourseListingRecord = Prisma.CourseGetPayload<{
  select: typeof publicCourseListingSelect;
}>;

type CourseRecord = Prisma.CourseGetPayload<{
  include: typeof courseInclude;
}>;

const enrolledCourseSelect = {
  course: {
    select: courseListSelect
  }
} satisfies Prisma.CourseEnrollmentSelect;

type EnrolledCourseRecord = Prisma.CourseEnrollmentGetPayload<{
  select: typeof enrolledCourseSelect;
}>;

function toCourseListItem(record: CourseListRecord): CourseListItem | null {
  const revision = record.approvedRevision;

  return revision && record.publishedAt ? {
    id: record.id,
    name: revision.name,
    coverUrl: mediaAssetPublicUrl(revision.coverMedia),
    summary: revision.summary,
    tags: revision.tags,
    author: record.user,
    reviewing: record.reviewState === "PENDING_REVIEW",
    publishedAt: record.publishedAt,
    itemCount: revision._count.items,
    learningCount: record._count.enrollments
  } : null;
}

function toPublicCourseListingItem(
  record: PublicCourseListingRecord
): PublicCourseListingItem | null {
  const course = toCourseListItem(record);
  const revision = record.approvedRevision;

  return course && revision
    ? { ...course, itemNames: revision.items.map((item) => item.displayName) }
    : null;
}

function publicCourseWhere(subject: ProfileSubject | null): Prisma.CourseWhereInput {
  return {
    approvedRevisionId: { not: null },
    publishedAt: { not: null },
    ...(subject?.mode === "LEARNER"
      ? {
          learnerAuthorizations: { some: { learnerId: subject.learnerId } },
          OR: [
            { userId: subject.userId },
            { enrollments: { some: { userId: subject.userId } } }
          ]
        }
      : {})
  };
}

function normalizeRevisionCoverUrl<T extends CourseRecord["approvedRevision"]>(revision: T): T {
  if (!revision?.coverMedia) {
    return revision;
  }

  return {
    ...revision,
    coverMedia: {
      ...revision.coverMedia,
      url: mediaAssetPublicUrl(revision.coverMedia)
    }
  } as T;
}

function normalizeCourseRecordCoverUrls(course: CourseRecord): CourseRecord {
  return {
    ...course,
    approvedRevision: normalizeRevisionCoverUrl(course.approvedRevision),
    workingRevision: normalizeRevisionCoverUrl(course.workingRevision)
  };
}

@Injectable()
export class CoursesService {
  private readonly prisma = getPrismaClient();

  async createCourse(userId: string, dto: SaveCourseDto) {
    this.assertUserId(userId);
    const courseInput = this.normalizeCourseInput(dto);

    return this.prisma.$transaction(async (transaction) => {
      const input = await this.validateCourseInput(transaction, userId, courseInput);
      const id = createCourseId();
      await transaction.course.create({
        data: {
          id,
          userId,
          reviewState: "DRAFT"
        }
      });
      const revisionItems = await this.upsertMaterialPublications(transaction, input.items);
      const revision = await transaction.courseRevision.create({
        data: {
          courseId: id,
          coverMediaId: courseInput.coverMediaId,
          name: courseInput.name,
          summary: courseInput.summary,
          tags: courseInput.tags,
          status: "DRAFT",
          items: {
            create: revisionItems
          }
        }
      });
      await transaction.course.update({
        where: { id },
        data: { workingRevisionId: revision.id }
      });

      return normalizeCourseRecordCoverUrls(this.requireCourse(
        await transaction.course.findUnique({
          where: { id },
          include: courseInclude
        })
      ));
    });
  }

  async saveCourse(userId: string, id: string, dto: SaveCourseDto) {
    this.assertUserId(userId);
    const ownedCourse = await this.prisma.course.findFirst({
      where: { id, userId },
      include: {
        workingRevision: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!ownedCourse) {
      throw new AppException(40401, "课程不存在", HttpStatus.NOT_FOUND);
    }

    this.assertCourseEditable(ownedCourse);
    const courseInput = this.normalizeCourseInput(dto);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockCourse(transaction, id);
      const course = await transaction.course.findFirst({
        where: { id, userId },
        include: {
          workingRevision: {
            select: {
              id: true,
              status: true
            }
          }
        }
      });

      if (!course) {
        throw new AppException(40401, "课程不存在", HttpStatus.NOT_FOUND);
      }

      this.assertCourseEditable(course);
      const input = await this.validateCourseInput(transaction, userId, courseInput);
      const revisionItems = await this.upsertMaterialPublications(transaction, input.items);
      const revisionData = {
        coverMediaId: courseInput.coverMediaId,
        name: courseInput.name,
        summary: courseInput.summary,
        tags: courseInput.tags,
        status: "DRAFT" as const,
        submittedAt: null,
        reviewedAt: null,
        rejectionReason: null
      };
      const replaceableWorkingRevision = course.workingRevision
        && course.workingRevision.id !== course.approvedRevisionId
        && ["DRAFT", "REJECTED"].includes(course.workingRevision.status)
        ? course.workingRevision
        : null;
      let workingRevisionId: string;

      if (replaceableWorkingRevision) {
        workingRevisionId = replaceableWorkingRevision.id;
        await transaction.courseRevision.update({
          where: { id: workingRevisionId },
          data: {
            ...revisionData,
            items: {
              deleteMany: {},
              create: revisionItems
            }
          }
        });
      } else {
        const revision = await transaction.courseRevision.create({
          data: {
            courseId: course.id,
            ...revisionData,
            items: {
              create: revisionItems
            }
          }
        });
        workingRevisionId = revision.id;
      }

      await transaction.course.update({
        where: { id: course.id },
        data: {
          workingRevisionId,
          reviewState: course.approvedRevisionId ? "PUBLISHED" : "DRAFT"
        }
      });

      return normalizeCourseRecordCoverUrls(this.requireCourse(
        await transaction.course.findUnique({
          where: { id: course.id },
          include: courseInclude
        })
      ));
    });
  }

  async listUserCourses(userId: string) {
    this.assertUserId(userId);

    const courses = await this.prisma.course.findMany({
      where: { userId },
      include: courseInclude,
      orderBy: { updatedAt: "desc" }
    });

    return courses.map(normalizeCourseRecordCoverUrls);
  }

  async listEnrolledCourses(
    userId: string,
    input: { page?: number; pageSize?: number } = {}
  ): Promise<CourseListPage> {
    this.assertUserId(userId);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 12)));
    const where: Prisma.CourseEnrollmentWhereInput = {
      userId,
      course: {
        approvedRevisionId: { not: null },
        publishedAt: { not: null }
      }
    };
    const [enrollments, total] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where,
        select: enrolledCourseSelect,
        orderBy: [{ addedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.courseEnrollment.count({ where })
    ]);

    return {
      items: enrollments.flatMap((enrollment: EnrolledCourseRecord) => {
        const projected = toCourseListItem(enrollment.course);
        return projected ? [projected] : [];
      }),
      page,
      pageSize,
      total
    };
  }

  async listAvailableCourseCatalog(
    userId: string,
    input: {
      keyword?: string;
      tag?: string;
      page?: number;
      pageSize?: number;
      includeTags?: boolean;
    }
  ): Promise<CourseCatalogPage> {
    this.assertUserId(userId);
    const keyword = input.keyword?.trim() ?? "";
    const tag = input.tag?.trim() ?? "";
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const baseWhere: Prisma.CourseWhereInput = {
      approvedRevisionId: { not: null },
      publishedAt: { not: null },
      enrollments: {
        none: { userId }
      }
    };
    const filters: Prisma.CourseWhereInput[] = [baseWhere];

    if (tag) {
      filters.push({
        approvedRevision: {
          is: {
            tags: { has: tag }
          }
        }
      });
    }

    if (keyword) {
      filters.push({
        OR: [
          { approvedRevision: { is: { name: { contains: keyword, mode: "insensitive" } } } },
          { approvedRevision: { is: { summary: { contains: keyword, mode: "insensitive" } } } },
          { approvedRevision: { is: { tags: { has: keyword } } } },
          { user: { is: { nickname: { contains: keyword, mode: "insensitive" } } } }
        ]
      });
    }

    const where: Prisma.CourseWhereInput = { AND: filters };
    const [records, total, tagRecords] = await Promise.all([
      this.prisma.course.findMany({
        where,
        select: courseListSelect,
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.course.count({ where }),
      input.includeTags === false
        ? Promise.resolve([])
        : this.prisma.course.findMany({
            where: baseWhere,
            select: {
              approvedRevision: {
                select: { tags: true }
              }
            }
          })
    ]);

    return {
      items: records.flatMap((record: CourseListRecord) => {
        const projected = toCourseListItem(record);
        return projected ? [projected] : [];
      }),
      page,
      pageSize,
      total,
      tags: [...new Set(tagRecords.flatMap((record) => record.approvedRevision?.tags ?? []))]
        .sort((left, right) => left.localeCompare(right, "zh-CN"))
    };
  }

  async enrollCourses(userId: string, courseIds: string[]) {
    this.assertUserId(userId);
    const normalizedIds = [...new Set(courseIds.map((id) => id.trim()).filter(Boolean))];

    if (normalizedIds.length === 0) {
      throw new AppException(40001, "请至少选择一门课程", HttpStatus.BAD_REQUEST);
    }

    if (normalizedIds.length > 50) {
      throw new AppException(40001, "一次最多添加 50 门课程", HttpStatus.BAD_REQUEST);
    }

    return this.prisma.$transaction(async (transaction) => {
      const publishedCourses = await transaction.course.findMany({
        where: {
          id: { in: normalizedIds },
          approvedRevisionId: { not: null },
          publishedAt: { not: null }
        },
        select: { id: true }
      });
      const publishedIds = new Set(publishedCourses.map((course) => course.id));

      if (normalizedIds.some((id) => !publishedIds.has(id))) {
        throw new AppException(40401, "有课程不存在或尚未发布", HttpStatus.NOT_FOUND);
      }

      const result = await transaction.courseEnrollment.createMany({
        data: normalizedIds.map((courseId) => ({ userId, courseId })),
        skipDuplicates: true
      });

      return {
        addedCount: result.count,
        courseIds: normalizedIds
      };
    });
  }

  async getUserCourse(userId: string, id: string) {
    this.assertUserId(userId);
    const course = await this.prisma.course.findFirst({
      where: { id, userId },
      include: courseInclude
    });

    if (!course) {
      throw new AppException(40401, "课程不存在", HttpStatus.NOT_FOUND);
    }

    return normalizeCourseRecordCoverUrls(course);
  }

  async listMaterialOptions(userId: string) {
    this.assertUserId(userId);
    const [videos, englishMaterials, flashcardDecks, pictureBooks] = await Promise.all([
      this.prisma.videoGuideLesson.findMany({
        where: { userId, status: "SUCCEEDED" },
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.englishGuidedStudyMaterial.findMany({
        where: { userId, audioUrl: { not: null } },
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.learningFlashcardDeck.findMany({
        where: { userId, status: "READY" },
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.pictureBook.findMany({
        where: { userId, status: "COMPLETED" },
        orderBy: { updatedAt: "desc" }
      })
    ]);

    return [
      ...videos.map((item) => ({
        materialType: "VIDEO_GUIDE" as const,
        materialId: item.id,
        title: item.title,
        subtitle: "视频导学",
        updatedAt: item.updatedAt
      })),
      ...englishMaterials.map((item) => {
        const guidedStudyScene = guidedStudyMaterialScene(item.content);
        return {
          materialType: "ENGLISH_GUIDED_STUDY" as const,
          materialId: item.id,
          title: item.title,
          subtitle: guidedStudyScene === "GUSHIWEN" ? "学古诗文" : "英文带学",
          guidedStudyScene,
          updatedAt: item.updatedAt
        };
      }),
      ...flashcardDecks.map((item) => ({
        materialType: "LEARNING_FLASHCARD" as const,
        materialId: item.id,
        title: item.title,
        subtitle: "学习闪卡",
        updatedAt: item.updatedAt
      })),
      ...pictureBooks.map((item) => ({
        materialType: "PICTURE_BOOK" as const,
        materialId: item.id,
        title: item.title,
        subtitle: "绘本",
        updatedAt: item.updatedAt
      }))
    ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async listPublicCourses(subject: ProfileSubject | null = null): Promise<PublicCourse[]> {
    const courses = await this.prisma.course.findMany({
      where: publicCourseWhere(subject),
      include: publicCourseInclude,
      orderBy: { publishedAt: "desc" }
    });

    return courses.flatMap((course) => {
      const revision = course.approvedRevision;

      return revision && course.publishedAt
        ? [this.toPublicCourse(course, revision, course.publishedAt)]
        : [];
    });
  }

  async listPublicCourseListing(
    subject: ProfileSubject | null = null
  ): Promise<PublicCourseListingItem[]> {
    const courses = await this.prisma.course.findMany({
      where: publicCourseWhere(subject),
      select: publicCourseListingSelect,
      orderBy: { publishedAt: "desc" }
    });

    return courses.flatMap((course) => {
      const item = toPublicCourseListingItem(course);
      return item ? [item] : [];
    });
  }

  async getPublicCourse(id: string): Promise<PublicCourse> {
    const course = await this.prisma.course.findFirst({
      where: {
        id,
        approvedRevisionId: { not: null },
        publishedAt: { not: null }
      },
      include: publicCourseInclude
    });

    const revision = course?.approvedRevision;

    if (!course || !revision || !course.publishedAt) {
      throw new AppException(40401, "课程不存在或尚未发布", HttpStatus.NOT_FOUND);
    }

    return this.toPublicCourse(course, revision, course.publishedAt);
  }

  async getCoursePage(id: string, viewer: CoursePageViewer): Promise<CoursePageResult> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: coursePageInclude
    });

    if (!course) {
      throw new AppException(40401, "课程不存在或尚未发布", HttpStatus.NOT_FOUND);
    }

    const canPreviewWorking = viewer.isAdmin || viewer.userId === course.userId;
    const revision = canPreviewWorking && course.workingRevision
      ? course.workingRevision
      : course.approvedRevision;

    if (!revision || (!canPreviewWorking && !course.publishedAt)) {
      return { state: "REVIEWING", courseId: course.id };
    }

    const previewMode = viewer.isAdmin
      ? "ADMIN" as const
      : viewer.userId === course.userId
        ? "CREATOR" as const
        : "PUBLIC" as const;

    return {
      state: "AVAILABLE",
      course: this.toPublicCourse(
        course,
        revision,
        course.publishedAt ?? revision.updatedAt
      ),
      hasPublishedRevision: Boolean(course.approvedRevisionId && course.publishedAt),
      previewMode,
      revisionStatus: revision.status
    };
  }

  private normalizeCourseInput(dto: SaveCourseDto): NormalizedCourseInput {
    const name = dto.name.trim();

    if (!name) {
      throw new AppException(40001, "课程名称不能为空", HttpStatus.BAD_REQUEST);
    }

    if (name.length < 2) {
      throw new AppException(40001, "课程名称至少需要 2 个字符", HttpStatus.BAD_REQUEST);
    }

    const summary = dto.summary.trim();

    if (!summary) {
      throw new AppException(40001, "课程简介不能为空", HttpStatus.BAD_REQUEST);
    }

    const items = dto.items.map((item) => {
      const displayName = item.displayName.trim();

      if (!displayName) {
        throw new AppException(40001, "课件名称不能为空", HttpStatus.BAD_REQUEST);
      }

      return {
        ...item,
        displayName
      };
    });

    return {
      coverMediaId: dto.coverMediaId,
      items,
      name,
      summary,
      tags: normalizeCourseTags(dto.tags)
    };
  }

  private async validateCourseInput(
    transaction: Prisma.TransactionClient,
    userId: string,
    dto: NormalizedCourseInput
  ) {
    const duplicateKeys = new Set<string>();

    for (const item of dto.items) {
      const key = `${item.materialType}:${item.materialId}`;

      if (duplicateKeys.has(key)) {
        throw new AppException(40001, "课程中不能重复添加同一课件", HttpStatus.BAD_REQUEST);
      }

      duplicateKeys.add(key);
    }

    const idsByType = groupMaterialIds(dto.items);
    const [cover, videoLessons, englishMaterials, flashcardDecks, pictureBooks] = await Promise.all([
      transaction.mediaAsset.findUnique({ where: { id: dto.coverMediaId } }),
      transaction.videoGuideLesson.findMany({
        where: { id: { in: idsByType.VIDEO_GUIDE } }
      }),
      transaction.englishGuidedStudyMaterial.findMany({
        where: { id: { in: idsByType.ENGLISH_GUIDED_STUDY } }
      }),
      transaction.learningFlashcardDeck.findMany({
        where: { id: { in: idsByType.LEARNING_FLASHCARD } },
        include: {
          cards: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
          }
        }
      }),
      transaction.pictureBook.findMany({ where: { id: { in: idsByType.PICTURE_BOOK } } })
    ]);

    if (!cover) {
      throw new AppException(40401, "课程封面不存在", HttpStatus.NOT_FOUND);
    }

    if (cover.createdByUserId !== userId) {
      throw new AppException(40301, "只能选择自己上传的课程封面", HttpStatus.FORBIDDEN);
    }

    if (cover.mediaType !== "IMAGE") {
      throw new AppException(40001, "课程封面必须是图片", HttpStatus.BAD_REQUEST);
    }

    const recordByKey = new Map<string, CourseMaterialRecord>();
    addMaterialRecords(recordByKey, "VIDEO_GUIDE", videoLessons);
    addMaterialRecords(recordByKey, "ENGLISH_GUIDED_STUDY", englishMaterials);
    addMaterialRecords(recordByKey, "LEARNING_FLASHCARD", flashcardDecks);
    addMaterialRecords(recordByKey, "PICTURE_BOOK", pictureBooks);
    const items = dto.items.map((item) => this.validateMaterialItem(userId, item, recordByKey));

    return { cover, items };
  }

  private validateMaterialItem(
    userId: string,
    item: CourseItemInputDto,
    recordByKey: Map<string, CourseMaterialRecord>
  ): ValidatedCourseItem {
    const record = recordByKey.get(`${item.materialType}:${item.materialId}`);

    if (!record) {
      throw new AppException(40401, "课件不存在", HttpStatus.NOT_FOUND);
    }

    if (record.userId !== userId) {
      throw new AppException(40301, "只能选择自己创建的课件", HttpStatus.FORBIDDEN);
    }

    if (item.materialType === "VIDEO_GUIDE" && record.status !== "SUCCEEDED") {
      throw new AppException(40001, "只能选择已完成的视频导学课件", HttpStatus.BAD_REQUEST);
    }

    if (item.materialType === "ENGLISH_GUIDED_STUDY" && !record.audioUrl) {
      throw new AppException(40001, "只能选择可学习的英文带学课件", HttpStatus.BAD_REQUEST);
    }

    if (item.materialType === "LEARNING_FLASHCARD" && record.status !== "READY") {
      throw new AppException(40001, "只能选择已完成的闪卡课件", HttpStatus.BAD_REQUEST);
    }

    if (item.materialType === "PICTURE_BOOK" && record.status !== "COMPLETED") {
      throw new AppException(40001, "只能选择已完成的绘本", HttpStatus.BAD_REQUEST);
    }

    return {
      displayName: item.displayName.trim(),
      materialId: item.materialId,
      materialType: item.materialType,
      record,
      snapshot: snapshotCourseMaterial(item.materialType, record)
    };
  }

  private async upsertMaterialPublications(
    transaction: Prisma.TransactionClient,
    items: ValidatedCourseItem[]
  ) {
    const publications = await Promise.all(items.map(async (item) => {
      const snapshot = item.snapshot as Prisma.InputJsonValue;
      const currentHash = hashCourseSnapshot(snapshot);
      const source = materialSourceFields(item.materialType, item.materialId);
      const publication = await transaction.courseMaterialPublication.upsert({
        where: publicationWhere(item.materialType, item.materialId),
        create: {
          materialType: item.materialType,
          ...source,
          status: "PENDING",
          currentSnapshot: snapshot,
          currentHash
        },
        update: {
          currentSnapshot: snapshot,
          currentHash
        }
      });

      return {
        publicationId: publication.id,
        materialType: item.materialType,
        ...source,
        displayName: item.displayName
      };
    }));

    return publications.map((item, sortOrder) => ({ ...item, sortOrder }));
  }

  private assertCourseEditable(course: {
    reviewState: string;
    workingRevision: { status: string } | null;
  }) {
    if (course.reviewState === "PENDING_REVIEW" || course.workingRevision?.status === "PENDING") {
      throw new AppException(40901, "课程正在审核中", HttpStatus.CONFLICT);
    }
  }

  private async lockCourse(transaction: Prisma.TransactionClient, courseId: string) {
    await transaction.$queryRaw`SELECT "id" FROM "courses" WHERE "id" = ${courseId} FOR UPDATE`;
  }

  private assertUserId(userId: string) {
    if (!userId) {
      throw new AppException(40101, "请先登录", HttpStatus.UNAUTHORIZED);
    }
  }

  private requireCourse<T>(course: T | null): T {
    if (!course) {
      throw new AppException(50001, "课程保存失败", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return course;
  }

  private toPublicCourse(
    course: CoursePageProjectionRecord,
    revision: CoursePageRevision,
    publishedAt: Date
  ): PublicCourse {
    const reviewing = course.reviewState === "PENDING_REVIEW";

    return {
      id: course.id,
      name: revision.name,
      coverUrl: mediaAssetPublicUrl(revision.coverMedia),
      summary: revision.summary,
      tags: revision.tags,
      author: course.user,
      reviewing,
      publishedAt,
      learningCount: course._count.enrollments,
      items: revision.items.map((item) => {
        const record = revisionItemMaterial(item);
        const currentHash = record
          ? hashCourseSnapshot(snapshotCourseMaterial(item.materialType, record))
          : null;
        const ready = Boolean(
          item.publication.approvedHash
          && currentHash === item.publication.approvedHash
          && record
          && isCourseMaterialLearnable(item.materialType, record)
        );
        const reviewState = ready
          ? "READY" as const
          : item.publication.status === "REJECTED"
            ? "REJECTED" as const
            : "PENDING" as const;

        return {
          id: item.id,
          materialType: item.materialType,
          displayName: item.displayName,
          sortOrder: item.sortOrder,
          reviewState,
          launchHref: ready && record
            ? materialLaunchHref(item.materialType, record)
            : null
        };
      })
    };
  }
}

function guidedStudyMaterialScene(content: unknown) {
  return content
    && typeof content === "object"
    && !Array.isArray(content)
    && "scene" in content
    && content.scene === "GUSHIWEN"
      ? "GUSHIWEN" as const
      : "ENGLISH" as const;
}

function groupMaterialIds(items: CourseItemInputDto[]) {
  const grouped: Record<CourseMaterialType, string[]> = {
    VIDEO_GUIDE: [],
    ENGLISH_GUIDED_STUDY: [],
    LEARNING_FLASHCARD: [],
    PICTURE_BOOK: []
  };

  for (const item of items) {
    grouped[item.materialType].push(item.materialId);
  }

  return grouped;
}

function addMaterialRecords(
  target: Map<string, CourseMaterialRecord>,
  materialType: CourseMaterialType,
  records: CourseMaterialRecord[]
) {
  for (const record of records) {
    target.set(`${materialType}:${record.id}`, record);
  }
}

function materialSourceFields(materialType: CourseMaterialType, materialId: string) {
  if (materialType === "VIDEO_GUIDE") {
    return { videoGuideLessonId: materialId };
  }

  if (materialType === "ENGLISH_GUIDED_STUDY") {
    return { englishGuidedStudyMaterialId: materialId };
  }

  if (materialType === "PICTURE_BOOK") return { pictureBookId: materialId };

  return { learningFlashcardDeckId: materialId };
}

function publicationWhere(
  materialType: CourseMaterialType,
  materialId: string
): Prisma.CourseMaterialPublicationWhereUniqueInput {
  return materialSourceFields(materialType, materialId);
}

function revisionItemMaterial(
  item: PublicCourseRecord["approvedRevision"] extends infer Revision
    ? Revision extends { items: Array<infer Item> }
      ? Item
      : never
    : never
): CourseMaterialRecord | null {
  if (item.materialType === "VIDEO_GUIDE") {
    return item.videoGuideLesson;
  }

  if (item.materialType === "ENGLISH_GUIDED_STUDY") {
    return item.englishGuidedStudyMaterial;
  }

  if (item.materialType === "PICTURE_BOOK") return item.pictureBook;

  return item.learningFlashcardDeck;
}

function materialLaunchHref(materialType: CourseMaterialType, record: CourseMaterialRecord) {
  if (materialType === "VIDEO_GUIDE") {
    return record.shareToken ? `/media-tutor/${record.shareToken}` : null;
  }

  if (materialType === "ENGLISH_GUIDED_STUDY") {
    return guidedStudyMaterialScene(record.content) === "GUSHIWEN"
      ? `/gushiwen/${record.id}`
      : `/text2lesson/${record.id}`;
  }

  if (materialType === "PICTURE_BOOK") return `/picture-books/${record.id}/play`;

  return `/learn/flashcards/${record.id}`;
}

function isCourseMaterialLearnable(
  materialType: CourseMaterialType,
  record: CourseMaterialRecord
) {
  if (materialType === "VIDEO_GUIDE") {
    return record.status === "SUCCEEDED";
  }

  if (materialType === "ENGLISH_GUIDED_STUDY") {
    return Boolean(record.audioUrl);
  }

  return record.status === (materialType === "PICTURE_BOOK" ? "COMPLETED" : "READY");
}
