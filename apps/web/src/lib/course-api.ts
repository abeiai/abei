"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { courseActionFailure } from "./course-review-presentation";
import type {
  ActionResult,
  CourseCatalogPage,
  CourseListPage,
  CourseEnrollmentResult,
  CourseDetail,
  CourseMaterialOption,
  CoursePageResult,
  CourseReviewRequest,
  CourseSummary,
  MediaAssetSummary,
  PublicCourse,
  PublicCourseListingItem,
  SaveCourseInput
} from "./course-types";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData;
}

type ApiFetchOptions = RequestInit & {
  allowEmpty?: boolean;
  includeCredentials?: boolean;
};

const genericApiErrorMessage = "请求失败，请稍后重试。";
const unsafeApiMessagePattern =
  /internal server error|prisma|sql|jwt|stack|trace|exception|\berror\b/iu;

class CourseApiError extends Error {
  readonly apiCode: number | null;
  readonly hasSafeApiMessage: boolean;
  readonly httpStatus: number | null;

  constructor({
    apiCode = null,
    apiMessage,
    httpStatus = null
  }: {
    apiCode?: number | null;
    apiMessage?: string;
    httpStatus?: number | null;
  } = {}) {
    const safeMessage = safeApiMessage(apiMessage);
    super(safeMessage ?? genericApiErrorMessage);
    this.name = "CourseApiError";
    this.apiCode = apiCode;
    this.hasSafeApiMessage = Boolean(safeMessage);
    this.httpStatus = httpStatus;
  }
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function getCookieHeader() {
  const cookieStore = await cookies();

  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join("; ");
}

function safeApiMessage(message: string | undefined) {
  const normalized = message?.trim() ?? "";

  if (
    !normalized
    || normalized.length > 200
    || !/[\u3400-\u9fff]/u.test(normalized)
    || unsafeApiMessagePattern.test(normalized)
    || /[\r\n]/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function parseApiResponse(value: string): ApiResponse<unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      !parsed
      || typeof parsed !== "object"
      || Array.isArray(parsed)
      || typeof (parsed as Record<string, unknown>).code !== "number"
      || typeof (parsed as Record<string, unknown>).message !== "string"
      || !("data" in parsed)
    ) {
      return null;
    }

    return parsed as ApiResponse<unknown>;
  } catch {
    return null;
  }
}

function apiFetch(path: string, init: ApiFetchOptions & { allowEmpty: true }): Promise<void>;
function apiFetch<TData>(
  path: string,
  init?: ApiFetchOptions & { allowEmpty?: false }
): Promise<TData>;
async function apiFetch<TData>(
  path: string,
  init: ApiFetchOptions = {}
): Promise<TData | void> {
  const { allowEmpty = false, includeCredentials = true, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  if (includeCredentials) {
    headers.set("Cookie", await getCookieHeader());
  }

  if (!(requestInit.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...requestInit,
      headers,
      cache: "no-store"
    });
  } catch {
    throw new CourseApiError();
  }

  let responseText: string;

  try {
    responseText = await response.text();
  } catch {
    throw new CourseApiError({ httpStatus: response.status });
  }

  const payload = responseText.trim() ? parseApiResponse(responseText) : null;

  if (!response.ok) {
    throw new CourseApiError({
      apiCode: payload?.code !== 0 ? payload?.code : null,
      apiMessage: payload?.code !== 0 ? payload?.message : undefined,
      httpStatus: response.status
    });
  }

  if (!payload) {
    if (allowEmpty && !responseText.trim()) {
      return undefined;
    }

    throw new CourseApiError();
  }

  if (payload.code !== 0) {
    throw new CourseApiError({
      apiCode: payload.code,
      apiMessage: payload.message,
      httpStatus: response.status
    });
  }

  if (payload.data === null) {
    if (allowEmpty) {
      return undefined;
    }

    throw new CourseApiError();
  }

  if (allowEmpty) {
    return undefined;
  }

  return payload.data as TData;
}

function actionError<TData>(
  error: unknown,
  fallback: string
): ActionResult<TData> {
  return courseActionFailure(
    error instanceof CourseApiError
      ? {
          code: error.apiCode,
          httpStatus: error.httpStatus,
          message: error.hasSafeApiMessage ? error.message : null
        }
      : null,
    fallback
  );
}

