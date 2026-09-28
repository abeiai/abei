import { defaultOpenGraph } from "./share-metadata";
import type { Metadata } from "next";

import type { PublicCourse } from "./course-types";

export function buildPublicCourseMetadata(
  course: PublicCourse,
  ...siteUrlCandidates: Array<string | undefined>
): Metadata {
  const siteUrl = siteUrlCandidates
    .map((candidate) => externalHttpUrl(candidate))
    .find((candidate): candidate is string => Boolean(candidate));
  const canonical = siteUrl ? new URL(`/c/${course.id}`, siteUrl).toString() : undefined;
  const rootRelativeCoverUrl = safeRootRelativePath(course.coverUrl);
  const coverUrl = course.coverUrl
    ? externalHttpUrl(course.coverUrl)
      ?? (siteUrl && rootRelativeCoverUrl
        ? new URL(rootRelativeCoverUrl, siteUrl).toString()
        : undefined)
    : undefined;

  return {
    title: course.name,
    description: course.summary,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      ...defaultOpenGraph,
      title: course.name,
      description: course.summary,
      url: canonical,
      images: coverUrl ? [coverUrl] : defaultOpenGraph.images
    }
  };
}

export function buildReviewingCourseMetadata(
  courseId: string,
  ...siteUrlCandidates: Array<string | undefined>
): Metadata {
  const siteUrl = siteUrlCandidates
    .map((candidate) => externalHttpUrl(candidate))
    .find((candidate): candidate is string => Boolean(candidate));
  const canonical = siteUrl ? new URL(`/c/${courseId}`, siteUrl).toString() : undefined;
  const title = "资源审核中";
  const description = "该资源正在审核，审核完成后即可访问。";

  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      ...defaultOpenGraph,
      title,
      description,
      url: canonical
    }
  };
}

function safeRootRelativePath(value: string) {
  if (
    !value.startsWith("/")
    || value.startsWith("//")
    || /[\\\p{Cc}]/u.test(value)
  ) {
    return undefined;
  }

  return value;
}

function externalHttpUrl(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || hostname === "localhost"
      || hostname === "::1"
      || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
    ) {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}
