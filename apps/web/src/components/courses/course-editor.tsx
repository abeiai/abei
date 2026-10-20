"use client";

import { CreatorWorkMetadata } from "@/components/creator/work-metadata";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  GripVertical,
  Loader2,
  Save,
  Send,
  Trash2
} from "lucide-react";

import { CourseCoverUploader } from "@/components/courses/course-cover-uploader";
import {
  CourseMaterialPicker,
  courseMaterialKey,
  courseMaterialLimit
} from "@/components/courses/course-material-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createCourseAction,
  saveCourseAction,
  submitCourseAction
} from "@/lib/course-api";
import {
  courseGuidedStudyScene,
  courseMaterialDirectoryLabel,
  materialReviewFeedback,
  moveCourseItem,
  normalizeEditorTags,
  reorderCourseItem
} from "@/lib/course-editor-state";
import type {
  CourseDetail,
  CourseGuidedStudyScene,
  CourseMaterialOption,
  CourseMaterialType,
  CourseRevision,
  CourseRevisionItem,
  SaveCourseInput
} from "@/lib/course-types";
import { cn } from "@/lib/utils";

interface EditorCourseItem {
  id: string;
  materialId: string;
  materialType: CourseMaterialType;
  displayName: string;
  guidedStudyScene?: CourseGuidedStudyScene;
  reviewFeedback?: {
    label: string;
    reason: string;
  } | null;
  sortOrder: number;
}

type Feedback = {
  message: string;
  status: "error" | "success";
} | null;

function materialIdForItem(item: CourseRevisionItem) {
  if (item.materialType === "VIDEO_GUIDE") {
    return item.videoGuideLessonId;
  }

  if (item.materialType === "ENGLISH_GUIDED_STUDY") {
    return item.englishGuidedStudyMaterialId;
  }

  return item.materialType === "PICTURE_BOOK" ? item.pictureBookId : item.learningFlashcardDeckId;
}

function revisionItems(revision: CourseRevision | null): EditorCourseItem[] {
  if (!revision) {
    return [];
  }

  return revision.items
    .flatMap((item) => {
      const materialId = materialIdForItem(item);

      return materialId
        ? [{
            id: courseMaterialKey(item.materialType, materialId),
            materialId,
            materialType: item.materialType,
            displayName: item.displayName,
            ...(item.materialType === "ENGLISH_GUIDED_STUDY"
              ? { guidedStudyScene: courseGuidedStudyScene(item.englishGuidedStudyMaterial?.content) }
              : {}),
            reviewFeedback: materialReviewFeedback(item.publication),
            sortOrder: item.sortOrder
          }]
        : [];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, sortOrder) => ({ ...item, sortOrder }));
}

function validatedCourseInput({
  coverMediaId,
  items,
  name,
  summary,
  tagText
}: {
  coverMediaId: string;
  items: EditorCourseItem[];
  name: string;
  summary: string;
  tagText: string;
}): { ok: true; input: SaveCourseInput } | { ok: false; message: string } {
  const normalizedName = name.trim();
  const normalizedSummary = summary.trim();
  const tags = normalizeEditorTags(tagText);
  const orderedItems = [...items].sort((left, right) => left.sortOrder - right.sortOrder);

  if (normalizedName.length < 2) {
    return { ok: false, message: "专辑名称至少需要 2 个字符。" };
  }

  if (normalizedName.length > 80) {
    return { ok: false, message: "专辑名称不能超过 80 个字符。" };
  }

  if (!coverMediaId) {
    return { ok: false, message: "请先上传专辑封面。" };
  }

  if (!normalizedSummary) {
    return { ok: false, message: "请填写专辑简介。" };
  }

  if (normalizedSummary.length > 2000) {
    return { ok: false, message: "专辑简介不能超过 2000 个字符。" };
  }

  if (tags.length > 8 || tags.some((tag) => tag.length > 16)) {
    return { ok: false, message: "最多填写 8 个标签，每个标签不超过 16 个字符。" };
  }

  if (orderedItems.length === 0) {
    return { ok: false, message: "请至少添加一个课件。" };
  }

  if (orderedItems.some((item) => !item.displayName.trim())) {
    return { ok: false, message: "课件名称不能为空。" };
  }

  if (orderedItems.some((item) => item.displayName.trim().length > 120)) {
    return { ok: false, message: "课件名称不能超过 120 个字符。" };
  }

  return {
    ok: true,
    input: {
      name: normalizedName,
      coverMediaId,
      summary: normalizedSummary,
      tags,
      items: orderedItems.map(({ materialId, materialType, displayName }) => ({
        materialId,
        materialType,
        displayName: displayName.trim()
      }))
    }
  };
}