function revalidateCourseDetailPaths(courseId: string) {
  revalidatePath(`/dashboard/courses/${courseId}`);
  revalidatePath(`/c/${courseId}`);
}

function revalidateCoursePaths(courseId?: string) {
  revalidatePath("/dashboard/courses");
  revalidatePath("/center");

  if (courseId) {
    revalidateCourseDetailPaths(courseId);
  }
}

function revalidateReviewPaths(review: CourseReviewRequest) {
  revalidatePath("/admin/course-reviews");
  revalidatePath(`/admin/course-reviews/${review.id}`);
  revalidatePath("/dashboard/courses");
  revalidatePath("/center");

  const courseIds = new Set(review.affectedCourses.map((course) => course.id));

  if (review.courseId) {
    courseIds.add(review.courseId);
  }

  for (const courseId of courseIds) {
    revalidateCourseDetailPaths(courseId);
  }
}

export async function getUserCourses(): Promise<CourseSummary[]> {
  return apiFetch<CourseSummary[]>("/courses");
}

export async function getEnrolledCourses(
  page = 1,
  pageSize = 12
): Promise<CourseListPage> {
  return apiFetch<CourseListPage>(`/courses/enrolled?page=${page}&pageSize=${pageSize}`);
}

export async function getUserCourse(id: string): Promise<CourseDetail> {
  return apiFetch<CourseDetail>(`/courses/${encodeURIComponent(id)}`);
}

export async function getCourseMaterialOptions(): Promise<CourseMaterialOption[]> {
  return apiFetch<CourseMaterialOption[]>("/courses/material-options");
}

export async function getPublicCourses(): Promise<PublicCourse[]> {
  return apiFetch<PublicCourse[]>("/public/courses");
}

export async function getPublicCourseListing(): Promise<PublicCourseListingItem[]> {
  return apiFetch<PublicCourseListingItem[]>("/public/courses?view=listing");
}

export async function getCoursePage(id: string): Promise<CoursePageResult> {
  return apiFetch<CoursePageResult>(`/public/courses/${encodeURIComponent(id)}`);
}

export async function getCoursePageOrNull(id: string): Promise<CoursePageResult | null> {
  try {
    return await getCoursePage(id);
  } catch (error) {
    if (
      error instanceof CourseApiError
      && (error.apiCode === 40401 || error.httpStatus === 404)
    ) {
      return null;
    }

    throw error;
  }
}

export async function getAdminCourseReviews(
  filters: { status?: string; scope?: string } = {}
): Promise<CourseReviewRequest[]> {
  const searchParams = new URLSearchParams();

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.scope) {
    searchParams.set("scope", filters.scope);
  }

  const query = searchParams.toString();

  return apiFetch<CourseReviewRequest[]>(`/admin/course-reviews${query ? `?${query}` : ""}`);
}

export async function getAdminCourseReview(id: string): Promise<CourseReviewRequest> {
  return apiFetch<CourseReviewRequest>(`/admin/course-reviews/${encodeURIComponent(id)}`);
}

export async function createCourseAction(
  input: SaveCourseInput
): Promise<ActionResult<CourseDetail>> {
  try {
    const course = await apiFetch<CourseDetail>("/courses", {
      method: "POST",
      body: JSON.stringify(input)
    });
    revalidateCoursePaths(course.id);

    return { ok: true, data: course, message: "专辑已创建。" };
  } catch (error) {
    return actionError(error, "专辑创建失败，请稍后重试。");
  }
}

export async function addCoursesAction(
  courseIds: string[]
): Promise<ActionResult<CourseEnrollmentResult>> {
  try {
    const result = await apiFetch<CourseEnrollmentResult>("/courses/enrolled", {
      method: "POST",
      body: JSON.stringify({ courseIds })
    });
    revalidatePath("/dashboard/courses");

    return {
      ok: true,
      data: result,
      message: result.addedCount > 0 ? `已加入 ${result.addedCount} 个专辑。` : "所选专辑已在专辑库中。"
    };
  } catch (error) {
    return actionError(error, "专辑添加失败，请稍后重试。");
  }
}

