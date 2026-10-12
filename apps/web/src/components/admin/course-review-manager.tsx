"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveCourseReviewAction,
  rejectCourseReviewAction
} from "@/lib/course-api";
import {
  courseMaterialTypeLabel,
  courseMaterialFieldLabel,
  courseReviewAffectedCourseCount,
  courseReviewActionOutcome,
  courseReviewTitle,
  claimCourseReviewSubmission,
  courseRevisionItemPresentationFields,
  flashcardChangedFields,
  flashcardDiffTitle,
  flashcardPresentationFields,
  firstPublicationMaterialPresentations,
  groupCourseReviewDiff,
  localizeCourseReviewValue,
  releaseCourseReviewSubmission,
  validateCourseReviewRejectionReason,
  type CourseReviewFilters
} from "@/lib/course-review-presentation";
import type {
  CourseDiffEntry,
  CourseMaterialType,
  CourseReviewRequest,
  JsonValue
} from "@/lib/course-types";

type ConfirmationMode = "approve" | "reject";

export function CourseReviewLoadError() {
  return (
    <Card>
      <CardContent className="pt-5 md:pt-6">
        <p className="font-semibold">审核数据加载失败</p>
        <p className="mt-2 text-sm text-muted-foreground">请稍后重试，审核队列尚未更新。</p>
      </CardContent>
    </Card>
  );
}

