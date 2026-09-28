"use client";

import {
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  UserCheck,
  X,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveCourseReviewAction,
  getAdminCourseReview,
  rejectCourseReviewAction,
  runCourseAiPrecheckAction
} from "@/lib/course-api";
import {
  courseReviewPreviewCourses,
  courseReviewTitle,
  type CourseReviewFilters
} from "@/lib/course-review-presentation";
import type {
  CourseAiPrecheckStatus,
  CourseReviewRequest,
  JsonValue
} from "@/lib/course-types";

type ModalKind = "preview" | "ai" | "human";
type HumanDecision = "approve" | "reject";
type RejectionCode = "CONTENT_POLICY" | "LOW_QUALITY" | "COPYRIGHT" | "OTHER";

const rejectionReasons: Record<RejectionCode, string> = {
  CONTENT_POLICY: "内容不符规范",
  LOW_QUALITY: "内容质量不高",
  COPYRIGHT: "存在版权争议",
  OTHER: "其他"
};

export function ResourceReviewLoadError() {
  return (
    <Card>
      <CardContent className="pt-5 md:pt-6">
        <p className="font-semibold">资源审核数据加载失败</p>
        <p className="mt-2 text-sm text-muted-foreground">请稍后重试，审核列表尚未更新。</p>
      </CardContent>
    </Card>
  );
}