export async function searchCourseCatalogAction(input: {
  keyword?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  includeTags?: boolean;
}): Promise<ActionResult<CourseCatalogPage>> {
  const searchParams = new URLSearchParams();
  const keyword = input.keyword?.trim();
  const tag = input.tag?.trim();

  if (keyword) searchParams.set("keyword", keyword);
  if (tag) searchParams.set("tag", tag);
  searchParams.set("page", String(input.page ?? 1));
  searchParams.set("pageSize", String(input.pageSize ?? 20));
  searchParams.set("includeTags", input.includeTags === false ? "false" : "true");

  try {
    const result = await apiFetch<CourseCatalogPage>(`/courses/catalog?${searchParams.toString()}`);

    return { ok: true, data: result, message: "专辑目录已加载。" };
  } catch (error) {
    return actionError(error, "专辑目录加载失败，请稍后重试。");
  }
}

export async function loadEnrolledCoursesAction(
  page: number,
  pageSize = 12
): Promise<ActionResult<CourseListPage>> {
  try {
    const result = await getEnrolledCourses(page, pageSize);
    return { ok: true, data: result, message: "已加载更多专辑。" };
  } catch (error) {
    return actionError(error, "已加入专辑加载失败，请稍后重试。");
  }
}

export async function saveCourseAction(
  id: string,
  input: SaveCourseInput
): Promise<ActionResult<CourseDetail>> {
  try {
    const course = await apiFetch<CourseDetail>(`/courses/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
    revalidateCoursePaths(course.id);

    return { ok: true, data: course, message: "专辑已保存。" };
  } catch (error) {
    return actionError(error, "专辑保存失败，请稍后重试。");
  }
}

export async function submitCourseAction(id: string): Promise<ActionResult<CourseDetail>> {
  try {
    await apiFetch(`/courses/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      allowEmpty: true
    });
    const course = await apiFetch<CourseDetail>(`/courses/${encodeURIComponent(id)}`);
    revalidateCoursePaths(course.id);
    revalidatePath("/admin/course-reviews");

    return { ok: true, data: course, message: "发布申请已提交，正在等待审核。" };
  } catch (error) {
    return actionError(error, "申请发布失败，请稍后重试。");
  }
}

export async function uploadCourseCoverAction(
  formData: FormData
): Promise<ActionResult<MediaAssetSummary>> {
  try {
    const asset = await apiFetch<MediaAssetSummary>("/courses/cover", {
      method: "POST",
      body: formData
    });
    revalidatePath("/dashboard/courses");

    return { ok: true, data: asset, message: "专辑封面已上传。" };
  } catch (error) {
    return actionError(error, "专辑封面上传失败，请稍后重试。");
  }
}

export async function approveCourseReviewAction(
  id: string,
  expectedUpdatedAt: string
): Promise<ActionResult<CourseReviewRequest>> {
  try {
    const review = await apiFetch<CourseReviewRequest>(
      `/admin/course-reviews/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt })
      }
    );
    revalidateReviewPaths(review);

    return { ok: true, data: review, message: "资源审核已通过。" };
  } catch (error) {
    return actionError(error, "资源审核操作失败，请稍后重试。");
  }
}

export async function rejectCourseReviewAction(
  id: string,
  reason: string,
  expectedUpdatedAt: string
): Promise<ActionResult<CourseReviewRequest>> {
  try {
    const review = await apiFetch<CourseReviewRequest>(
      `/admin/course-reviews/${encodeURIComponent(id)}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason, expectedUpdatedAt })
      }
    );
    revalidateReviewPaths(review);

    return { ok: true, data: review, message: "资源审核已拒绝。" };
  } catch (error) {
    return actionError(error, "资源审核操作失败，请稍后重试。");
  }
}

export async function runCourseAiPrecheckAction(
  id: string
): Promise<ActionResult<CourseReviewRequest>> {
  try {
    const review = await apiFetch<CourseReviewRequest>(
      `/admin/course-reviews/${encodeURIComponent(id)}/ai-precheck`,
      { method: "POST" }
    );
    revalidateReviewPaths(review);

    const message = review.aiPrecheckStatus === "RUNNING"
      ? "AI 预审已开始。"
      : review.aiPrecheckStatus === "PASSED"
        ? "AI 预审已通过。"
        : review.aiPrecheckStatus === "REJECTED"
          ? "AI 预审未通过，请查看理由。"
          : "AI 预审执行失败，请查看结果。";

    return { ok: true, data: review, message };
  } catch (error) {
    return actionError(error, "AI 预审操作失败，请稍后重试。");
  }
}
