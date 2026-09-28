import type { PublicCourse, PublicCourseListingItem } from "./course-types";

type SearchableCourse = PublicCourse | PublicCourseListingItem;

export function filterCourseCatalog(
  courses: SearchableCourse[],
  {
    keyword,
    tag,
    excludedIds
  }: {
    keyword: string;
    tag: string;
    excludedIds: ReadonlySet<string>;
  }
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");

  return courses.filter((course) => {
    if (excludedIds.has(course.id) || (tag && !course.tags.includes(tag))) {
      return false;
    }

    if (!normalizedKeyword) {
      return true;
    }

    return [
      course.name,
      course.summary,
      course.author.nickname,
      ...course.tags,
      ...("itemNames" in course
        ? course.itemNames
        : course.items.map((item) => item.displayName))
    ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalizedKeyword));
  });
}

export function preparePublicCourseListing(
  courses: SearchableCourse[],
  {
    keyword,
    sort,
    topic
  }: {
    keyword: string;
    sort: "latest" | "popular";
    topic: string;
  }
) {
  return [...filterCourseCatalog(courses, {
    excludedIds: new Set(),
    keyword,
    tag: topic
  })]
    .sort((left, right) => {
      if (sort === "popular") {
        const learningDifference = (right.learningCount ?? 0) - (left.learningCount ?? 0);

        if (learningDifference !== 0) {
          return learningDifference;
        }
      }

      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    })
    .slice(0, 20);
}

export function collectPopularCourseTopics(courses: SearchableCourse[], limit = 5) {
  const counts = new Map<string, { count: number; order: number }>();

  for (const course of courses) {
    for (const topic of course.tags) {
      const normalizedTopic = topic.trim();

      if (!normalizedTopic) {
        continue;
      }

      const current = counts.get(normalizedTopic);
      counts.set(normalizedTopic, {
        count: (current?.count ?? 0) + 1,
        order: current?.order ?? counts.size
      });
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].order - right[1].order)
    .slice(0, limit)
    .map(([topic]) => topic);
}

export function toggleCourseSelection(selectedIds: string[], courseId: string, max = 50) {
  if (selectedIds.includes(courseId)) {
    return selectedIds.filter((id) => id !== courseId);
  }

  return selectedIds.length >= max ? selectedIds : [...selectedIds, courseId];
}
