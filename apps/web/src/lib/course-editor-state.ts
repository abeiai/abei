import type {
  CourseGuidedStudyScene,
  CourseMaterialType,
  CourseMaterialPublicationStatus,
  CourseReviewState,
  CourseRevisionStatus,
  PublicCourse
} from "./course-types";

export function courseMaterialDirectoryLabel(
  materialType: CourseMaterialType,
  guidedStudyScene?: CourseGuidedStudyScene
) {
  if (materialType === "VIDEO_GUIDE") {
    return "视频导学";
  }

  if (materialType === "ENGLISH_GUIDED_STUDY") {
    return guidedStudyScene === "GUSHIWEN" ? "学古诗文" : "英文带读";
  }

  return materialType === "PICTURE_BOOK" ? "绘本" : "学习闪卡";
}

export function courseGuidedStudyScene(content: unknown): CourseGuidedStudyScene {
  return content
    && typeof content === "object"
    && !Array.isArray(content)
    && "scene" in content
    && content.scene === "GUSHIWEN"
      ? "GUSHIWEN"
      : "ENGLISH";
}

export function moveCourseItem<T extends { id: string; sortOrder: number }>(
  items: T[],
  id: string,
  delta: -1 | 1
) {
  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder);
  const index = ordered.findIndex((item) => item.id === id);
  const target = index + delta;

  if (index < 0 || target < 0 || target >= ordered.length) {
    return ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
  }

  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];

  return ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
}

export function reorderCourseItem<T extends { id: string; sortOrder: number }>(
  items: T[],
  sourceId: string,
  targetId: string
) {
  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder);
  const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
  }

  const [movedItem] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, movedItem!);

  return ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
}

export function normalizeEditorTags(value: string) {
  return [...new Set(value.split(/[\s,，]+/u).map((tag) => tag.trim()).filter(Boolean))];
}

export function centerCropRect(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("图片宽高必须是大于 0 的有限数值");
  }

  const targetRatio = 16 / 9;
  const sourceRatio = width / height;
  const cropWidth = sourceRatio > targetRatio ? height * targetRatio : width;
  const cropHeight = sourceRatio > targetRatio ? height : width / targetRatio;

  return {
    height: cropHeight,
    width: cropWidth,
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2
  };
}

export function courseStatusLabel(
  status: CourseReviewState,
  hasPublishedRevision: boolean,
  workingRevisionStatus?: CourseRevisionStatus
) {
  if (hasPublishedRevision && workingRevisionStatus === "REJECTED") {
    return "复审未通过（旧版仍发布）";
  }

  if (hasPublishedRevision && workingRevisionStatus === "DRAFT") {
    return "有未提交修改";
  }

  if (status === "PENDING_REVIEW") {
    return "审核中";
  }

  if (status === "REJECTED") {
    return "审核未通过";
  }

  if (status === "PUBLISHED" || hasPublishedRevision) {
    return "已发布";
  }

  return "草稿";
}

export function materialReviewFeedback(publication: {
  reviewRequests?: Array<{ reviewNote: string | null }>;
  status: CourseMaterialPublicationStatus;
}) {
  if (publication.status !== "REJECTED") {
    return null;
  }

  const reason = publication.reviewRequests?.[0]?.reviewNote?.trim();

  return reason
    ? { label: "课件审核未通过", reason }
    : null;
}

export function publicCourseItemPresentation(
  course: PublicCourse,
  item: PublicCourse["items"][number]
) {
  const locked = item.reviewState !== "READY";

  return {
    href: locked || !item.launchHref
      ? null
      : learningLaunchHref(item.launchHref, course.id, item.id),
    statusLabel: item.reviewState === "PENDING"
      ? "课件审核中"
      : item.reviewState === "REJECTED"
        ? "审核未通过"
        : "可学习"
  };
}

export function learningLaunchHref(
  href: string,
  courseId: string,
  courseRevisionItemId: string
) {
  const [pathAndQuery, hash] = href.split("#", 2);
  const separator = pathAndQuery!.indexOf("?");
  const path = separator < 0 ? pathAndQuery! : pathAndQuery!.slice(0, separator);
  const query = new URLSearchParams(separator < 0 ? "" : pathAndQuery!.slice(separator + 1));
  query.set("courseId", courseId);
  query.set("courseRevisionItemId", courseRevisionItemId);
  return `${path}?${query.toString()}${hash ? `#${hash}` : ""}`;
}