export function CourseReviewManager({
  reviews,
  pendingReviews,
  filters
}: {
  reviews: CourseReviewRequest[];
  pendingReviews: CourseReviewRequest[];
  filters: CourseReviewFilters;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationMode | null>(null);
  const [reason, setReason] = useState("");
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const submissionLock = useRef(false);
  const selectedReview = useMemo(
    () => reviews.find((review) => review.id === selectedId) ?? null,
    [reviews, selectedId]
  );

  function selectReview(id: string) {
    if (isPending) {
      return;
    }

    setSelectedId(id);
    setConfirmation(null);
    setReason("");
    setConfirmationError(null);
    setMessage(null);
  }

  function beginAction(mode: ConfirmationMode) {
    if (!selectedReview || selectedReview.status !== "PENDING" || isPending) {
      return;
    }

    setConfirmation(mode);
    setReason("");
    setConfirmationError(null);
    setMessage(null);
  }

  function confirmAction() {
    if (!selectedReview || !confirmation || isPending) {
      return;
    }

    const reviewId = selectedReview.id;
    const mode = confirmation;

    if (mode === "reject") {
      const validationError = validateCourseReviewRejectionReason(reason);

      if (validationError) {
        setConfirmationError(validationError);
        return;
      }
    }

    if (!claimCourseReviewSubmission(submissionLock)) {
      return;
    }

    setConfirmationError(null);
    startTransition(async () => {
      try {
        const result = mode === "approve"
          ? await approveCourseReviewAction(reviewId, selectedReview.updatedAt)
          : await rejectCourseReviewAction(reviewId, reason.trim(), selectedReview.updatedAt);
        const outcome = courseReviewActionOutcome(result);

        setMessage({ text: outcome.message, success: outcome.success });

        if (outcome.clearSelection) {
          setSelectedId(null);
          setConfirmation(null);
          setReason("");
        } else {
          setConfirmationError(outcome.message);
        }

        if (outcome.refresh) {
          router.refresh();
        }
      } catch {
        const safeMessage = "课程审核操作失败，请稍后重试。";
        setMessage({ text: safeMessage, success: false });
        setConfirmationError(safeMessage);
      } finally {
        releaseCourseReviewSubmission(submissionLock);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <CourseReviewMetrics reviews={pendingReviews} />

      <Card>
        <CardContent className="pt-5 md:pt-6">
          <form className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" method="get">
            <label className="text-sm font-semibold">
              审核状态
              <Select className="mt-2 font-normal" defaultValue={filters.status} name="status">
                <option value="PENDING">待审核</option>
                <option value="APPROVED">已通过</option>
                <option value="REJECTED">已拒绝</option>
              </Select>
            </label>
            <label className="text-sm font-semibold">
              变更范围
              <Select className="mt-2 font-normal" defaultValue={filters.scope} name="scope">
                <option value="">全部类型</option>
                <option value="COURSE_REVISION">课程变更</option>
                <option value="MATERIAL_CHANGE">课件变更</option>
              </Select>
            </label>
            <Button className="self-end" type="submit" variant="outline">筛选</Button>
          </form>
        </CardContent>
      </Card>

      {message ? (
        <p
          aria-live="polite"
          className={message.success ? "text-sm text-emerald-700" : "text-sm text-red-600"}
        >
          {message.text}
        </p>
      ) : null}

      <CourseReviewWorkspace
        confirmation={confirmation}
        error={confirmationError}
        isPending={isPending}
        onBeginAction={beginAction}
        onCancelAction={() => {
          if (!isPending) {
            setConfirmation(null);
            setReason("");
            setConfirmationError(null);
          }
        }}
        onConfirmAction={confirmAction}
        onReasonChange={(value) => {
          setReason(value);
          setConfirmationError(null);
        }}
        onSelect={selectReview}
        reason={reason}
        reviews={reviews}
        selectedReview={selectedReview}
      />
    </div>
  );
}

export function CourseReviewMetrics({ reviews }: { reviews: CourseReviewRequest[] }) {
  const metrics = [
    { label: "待审核数量", value: reviews.length },
    {
      label: "课程变更数量",
      value: reviews.filter((review) => review.scope === "COURSE_REVISION").length
    },
    {
      label: "课件变更数量",
      value: reviews.filter((review) => review.scope === "MATERIAL_CHANGE").length
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {metrics.map((metric) => (
        <Card data-review-metric={metric.label} key={metric.label}>
          <CardContent className="pt-5 md:pt-6">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CourseReviewWorkspace({
  reviews,
  selectedReview,
  confirmation,
  reason,
  error,
  isPending,
  onSelect,
  onBeginAction,
  onCancelAction,
  onConfirmAction,
  onReasonChange
}: {
  reviews: CourseReviewRequest[];
  selectedReview: CourseReviewRequest | null;
  confirmation: ConfirmationMode | null;
  reason: string;
  error: string | null;
  isPending: boolean;
  onSelect: (id: string) => void;
  onBeginAction: (mode: ConfirmationMode) => void;
  onCancelAction: () => void;
  onConfirmAction: () => void;
  onReasonChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="min-w-0 self-start">
        <CardHeader>
          <CardTitle className="text-base">审核队列</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
            <div className="flex max-h-[760px] flex-col gap-2 overflow-y-auto pr-1">
              {reviews.map((review) => {
                const selected = review.id === selectedReview?.id;

                return (
                  <button
                    aria-pressed={selected}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selected
                        ? "border-primary bg-secondary"
                        : "border-border bg-card hover:border-primary/30 hover:bg-secondary/40"
                    }`}
                    disabled={isPending}
                    key={review.id}
                    onClick={() => onSelect(review.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant={review.scope === "COURSE_REVISION" ? "secondary" : "outline"}>
                        {review.scope === "COURSE_REVISION" ? "课程变更" : "课件变更"}
                      </Badge>
                      <Badge variant={reviewStatusVariant(review.status)}>
                        {reviewStatusLabel(review.status)}
                      </Badge>
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold">{courseReviewTitle(review)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {review.submittedByUser.nickname} · {formatDateTime(review.submittedAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      影响 {courseReviewAffectedCourseCount(review)} 门课程
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              当前筛选条件下暂无审核记录。
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0">
        {selectedReview ? (
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedReview.scope === "COURSE_REVISION" ? "secondary" : "outline"}>
                      {selectedReview.scope === "COURSE_REVISION" ? "课程变更" : "课件变更"}
                    </Badge>
                    {selectedReview.materialPublication ? (
                      <Badge variant="muted">
                        {courseMaterialTypeLabel(selectedReview.materialPublication.materialType)}
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="mt-3 break-words">{courseReviewTitle(selectedReview)}</CardTitle>
                </div>
                <Badge variant={reviewStatusVariant(selectedReview.status)}>
                  {reviewStatusLabel(selectedReview.status)}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <InfoValue
                  label="提交用户"
                  value={`${selectedReview.submittedByUser.nickname}（${selectedReview.submittedByUser.email}）`}
                />
                <InfoValue label="提交时间" value={formatDateTime(selectedReview.submittedAt)} />
                <InfoValue label="影响课程" value={affectedCourseLabel(selectedReview)} />
                <InfoValue
                  label="审核时间"
                  value={selectedReview.reviewedAt ? formatDateTime(selectedReview.reviewedAt) : "尚未审核"}
                />
                {selectedReview.reviewedByAdmin ? (
                  <InfoValue
                    label="审核管理员"
                    value={`${selectedReview.reviewedByAdmin.name}（${selectedReview.reviewedByAdmin.email}）`}
                  />
                ) : null}
                {selectedReview.reviewNote ? (
                  <InfoValue label="审核说明" value={selectedReview.reviewNote} />
                ) : null}
              </CardContent>
            </Card>

            <CourseReviewDiffDetails review={selectedReview} />
            <FrozenAlbumPreview review={selectedReview} />
            {selectedReview.course?.publishedAt && selectedReview.course.approvedRevisionId ? <UnpublishAlbum courseId={selectedReview.course.id} revisionId={selectedReview.course.approvedRevisionId} /> : null}

            {selectedReview.status === "PENDING" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">审核操作</CardTitle>
                </CardHeader>
                <CardContent>
                  {confirmation ? (
                    <CourseReviewConfirmation
                      error={error}
                      isPending={isPending}
                      mode={confirmation}
                      onCancel={onCancelAction}
                      onConfirm={onConfirmAction}
                      onReasonChange={onReasonChange}
                      reason={reason}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <Button disabled={isPending} onClick={() => onBeginAction("approve")} type="button">
                        审核通过
                      </Button>
                      <Button disabled={isPending} onClick={() => onBeginAction("reject")} type="button" variant="outline">
                        审核拒绝
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : (
          <Card>
            <CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
              从左侧审核队列中选择一条记录，查看本次具体变更并处理审核。
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CourseReviewDiffDetails({ review }: { review: CourseReviewRequest }) {
  const groups = groupCourseReviewDiff(review.diff);
  const materialType = review.materialPublication?.materialType;
  const firstPublicationMaterials = firstPublicationMaterialPresentations(review);

  if (groups.length === 0 && firstPublicationMaterials.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        本次提交未生成可展示的变更项。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {firstPublicationMaterials.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">首次公开课件内容</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {firstPublicationMaterials.map((material, index) => (
              <div className="rounded-lg border border-border p-4" key={`${material.materialType}-${index}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">{courseMaterialTypeLabel(material.materialType)}</Badge>
                  <p className="text-sm font-semibold">{material.displayName}</p>
                </div>
                <div className="mt-3">
                  <StructuredFields fields={material.fields} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {group.entries.map((entry, index) => (
              <DiffEntry
                entry={entry}
                key={`${entry.kind}-${entry.label}-${index}`}
                materialType={materialType}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CourseReviewConfirmation({
  mode,
  reason,
  error,
  isPending,
  onCancel,
  onConfirm,
  onReasonChange
}: {
  mode: "approve" | "reject";
  reason: string;
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReasonChange: (value: string) => void;
}) {
  const approving = mode === "approve";

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <p className="text-sm font-semibold">
        {approving ? "确认通过本次审核" : "确认拒绝本次审核"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {approving ? "请再次确认，审核通过后将更新公开内容。" : "请填写拒绝原因，提交者将在课程状态中看到该说明。"}
      </p>
      {!approving ? (
        <label className="mt-4 block text-sm font-semibold">
          拒绝原因
          <Textarea
            className="mt-2 bg-card font-normal"
            disabled={isPending}
            maxLength={500}
            minLength={2}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="请输入 2–500 个字符"
            value={reason}
          />
        </label>
      ) : null}
      {error ? <p aria-live="polite" className="mt-3 text-sm text-red-600">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={isPending} onClick={onConfirm} type="button">
          {isPending ? "提交中..." : approving ? "确认通过" : "确认拒绝"}
        </Button>
        <Button disabled={isPending} onClick={onCancel} type="button" variant="outline">
          取消
        </Button>
      </div>
    </div>
  );
}

function DiffEntry({
  entry,
  materialType
}: {
  entry: CourseDiffEntry;
  materialType: CourseMaterialType | undefined;
}) {
  if (entry.kind === "COVER") {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold">{entry.label}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CoverValue label="修改前" value={entry.before} />
          <CoverValue label="修改后" value={entry.after} />
        </div>
      </div>
    );
  }

  if (entry.kind === "TAG_ADDED" || entry.kind === "TAG_REMOVED") {
    const added = entry.kind === "TAG_ADDED";
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <Badge variant={added ? "secondary" : "muted"}>{added ? "新增" : "删除"}</Badge>
        <span className="text-sm font-medium">{displayScalar(added ? entry.after : entry.before)}</span>
      </div>
    );
  }

  if (entry.kind === "ITEM_REORDERED") {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold">{entry.label}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>旧位置：第 {displayPosition(entry.before)} 位</span>
          <span>新位置：第 {displayPosition(entry.after)} 位</span>
        </div>
      </div>
    );
  }

  if (entry.kind === "MATERIAL_FIELD") {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold">
          {courseMaterialFieldLabel(materialType, entry.label)}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <BeforeAfterValue label="修改前" value={localizeCourseReviewValue(entry.before)} />
          <BeforeAfterValue label="修改后" value={localizeCourseReviewValue(entry.after)} />
        </div>
      </div>
    );
  }

  if (entry.kind === "CARD_CHANGED") {
    const fields = flashcardChangedFields(entry.before, entry.after);

    return (
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-semibold">
          {flashcardDiffTitle(entry.kind, entry.before, entry.after)}
        </p>
        {fields.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {fields.map((field) => (
              <div className="rounded-lg bg-secondary/45 p-3" key={field.key}>
                <p className="mb-2 text-sm font-semibold">{field.label}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BeforeAfterValue
                    label="修改前"
                    value={structuredFieldValue(field.key, field.before)}
                  />
                  <BeforeAfterValue
                    label="修改后"
                    value={structuredFieldValue(field.key, field.after)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">没有可展示的闪卡字段变化。</p>
        )}
      </div>
    );
  }

  if (
    entry.kind === "ITEM_ADDED"
    || entry.kind === "ITEM_REMOVED"
    || entry.kind === "CARD_ADDED"
    || entry.kind === "CARD_REMOVED"
  ) {
    const added = entry.kind === "ITEM_ADDED" || entry.kind === "CARD_ADDED";
    const value = added ? entry.after : entry.before;
    const isFlashcard = entry.kind === "CARD_ADDED" || entry.kind === "CARD_REMOVED";
    const fields = isFlashcard
      ? flashcardPresentationFields(value)
      : courseRevisionItemPresentationFields(value);
    let title = entry.label;

    if (entry.kind === "CARD_ADDED" || entry.kind === "CARD_REMOVED") {
      title = flashcardDiffTitle(entry.kind, entry.before, entry.after);
    }

    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={added ? "secondary" : "muted"}>{added ? "新增" : "删除"}</Badge>
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <div className="mt-3">
          <StructuredFields fields={fields} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-3 text-sm font-semibold">{entry.label}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <BeforeAfterValue label="修改前" value={entry.before} />
        <BeforeAfterValue label="修改后" value={entry.after} />
      </div>
    </div>
  );
}

function CoverValue({ label, value }: { label: string; value: JsonValue }) {
  const source = typeof value === "string" && value.trim() ? value : null;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary">
        {source ? (
          <img alt={`${label}课程封面`} className="size-full object-cover" src={source} />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">无封面</div>
        )}
      </div>
    </div>
  );
}

function BeforeAfterValue({ label, value }: { label: string; value: JsonValue }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <JsonValueDisplay value={value} />
    </div>
  );
}

function JsonValueDisplay({ value }: { value: JsonValue }) {
  if (value === null || typeof value !== "object") {
    return <p className="break-words text-sm leading-6">{displayScalar(value)}</p>;
  }

  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function StructuredFields({
  fields
}: {
  fields: Array<{ key: string; label: string; value: JsonValue }>;
}) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">没有可展示的业务字段。</p>;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div className="min-w-0 rounded-lg bg-secondary/45 p-3" key={field.key}>
          <dt className="text-xs font-medium text-muted-foreground">{field.label}</dt>
          <dd className="mt-1">
            <JsonValueDisplay value={structuredFieldValue(field.key, field.value)} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function structuredFieldValue(key: string, value: JsonValue): JsonValue {
  if (key === "sortOrder" && typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `第 ${value + 1} 位`;
  }

  return localizeCourseReviewValue(value);
}

function displayScalar(value: JsonValue) {
  if (value === null || value === "") {
    return "无";
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  return String(value);
}

function displayPosition(value: JsonValue) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value + 1
    : displayScalar(value);
}

function InfoValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/50 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words leading-6">{value}</p>
    </div>
  );
}

function affectedCourseLabel(review: CourseReviewRequest) {
  const names = review.affectedCourses.map((course) => course.name);

  if (review.scope === "COURSE_REVISION") {
    const currentName = review.courseRevision?.name ?? review.course?.approvedRevision?.name;

    if (currentName) {
      names.unshift(currentName);
    }
  }

  return [...new Set(names)].join("、") || "暂无关联课程";
}

function reviewStatusLabel(status: CourseReviewRequest["status"]) {
  const labels: Record<CourseReviewRequest["status"], string> = {
    PENDING: "待审核",
    APPROVED: "已通过",
    REJECTED: "已拒绝"
  };

  return labels[status];
}

function reviewStatusVariant(status: CourseReviewRequest["status"]) {
  if (status === "APPROVED") {
    return "secondary" as const;
  }

  if (status === "REJECTED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);
}

function UnpublishAlbum({ courseId, revisionId }: { courseId: string; revisionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unpublish() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/course-reviews/courses/${courseId}/unpublish`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevisionId: revisionId }) });
      const result = await response.json();
      if (!response.ok || result.code !== 0) throw new Error(result.message || "下架失败");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "下架失败"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={() => void unpublish()}>下架已发布专辑</Button>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>;
}

function FrozenAlbumPreview({ review }: { review: CourseReviewRequest }) {
  const items = review.courseRevision?.items.filter(item => item.materialType === "PICTURE_BOOK" && (item as typeof item & { pinnedSnapshot?: unknown }).pinnedSnapshot) ?? [];
  if (!items.length) return null;
  return <Card><CardHeader><CardTitle className="text-base">绘本内容预览</CardTitle></CardHeader><CardContent className="space-y-4">
    <img className="max-h-64 rounded-lg object-contain" src={`/api/creator-media/revisions/${review.courseRevision!.id}/cover`} alt="专辑封面" />
    {items.map(item => {
      const snapshot = (item as typeof item & { pinnedSnapshot?: { pages?: Array<{ position: number; caption: string; audioUrl?: string }> } }).pinnedSnapshot;
      return <details key={item.id} className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">{item.displayName}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{snapshot?.pages?.map(page => <div key={page.position}><img className="w-full rounded-lg object-contain" src={`/api/creator-media/items/${item.id}/pages/${page.position}/image`} alt={page.position === 0 ? "绘本封面" : `第 ${page.position} 页`} /><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{page.caption}</p>{page.audioUrl ? <audio controls preload="none" className="mt-2 w-full" src={`/api/creator-media/items/${item.id}/pages/${page.position}/audio`} /> : null}</div>)}</div></details>;
    })}
  </CardContent></Card>;
}