export function ResourceReviewManager({
  reviews,
  filters
}: {
  reviews: CourseReviewRequest[];
  filters: CourseReviewFilters;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(reviews);
  const [modal, setModal] = useState<{ kind: ModalKind; reviewId: string } | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [humanRunning, setHumanRunning] = useState(false);
  const [decision, setDecision] = useState<HumanDecision>("approve");
  const [rejectionCode, setRejectionCode] = useState<RejectionCode>("CONTENT_POLICY");
  const [otherReason, setOtherReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);
  const activeReview = useMemo(
    () => rows.find((review) => review.id === modal?.reviewId) ?? null,
    [modal?.reviewId, rows]
  );

  useEffect(() => {
    setRows(reviews);
  }, [reviews]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [modal]);

  function replaceReview(review: CourseReviewRequest) {
    setRows((current) => current.map((item) => item.id === review.id ? review : item));
  }

  function openModal(kind: ModalKind, review: CourseReviewRequest) {
    setModal({ kind, reviewId: review.id });
    setError(null);
    setMessage(null);

    if (kind === "human") {
      setDecision("approve");
      setRejectionCode("CONTENT_POLICY");
      setOtherReason("");
    }

    if (
      kind === "ai"
      && review.status === "PENDING"
      && (review.aiPrecheckStatus === "NOT_STARTED" || review.aiPrecheckStatus === "RUNNING")
    ) {
      void runAiPrecheck(review);
    }
  }

  async function pollReview(reviewId: string) {
    try {
      const latest = await getAdminCourseReview(reviewId);
      replaceReview(latest);
      return latest;
    } catch {
      return null;
    }
  }

  async function runAiPrecheck(review: CourseReviewRequest) {
    if (aiRunning) return;
    setAiRunning(true);
    setError(null);
    setMessage(null);

    const poller = window.setInterval(() => {
      void pollReview(review.id);
    }, 1_200);

    try {
      let latest = review;

      if (review.aiPrecheckStatus !== "RUNNING") {
        const result = await runCourseAiPrecheckAction(review.id);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        replaceReview(result.data);
        latest = result.data;
        setMessage({ success: result.data.aiPrecheckStatus === "PASSED", text: result.message });
      }

      for (let attempt = 0; latest.aiPrecheckStatus === "RUNNING" && attempt < 150; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        latest = await pollReview(review.id) ?? latest;
      }

      if (latest.aiPrecheckStatus !== "RUNNING") {
        setMessage({
          success: latest.aiPrecheckStatus === "PASSED",
          text: latest.aiPrecheckStatus === "PASSED"
            ? "AI 预审已通过。"
            : latest.aiPrecheckStatus === "REJECTED"
              ? "AI 预审未通过，请查看理由。"
              : "AI 预审执行失败，请查看结果。"
        });
      }
    } finally {
      window.clearInterval(poller);
      await pollReview(review.id);
      setAiRunning(false);
      router.refresh();
    }
  }

  async function submitHumanReview(review: CourseReviewRequest) {
    if (humanRunning || review.status !== "PENDING") return;

    const reason = rejectionCode === "OTHER"
      ? `其他：${otherReason.trim()}`
      : rejectionReasons[rejectionCode];

    if (decision === "reject" && rejectionCode === "OTHER" && otherReason.trim().length < 2) {
      setError("请输入其他拒绝理由，至少 2 个字符。");
      return;
    }

    setHumanRunning(true);
    setError(null);

    try {
      const result = decision === "approve"
        ? await approveCourseReviewAction(review.id, review.updatedAt)
        : await rejectCourseReviewAction(review.id, reason, review.updatedAt);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      replaceReview(result.data);
      setMessage({ success: true, text: result.message });
      setModal(null);
      router.refresh();
    } finally {
      setHumanRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-5 md:pt-6">
          <form className="flex flex-wrap items-end gap-4" method="get">
            <label className="min-w-44 text-sm font-semibold">
              审核状态
              <Select className="mt-2 font-normal" defaultValue={filters.status} name="status">
                <option value="PENDING">待审核</option>
                <option value="APPROVED">已通过</option>
                <option value="REJECTED">已拒绝</option>
              </Select>
            </label>
            <label className="min-w-44 text-sm font-semibold">
              资源类型
              <Select className="mt-2 font-normal" defaultValue={filters.scope} name="scope">
                <option value="">全部资源</option>
                <option value="COURSE_REVISION">课程资源</option>
                <option value="MATERIAL_CHANGE">课件更新</option>
              </Select>
            </label>
            <Button type="submit" variant="outline">筛选</Button>
          </form>
        </CardContent>
      </Card>

      {message ? (
        <p aria-live="polite" className={message.success ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>
          {message.text}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">资源名称</TableHead>
                <TableHead className="min-w-44">创作人</TableHead>
                <TableHead className="min-w-40">提审时间</TableHead>
                <TableHead>预览</TableHead>
                <TableHead>AI 预审</TableHead>
                <TableHead>人工审核</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map((review) => {
                const previewCourses = courseReviewPreviewCourses(review);

                return (
                  <TableRow key={review.id}>
                    <TableCell>
                      <p className="max-w-80 truncate font-semibold">{courseReviewTitle(review)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{review.submittedByUser.nickname}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(review.submittedAt)}</TableCell>
                    <TableCell>
                      {previewCourses.length === 1 ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={previewCourses[0]!.href} rel="noreferrer" target="_blank">
                            <Eye />预览
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          disabled={previewCourses.length === 0}
                          onClick={() => openModal("preview", review)}
                          size="sm"
                          title={previewCourses.length === 0 ? "暂无可预览课程" : undefined}
                          type="button"
                          variant="outline"
                        >
                          <Eye />预览
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => openModal("ai", review)} size="sm" type="button" variant="outline">
                        {review.aiPrecheckStatus === "RUNNING" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                        {aiStatusLabel(review.aiPrecheckStatus)}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => openModal("human", review)} size="sm" type="button">
                        <UserCheck />{review.status === "PENDING" ? "审核" : "查看"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell className="py-12 text-center text-muted-foreground" colSpan={6}>
                    当前筛选条件下暂无资源审核记录。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {modal && activeReview ? (
        <ReviewModal
          onClose={() => {
            if (!humanRunning) setModal(null);
          }}
          title={modal.kind === "preview" ? "选择预览课程" : modal.kind === "ai" ? "AI 预审" : "人工审核"}
        >
          {modal.kind === "preview" ? <CoursePreviewLinks review={activeReview} /> : null}
          {modal.kind === "ai" ? (
            <AiPrecheckPanel
              error={error}
              isRunning={aiRunning || activeReview.aiPrecheckStatus === "RUNNING"}
              onRetry={() => void runAiPrecheck(activeReview)}
              review={activeReview}
            />
          ) : null}
          {modal.kind === "human" ? (
            <HumanReviewPanel
              decision={decision}
              error={error}
              isRunning={humanRunning}
              onDecisionChange={setDecision}
              onOtherReasonChange={(value) => {
                setOtherReason(value);
                setError(null);
              }}
              onReasonChange={(code) => {
                setRejectionCode(code);
                setError(null);
              }}
              onSubmit={() => void submitHumanReview(activeReview)}
              otherReason={otherReason}
              rejectionCode={rejectionCode}
              review={activeReview}
            />
          ) : null}
        </ReviewModal>
      ) : null}
    </div>
  );
}

function ReviewModal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button aria-label="关闭弹窗" className="size-9 px-0" onClick={onClose} type="button" variant="ghost">
            <X />
          </Button>
        </div>
        <div className="overflow-y-auto p-5 md:p-6">{children}</div>
      </div>
    </div>
  );
}

function CoursePreviewLinks({ review }: { review: CourseReviewRequest }) {
  const courses = courseReviewPreviewCourses(review);

  return (
    <div>
      <p className="text-sm leading-6 text-muted-foreground">
        该课件更新影响多门课程，请选择需要预览的课程。预览将打开与前台一致的课程页面。
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {courses.map((course) => (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4" key={course.id}>
            <span className="min-w-0 truncate text-sm font-medium">{course.name}</span>
            <Button asChild size="sm" variant="outline">
              <Link href={course.href} rel="noreferrer" target="_blank">
                <Eye />打开预览
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiPrecheckPanel({
  review,
  isRunning,
  error,
  onRetry
}: {
  review: CourseReviewRequest;
  isRunning: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const result = jsonRecord(review.aiPrecheckResult);
  const reasons = Array.isArray(result.reasons) ? result.reasons.map(jsonRecord).filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">AI 预审进度</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {review.aiPrecheckMessage ?? "正在等待预审"}
            </p>
          </div>
          <AiStatusBadge status={review.aiPrecheckStatus} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={review.aiPrecheckStatus === "FAILED" || review.aiPrecheckStatus === "REJECTED" ? "h-full bg-red-500 transition-all" : "h-full bg-primary transition-all"}
            style={{ width: `${Math.max(0, Math.min(100, review.aiPrecheckProgress))}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{review.aiPrecheckTrigger === "AUTOMATIC" ? "提交后自动预审" : "手动预审"}</span>
          <span>{review.aiPrecheckProgress}%</span>
        </div>
      </div>

      {result.summary ? (
        <div className="rounded-xl bg-secondary/55 p-4">
          <p className="text-sm font-semibold">预审结论</p>
          <p className="mt-2 text-sm leading-6">{String(result.summary)}</p>
        </div>
      ) : null}

      {reasons.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">不通过理由</h3>
          <div className="mt-3 flex flex-col gap-3">
            {reasons.map((reason, index) => (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm" key={`${stringValue(reason.location)}-${index}`}>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{stringValue(reason.category) ?? "内容合规"}</Badge>
                  <span className="font-semibold">{stringValue(reason.location) ?? "资源内容"}</span>
                </div>
                <p className="mt-2 leading-6">{stringValue(reason.reason) ?? "未提供具体理由"}</p>
                {stringValue(reason.evidence) ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">证据：{stringValue(reason.evidence)}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!isRunning && review.status === "PENDING" ? (
        <div>
          <Button onClick={onRetry} type="button" variant="outline">
            <RefreshCw />{review.aiPrecheckStatus === "NOT_STARTED" ? "开始 AI 预审" : "重新预审"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HumanReviewPanel({
  review,
  decision,
  rejectionCode,
  otherReason,
  error,
  isRunning,
  onDecisionChange,
  onReasonChange,
  onOtherReasonChange,
  onSubmit
}: {
  review: CourseReviewRequest;
  decision: HumanDecision;
  rejectionCode: RejectionCode;
  otherReason: string;
  error: string | null;
  isRunning: boolean;
  onDecisionChange: (decision: HumanDecision) => void;
  onReasonChange: (code: RejectionCode) => void;
  onOtherReasonChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (review.status !== "PENDING") {
    return (
      <div className="rounded-xl border border-border p-5">
        <div className="flex items-center gap-3">
          {review.status === "APPROVED" ? <CheckCircle2 className="text-emerald-600" /> : <XCircle className="text-red-600" />}
          <p className="font-semibold">{review.status === "APPROVED" ? "该资源已审核通过" : "该资源已审核拒绝"}</p>
        </div>
        {review.reviewNote ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{review.reviewNote}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl bg-secondary/55 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">AI 预审结果</span>
          <AiStatusBadge status={review.aiPrecheckStatus} />
        </div>
        <p className="mt-2 text-muted-foreground">AI 结果用于辅助判断，不限制管理员进行人工审核。</p>
      </div>

      <div>
        <p className="text-sm font-semibold">审核决定</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            className={decision === "approve" ? "rounded-xl border border-primary bg-primary/5 p-4 text-left" : "rounded-xl border border-border p-4 text-left hover:bg-secondary/50"}
            onClick={() => onDecisionChange("approve")}
            type="button"
          >
            <span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="text-emerald-600" />审核通过</span>
          </button>
          <button
            className={decision === "reject" ? "rounded-xl border border-red-400 bg-red-50 p-4 text-left" : "rounded-xl border border-border p-4 text-left hover:bg-secondary/50"}
            onClick={() => onDecisionChange("reject")}
            type="button"
          >
            <span className="flex items-center gap-2 font-semibold"><XCircle className="text-red-600" />审核拒绝</span>
          </button>
        </div>
      </div>

      {decision === "reject" ? (
        <fieldset>
          <legend className="text-sm font-semibold">拒绝理由</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(Object.entries(rejectionReasons) as Array<[RejectionCode, string]>).map(([code, label]) => (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm" key={code}>
                <input
                  checked={rejectionCode === code}
                  name="rejection-reason"
                  onChange={() => onReasonChange(code)}
                  type="radio"
                />
                {label}
              </label>
            ))}
          </div>
          {rejectionCode === "OTHER" ? (
            <Textarea
              className="mt-3"
              maxLength={500}
              onChange={(event) => onOtherReasonChange(event.target.value)}
              placeholder="请输入其他拒绝理由"
              value={otherReason}
            />
          ) : null}
        </fieldset>
      ) : null}

      {error ? <p aria-live="polite" className="text-sm text-red-600">{error}</p> : null}
      <div>
        <Button disabled={isRunning} onClick={onSubmit} type="button">
          {isRunning ? <LoaderCircle className="animate-spin" /> : decision === "approve" ? <CheckCircle2 /> : <XCircle />}
          {isRunning ? "提交中..." : decision === "approve" ? "确认通过" : "确认拒绝"}
        </Button>
      </div>
    </div>
  );
}

function AiStatusBadge({ status }: { status: CourseAiPrecheckStatus }) {
  const variant = status === "PASSED" ? "secondary" : status === "NOT_STARTED" || status === "RUNNING" ? "outline" : "muted";
  const icon = status === "PASSED"
    ? <CheckCircle2 />
    : status === "RUNNING"
      ? <LoaderCircle className="animate-spin" />
      : status === "NOT_STARTED"
        ? <Clock3 />
        : <XCircle />;

  return <Badge className="gap-1.5 [&_svg]:size-3.5" variant={variant}>{icon}{aiStatusLabel(status)}</Badge>;
}

function aiStatusLabel(status: CourseAiPrecheckStatus) {
  return {
    NOT_STARTED: "未预审",
    RUNNING: "预审中",
    PASSED: "通过",
    REJECTED: "不通过",
    FAILED: "执行失败"
  }[status];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(date);
}

function jsonRecord(value: JsonValue | unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