export function CourseEditor({
  course = null,
  materialOptions
}: {
  course?: CourseDetail | null;
  materialOptions: CourseMaterialOption[];
}) {
  const router = useRouter();
  const actionLockRef = useRef(false);
  const coverUploadLockRef = useRef(false);
  const initialRevision = course?.workingRevision ?? course?.approvedRevision ?? null;
  const [persistedCourseId, setPersistedCourseId] = useState(course?.id ?? "");
  const [name, setName] = useState(initialRevision?.name ?? "");
  const [coverMediaId, setCoverMediaId] = useState(initialRevision?.coverMedia.id ?? "");
  const [coverUrl, setCoverUrl] = useState(initialRevision?.coverMedia.url ?? "");
  const [summary, setSummary] = useState(initialRevision?.summary ?? "");
  const [tagText, setTagText] = useState(initialRevision?.tags.join("，") ?? "");
  const [items, setItems] = useState<EditorCourseItem[]>(() => revisionItems(initialRevision));
  const [isReadOnly, setIsReadOnly] = useState(course?.reviewState === "PENDING_REVIEW");
  const [rejectionReason, setRejectionReason] = useState(
    course?.workingRevision?.status === "REJECTED"
      ? course.workingRevision.rejectionReason ?? ""
      : ""
  );
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const selectedMaterialKeys = useMemo(
    () => new Set(items.map((item) => courseMaterialKey(item.materialType, item.materialId))),
    [items]
  );
  const businessDisabled = isReadOnly || pendingAction !== null;
  const controlsDisabled = businessDisabled || isCoverUploading;

  function addMaterials(options: CourseMaterialOption[]) {
    setItems((current) => {
      const existingKeys = new Set(current.map((item) => item.id));
      const additions = options
        .filter((option) => !existingKeys.has(courseMaterialKey(option.materialType, option.materialId)))
        .slice(0, Math.max(0, courseMaterialLimit - current.length))
        .map((option, index) => ({
          id: courseMaterialKey(option.materialType, option.materialId),
          materialId: option.materialId,
          materialType: option.materialType,
          displayName: option.title,
          guidedStudyScene: option.guidedStudyScene,
          sortOrder: current.length + index
        }));

      return [...current, ...additions];
    });
  }

  function renameMaterial(id: string, displayName: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, displayName } : item));
  }

  function removeMaterial(id: string) {
    setItems((current) => current
      .filter((item) => item.id !== id)
      .map((item, sortOrder) => ({ ...item, sortOrder })));
  }

  async function runAction(action: "save" | "submit") {
    if (actionLockRef.current || coverUploadLockRef.current || isReadOnly) {
      return;
    }

    const validation = validatedCourseInput({ coverMediaId, items, name, summary, tagText });

    if (!validation.ok) {
      setFeedback({ status: "error", message: validation.message });
      return;
    }

    setFeedback(null);
    actionLockRef.current = true;
    setPendingAction(action);
    let activeCourseId = persistedCourseId;
    const isNewCourseRoute = !course?.id;

    try {
      const saveResult = activeCourseId
        ? await saveCourseAction(activeCourseId, validation.input)
        : await createCourseAction(validation.input);

      if (!saveResult.ok) {
        setFeedback({ status: "error", message: saveResult.message });
        return;
      }

      activeCourseId = saveResult.data.id;
      setPersistedCourseId(activeCourseId);
      setRejectionReason("");

      if (action === "submit") {
        const submitResult = await submitCourseAction(activeCourseId);

        if (!submitResult.ok) {
          setFeedback({ status: "error", message: submitResult.message });
          return;
        }

        setIsReadOnly(true);
        setFeedback({ status: "success", message: submitResult.message });
      } else {
        setFeedback({ status: "success", message: saveResult.message });
      }

      if (isNewCourseRoute) {
        router.replace(`/dashboard/courses/${activeCourseId}`);
      } else {
        router.refresh();
      }
    } catch {
      setFeedback({ status: "error", message: "专辑操作失败，请稍后重试。" });
    } finally {
      actionLockRef.current = false;
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href="/dashboard/courses">
            <ArrowLeft />
            返回专辑列表
          </Link>
        </Button>
        {persistedCourseId ? (
          <Button asChild variant="outline">
            <Link href={`/c/${persistedCourseId}`}>
              <Eye />
              作者预览
            </Link>
          </Button>
        ) : null}
      </div>

      <CreatorWorkMetadata sync={course?.creatorSync} />
      {isReadOnly ? (
        <div className="rounded-xl border border-border bg-secondary p-4 text-sm" role="status">
          专辑正在审核中，当前内容暂不能修改。
        </div>
      ) : null}
      {rejectionReason ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          <span className="font-semibold">审核未通过：</span>{rejectionReason}
        </div>
      ) : null}
      {feedback ? (
        <div
          className={feedback.status === "error"
            ? "rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            : "rounded-xl border border-border bg-secondary p-4 text-sm"}
          role={feedback.status === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>专辑信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="course-name">专辑名称</FieldLabel>
                  <Input
                    disabled={controlsDisabled}
                    id="course-name"
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="输入专辑名称"
                    value={name}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="course-summary">专辑简介</FieldLabel>
                  <Textarea
                    disabled={controlsDisabled}
                    id="course-summary"
                    maxLength={2000}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder="简要介绍专辑内容"
                    rows={7}
                    value={summary}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="course-tags">专辑标签</FieldLabel>
                  <Input
                    disabled={controlsDisabled}
                    id="course-tags"
                    onChange={(event) => setTagText(event.target.value)}
                    placeholder="用空格或逗号分隔，最多 8 个"
                    value={tagText}
                  />
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="course-cover">专辑封面</FieldLabel>
                <CourseCoverUploader
                  coverUrl={coverUrl}
                  disabled={businessDisabled}
                  inputId="course-cover"
                  onUploaded={(asset) => {
                    setCoverMediaId(asset.id);
                    setCoverUrl(asset.url);
                  }}
                  onUploadingChange={(uploading) => {
                    coverUploadLockRef.current = uploading;
                    setIsCoverUploading(uploading);
                  }}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>专辑目录</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-muted-foreground">{items.length} 个课件</span>
                <CourseMaterialPicker
                  disabled={controlsDisabled || items.length >= courseMaterialLimit}
                  onAdd={addMaterials}
                  options={materialOptions}
                  selectedMaterialKeys={selectedMaterialKeys}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {items.length > 0 ? (
              [...items]
                  .sort((left, right) => left.sortOrder - right.sortOrder)
                  .map((item, index) => (
                    <div
                      className={cn(
                        "flex flex-col gap-3 rounded-xl border border-border bg-background p-4 transition-colors",
                        draggedItemId === item.id && "opacity-60",
                        dragOverItemId === item.id && draggedItemId !== item.id && "border-primary ring-2 ring-primary/20"
                      )}
                      key={item.id}
                      onDragEnter={() => {
                        if (draggedItemId && draggedItemId !== item.id) setDragOverItemId(item.id);
                      }}
                      onDragOver={(event) => {
                        if (draggedItemId && draggedItemId !== item.id) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedItemId || event.dataTransfer.getData("text/plain");

                        if (sourceId && sourceId !== item.id) {
                          setItems((current) => reorderCourseItem(current, sourceId, item.id));
                        }
                        setDraggedItemId(null);
                        setDragOverItemId(null);
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                            {index + 1}
                          </span>
                          <Badge variant="outline">
                            {courseMaterialDirectoryLabel(item.materialType, item.guidedStudyScene)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label={`拖动${item.displayName}排序`}
                            disabled={controlsDisabled}
                            draggable={!controlsDisabled}
                            onDragEnd={() => {
                              setDraggedItemId(null);
                              setDragOverItemId(null);
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", item.id);
                              setDraggedItemId(item.id);
                            }}
                            size="sm"
                            title="拖动排序"
                            type="button"
                            variant="ghost"
                          >
                            <GripVertical />
                          </Button>
                          <Button
                            aria-label={`上移${item.displayName}`}
                            disabled={controlsDisabled || index === 0}
                            onClick={() => setItems((current) => moveCourseItem(current, item.id, -1))}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            aria-label={`下移${item.displayName}`}
                            disabled={controlsDisabled || index === items.length - 1}
                            onClick={() => setItems((current) => moveCourseItem(current, item.id, 1))}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            aria-label={`移除${item.displayName}`}
                            disabled={controlsDisabled}
                            onClick={() => removeMaterial(item.id)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <Input
                        aria-label={`第 ${index + 1} 项课件名称：${item.displayName || "未命名"}`}
                        disabled={controlsDisabled}
                        maxLength={120}
                        onChange={(event) => renameMaterial(item.id, event.target.value)}
                        value={item.displayName}
                      />
                      {item.reviewFeedback ? (
                        <p className="text-sm leading-6 text-destructive">
                          <span className="font-semibold">{item.reviewFeedback.label}：</span>
                          {item.reviewFeedback.reason}
                        </p>
                      ) : null}
                    </div>
                  ))
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                点击“添加课件”，从自己制作的课件中选择专辑内容。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-wrap justify-end gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
        <Button
          disabled={controlsDisabled}
          onClick={() => runAction("save")}
          type="button"
          variant="outline"
        >
          {pendingAction === "save" ? <Loader2 className="animate-spin" /> : <Save />}
          {pendingAction === "save" ? "正在保存" : "保存草稿"}
        </Button>
        <Button disabled={controlsDisabled} onClick={() => runAction("submit")} type="button">
          {pendingAction === "submit" ? <Loader2 className="animate-spin" /> : <Send />}
          {pendingAction === "submit" ? "正在申请" : "公开分享"}
        </Button>
      </div>
    </div>
  );
}
