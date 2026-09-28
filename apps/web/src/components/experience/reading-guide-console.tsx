"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  FileImage,
  FileText,
  FileUp,
  History,
  ImageUp,
  ListChecks,
  Loader2,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Sparkles,
  Volume2,
  X
} from "lucide-react";

import { VoicePicker } from "@/components/audio/voice-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PublicUser } from "@/lib/auth-actions";
import { learningBillingConsumptionLabel } from "@/lib/learning-billing-copy";
import {
  estimateEnglishGuidedStudyAudio,
  estimateEnglishGuidedStudyMaterial,
  estimateEnglishGuidedStudyScriptUpdate,
  extractEnglishGuidedStudyImageText,
  extractEnglishGuidedStudyReferenceDocuments,
  extractReadingGuideDocument,
  generateEnglishGuidedStudyAudio,
  generateEnglishGuidedStudyMaterial,
  generateEnglishGuidedStudyPractice,
  getUserEnglishGuidedStudyMaterial,
  getUserEnglishGuidedStudyMaterials,
  updateEnglishGuidedStudyScript,
  type EnglishGuidedStudyBillingEstimate,
  type GenerateEnglishGuidedStudyAudioInput,
  type GenerateEnglishGuidedStudyMaterialInput,
  type UpdateEnglishGuidedStudyScriptInput
} from "@/lib/english-guided-study-api";
import {
  gushiwenGradeGroups,
  readingGuideDurationOptions,
  readingGuideQuestionCountOptions,
  type EnglishGuidedStudyMaterial,
  type EnglishGuidedStudyReferenceMaterial
} from "@/lib/english-guided-study-data";
import { createToolCreatorId, daoduCreatorPath } from "@/lib/tool-creator-routes";
import { cn } from "@/lib/utils";

type BillingDialog =
  | { action: "material"; estimate: EnglishGuidedStudyBillingEstimate; input: GenerateEnglishGuidedStudyMaterialInput }
  | { action: "audio"; estimate: EnglishGuidedStudyBillingEstimate; input: GenerateEnglishGuidedStudyAudioInput; materialId: string }
  | { action: "script"; estimate: EnglishGuidedStudyBillingEstimate; input: UpdateEnglishGuidedStudyScriptInput; materialId: string }
  | null;

const mainDocumentMaxBytes = 10 * 1024 * 1024;
const referenceDocumentMaxBytes = 2 * 1024 * 1024;
const imageMaxBytes = 12 * 1024 * 1024;
const sourceTextMaxLength = 256_000;
const gradeOptions = gushiwenGradeGroups[0]?.options ?? [];
const voiceOptions = [
  {
    badge: "官方系统音色",
    description: "阳光清晰，适合中文导读。",
    language: "中文",
    languages: ["中文"],
    name: "龙安洋",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longanyang.mp3",
    value: "longanyang"
  },
  {
    badge: "官方系统音色",
    description: "温柔自然，适合娓娓讲述。",
    language: "中文",
    languages: ["中文"],
    name: "龙小淳",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longxiaochun_v3.mp3",
    value: "longxiaochun_v3"
  },
  {
    badge: "官方系统音色",
    description: "沉稳从容，适合文学导读。",
    language: "中文",
    languages: ["中文"],
    name: "龙书",
    previewAudioUrl: "/audio/voices/cosyvoice-v3/longshu_v3.mp3",
    value: "longshu_v3"
  }
];

interface ImageRecognitionDraft {
  author: string;
  bodyText: string;
  title: string;
}

export function ReadingGuideConsole({
  creatorId,
  currentUser,
  initialGradeLabel
}: {
  creatorId: string;
  currentUser: PublicUser | null;
  initialGradeLabel?: string;
}) {
  const router = useRouter();
  const mainFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<EnglishGuidedStudyMaterial[]>([]);
  const [material, setMaterial] = useState<EnglishGuidedStudyMaterial | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceType, setSourceType] = useState<"IMAGE" | "TEXT">("TEXT");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [guideParagraphs, setGuideParagraphs] = useState<string[]>([]);
  const [gradeLabel, setGradeLabel] = useState(
    gradeOptions.some((option) => option.label === initialGradeLabel)
      ? initialGradeLabel as string
      : "七年级"
  );
  const [durationMinutes, setDurationMinutes] = useState<1 | 3 | 5 | 8 | 10 | 15>(3);
  const [questionCount, setQuestionCount] = useState<3 | 5 | 10 | 20>(5);
  const [voice, setVoice] = useState("longanyang");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [referenceMaterials, setReferenceMaterials] = useState<EnglishGuidedStudyReferenceMaterial[]>([]);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceText, setReferenceText] = useState("");
  const [referenceDocuments, setReferenceDocuments] = useState<EnglishGuidedStudyReferenceMaterial[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageName, setImageName] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageRecognitionDraft, setImageRecognitionDraft] = useState<ImageRecognitionDraft | null>(null);
  const [billingDialog, setBillingDialog] = useState<BillingDialog>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const gradeOption = useMemo(
    () => gradeOptions.find((option) => option.label === gradeLabel) ?? gradeOptions[7] ?? gradeOptions[0],
    [gradeLabel]
  );
  const activeProgress = material
    ? [material.contentGenerationProgress, material.practiceGenerationProgress, material.audioGenerationProgress]
        .find((progress) => progress && (progress.status === "QUEUED" || progress.status === "RUNNING")) ?? null
    : null;

  useEffect(() => {
    if (!currentUser) return;
    void refreshHistory();

    if (creatorId.startsWith("egs-") || /^[a-f0-9-]{36}$/iu.test(creatorId)) {
      void loadMaterial(creatorId, false);
    }
  }, [creatorId, currentUser]);

  useEffect(() => {
    if (!material || !activeProgress) return;
    const timer = window.setInterval(() => {
      void getUserEnglishGuidedStudyMaterial(material.id)
        .then((next) => {
          applyMaterial(next);
          if (!hasActiveOperation(next)) void refreshHistory();
        })
        .catch((reason) => setError(friendlyError(reason)));
    }, 2200);
    return () => window.clearInterval(timer);
  }, [activeProgress, material?.id]);

  async function refreshHistory() {
    try {
      setHistory(await getUserEnglishGuidedStudyMaterials("DAODU"));
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }

  async function loadMaterial(id: string, updateRoute = true) {
    try {
      setBusy("history");
      const next = await getUserEnglishGuidedStudyMaterial(id);
      applyMaterial(next);
      if (updateRoute) router.replace(daoduCreatorPath(next.id));
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  function applyMaterial(next: EnglishGuidedStudyMaterial) {
    setMaterial(next);
    setTitle(next.contentTitle ?? next.title);
    setAuthor(next.author ?? "");
    setSourceType(next.sourceType);
    setSourceName(next.sourceName);
    setSourceText(next.sourceText);
    setGuideParagraphs(splitReadingGuideParagraphs(next.narration));
    setReferenceMaterials(next.referenceMaterials);
    setReferenceText(next.referenceMaterials.find((item) => item.kind === "TEXT")?.content ?? "");
    setReferenceDocuments(next.referenceMaterials.filter((item) => item.kind === "DOCUMENT"));
    if (gradeOptions.some((option) => option.label === next.level.optionLabel)) setGradeLabel(next.level.optionLabel);
    if (readingGuideDurationOptions.includes(next.durationMinutes as never)) {
      setDurationMinutes(next.durationMinutes as 1 | 3 | 5 | 8 | 10 | 15);
    }
  }

  function startNew() {
    router.push(daoduCreatorPath(createToolCreatorId()));
    setMaterial(null);
    setTitle("");
    setAuthor("");
    setSourceType("TEXT");
    setSourceName(null);
    setSourceText("");
    setGuideParagraphs([]);
    setReferenceMaterials([]);
    setReferenceText("");
    setReferenceDocuments([]);
    setAnswers({});
    setError("");
    setNotice("");
  }

  function requireLogin() {
    if (currentUser) return true;
    router.push(`/login?next=${encodeURIComponent(daoduCreatorPath(creatorId))}`);
    return false;
  }

  async function prepareMaterialGeneration() {
    if (!requireLogin()) return;
    if (!sourceText.trim()) {
      setError("请先输入要阅读的内容，或上传一份文档");
      return;
    }
    if (!gradeOption) return;

    const input: GenerateEnglishGuidedStudyMaterialInput = {
      scene: "DAODU",
      sourceType,
      sourceName,
      sourceText: sourceText.trim(),
      title: title.trim() || undefined,
      author: author.trim() || undefined,
      referenceMaterials,
      levelStandardName: "学段年级",
      levelOptionLabel: gradeOption.label,
      aiLevel: gradeOption.aiLevel,
      explanationMode: "FREEFORM",
      durationMinutes,
      ...(material ? { materialId: material.id } : {})
    };

    try {
      setBusy("estimate-material");
      setError("");
      setBillingDialog({ action: "material", estimate: await estimateEnglishGuidedStudyMaterial(input), input });
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function prepareAudioGeneration() {
    if (!material || !guideParagraphs.length) return;
    if (readingGuideParagraphsChanged(guideParagraphs, material.narration)) {
      setError("导读文稿有未保存的修改，请先保存文稿再生成音频");
      return;
    }
    const input = { voice, speed: 1 } satisfies GenerateEnglishGuidedStudyAudioInput;

    try {
      setBusy("estimate-audio");
      setBillingDialog({
        action: "audio",
        estimate: await estimateEnglishGuidedStudyAudio(material.id, input),
        input,
        materialId: material.id
      });
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function saveGuideParagraph(paragraphIndex: number) {
    if (!material) return;
    const originalParagraph = splitReadingGuideParagraphs(material.narration)[paragraphIndex] ?? "";
    const script = guideParagraphs[paragraphIndex]?.trim() ?? "";
    if (!script || script === originalParagraph) return;
    const input: UpdateEnglishGuidedStudyScriptInput = {
      targetType: "SENTENCE",
      sentenceId: `reading-guide-p${paragraphIndex + 1}`,
      originalScript: originalParagraph,
      script
    };

    try {
      setBusy(`save-script-${paragraphIndex}`);
      setError("");
      if (material.audioUrl) {
        setBillingDialog({
          action: "script",
          estimate: await estimateEnglishGuidedStudyScriptUpdate(material.id, input),
          input,
          materialId: material.id
        });
      } else {
        applyMaterial(await updateEnglishGuidedStudyScript(material.id, input));
        setNotice(`第 ${paragraphIndex + 1} 段导读文稿已保存`);
      }
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function confirmBilling() {
    const dialog = billingDialog;
    if (!dialog || !dialog.estimate.enoughCredits) return;

    try {
      setBusy(`confirm-${dialog.action}`);
      setError("");
      if (dialog.action === "material") {
        const next = await generateEnglishGuidedStudyMaterial({
          ...dialog.input,
          billingConfirmed: true,
          billingRequestId: dialog.estimate.requestId,
          billingRevision: dialog.estimate.revision
        });
        applyMaterial(next);
        router.replace(daoduCreatorPath(next.id));
      } else if (dialog.action === "audio") {
        applyMaterial(await generateEnglishGuidedStudyAudio(dialog.materialId, {
          ...dialog.input,
          billingConfirmed: true,
          billingRequestId: dialog.estimate.requestId,
          billingRevision: dialog.estimate.revision
        }));
      } else {
        applyMaterial(await updateEnglishGuidedStudyScript(dialog.materialId, {
          ...dialog.input,
          billingConfirmed: true,
          billingRequestId: dialog.estimate.requestId,
          billingRevision: dialog.estimate.revision
        }));
        setNotice("文稿已保存，对应自然段的讲解音频已同步更新");
      }
      setBillingDialog(null);
      void refreshHistory();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function generatePractice() {
    if (!material) return;
    try {
      setBusy("practice");
      setError("");
      setAnswers({});
      applyMaterial(await generateEnglishGuidedStudyPractice(material.id, { questionCount }));
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
    }
  }

  async function uploadMainDocument(file: File | undefined) {
    if (!file || !requireLogin()) return;
    if (file.size > mainDocumentMaxBytes) {
      setError("阅读文档不能超过 10MB");
      return;
    }
    try {
      setBusy("main-document");
      setError("");
      const result = await extractReadingGuideDocument(file);
      setSourceType("TEXT");
      setSourceText(result.document.content);
      setSourceName(result.document.name);
      if (!title.trim()) setTitle(result.document.name.replace(/\.[^.]+$/u, ""));
      setNotice(result.document.truncated ? "文档较长，已提取前 256,000 个字符" : "阅读文档已提取");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
      if (mainFileRef.current) mainFileRef.current.value = "";
    }
  }

  async function recognizeImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !requireLogin()) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传有效的图片文件");
      return;
    }
    if (file.size > imageMaxBytes) {
      setError("图片不能超过 12MB");
      return;
    }

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageName(file.name);
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageRecognitionDraft(null);
    setImageDialogOpen(true);
    setBusy("image-recognition");
    setError("");

    try {
      const extracted = await extractEnglishGuidedStudyImageText({
        imageDataUrl: await readFileAsDataUrl(file),
        imageMimeType: file.type,
        imageName: file.name,
        imageSizeBytes: file.size,
        scene: "DAODU"
      });
      setImageRecognitionDraft({
        author: extracted.author ?? "",
        bodyText: extracted.bodyText,
        title: extracted.title ?? ""
      });
    } catch (reason) {
      setError(friendlyError(reason));
      setImageDialogOpen(false);
    } finally {
      setBusy(null);
    }
  }

  function confirmRecognizedImage() {
    if (!imageRecognitionDraft?.bodyText.trim()) {
      setError("请先识别或填写正文内容");
      return;
    }
    setTitle(imageRecognitionDraft.title.trim());
    setAuthor(imageRecognitionDraft.author.trim());
    setSourceText(imageRecognitionDraft.bodyText.trim().slice(0, sourceTextMaxLength));
    setSourceType("IMAGE");
    setSourceName(imageName || "图片识别");
    setImageDialogOpen(false);
    setNotice("已写入标题、作者和阅读正文");
  }

  function openReferenceDialog() {
    setReferenceText(referenceMaterials.find((item) => item.kind === "TEXT")?.content ?? "");
    setReferenceDocuments(referenceMaterials.filter((item) => item.kind === "DOCUMENT"));
    setReferenceOpen(true);
  }

  async function uploadReferenceDocuments(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    if (referenceDocuments.length + selected.length > 3) {
      setError("参考文档最多保留 3 个");
      return;
    }
    if (selected.some((file) => file.size > referenceDocumentMaxBytes)) {
      setError("单个参考文档不能超过 2MB");
      return;
    }
    try {
      setBusy("reference-document");
      const result = await extractEnglishGuidedStudyReferenceDocuments(selected, "DAODU");
      setReferenceDocuments((current) => [...current, ...result.documents].slice(0, 3));
      if (result.failures.length) setError(result.failures.map((item) => item.message).join("；"));
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(null);
      if (referenceFileRef.current) referenceFileRef.current.value = "";
    }
  }

  function confirmReferences() {
    const text = referenceText.trim();
    if (text.length > 10_000) {
      setError("录入的参考文本不能超过 10,000 个字符");
      return;
    }
    setReferenceMaterials([
      ...(text ? [{ id: `ref-text-${Date.now()}`, kind: "TEXT" as const, name: "补充参考资料", content: text }] : []),
      ...referenceDocuments
    ]);
    setReferenceOpen(false);
    setNotice("参考资料已保留，将在生成导读与练习时使用");
  }

  const generationDisabled = Boolean(activeProgress) || Boolean(busy);

  return (
    <section
      className={cn(
        "grid h-[calc(100vh-4rem)] min-h-0 grid-cols-1 overflow-hidden bg-[#f6f6f5] text-foreground",
        sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
      <input accept=".txt,.md,.markdown,.pdf,.docx" className="hidden" onChange={(event) => void uploadMainDocument(event.target.files?.[0])} ref={mainFileRef} type="file" />
      <input accept="image/*" className="hidden" onChange={(event) => void recognizeImage(event)} ref={imageFileRef} type="file" />

      <aside className="hidden min-h-0 flex-col border-r border-border bg-background lg:flex">
        <div className={cn("flex h-16 shrink-0 items-center", sidebarCollapsed ? "justify-center" : "justify-between px-5")}>
          {!sidebarCollapsed ? (
            <div className="flex min-w-0 items-center gap-2 font-display text-2xl font-light tracking-normal">
              <BookOpenText className="size-7 shrink-0" />
              <span className="truncate">开卷导读</span>
            </div>
          ) : null}
          <Button
            aria-label={sidebarCollapsed ? "展开左栏" : "收起左栏"}
            className={cn("px-0", sidebarCollapsed ? "size-8" : "size-9")}
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
            variant="ghost"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-5">
          <Button
            aria-label="新建导读课件"
            className={cn(
              "h-11 justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium shadow-sm hover:bg-secondary",
              sidebarCollapsed ? "px-0" : "px-4"
            )}
            onClick={startNew}
            variant="outline"
          >
            <Plus className="size-4" />
            {!sidebarCollapsed ? "新建导读课件" : null}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 pt-2 text-muted-foreground">
              <History className="size-5" />
              <span className="[writing-mode:vertical-rl] text-xs">历史</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="size-4" />
                <span>导读课件历史</span>
              </div>
              {!currentUser ? (
                <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm leading-6 text-muted-foreground">登录后查看账号历史</div>
              ) : history.length ? history.map((item) => (
                <button
                  className={cn(
                    "w-full rounded-xl px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary",
                    item.id === material?.id && "bg-secondary text-foreground"
                  )}
                  key={item.id}
                  onClick={() => void loadMaterial(item.id)}
                  type="button"
                >
                  <span className="line-clamp-2 font-medium text-foreground">{item.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span>{item.level.optionLabel}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </span>
                </button>
              )) : (
                <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-sm leading-6 text-muted-foreground">暂无账号历史</div>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto p-5">
        <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <CardHeader className="px-6 py-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <FileText className="size-5" />
                  阅读内容
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 p-5">
                <Input
                  aria-label="标题"
                  className="h-11 text-lg font-semibold placeholder:text-base placeholder:font-normal md:text-lg"
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="请在这里输入标题，非必填"
                  value={title}
                />
                <Input aria-label="作者" maxLength={120} onChange={(event) => setAuthor(event.target.value)} placeholder="请输入作者，非必填" value={author} />
                <div className="relative">
                  <Textarea
                    aria-label="阅读正文"
                    className="min-h-[320px] resize-y pb-9 text-base leading-8 md:text-base"
                    maxLength={sourceTextMaxLength}
                    onChange={(event) => {
                      setSourceText(event.target.value);
                      setSourceType("TEXT");
                    }}
                    placeholder="在这里录入要阅读的中文内容，也可以上传文档或通过图片识别文本。"
                    value={sourceText}
                  />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-muted-foreground">
                    {sourceText.length.toLocaleString("zh-CN")} / {sourceTextMaxLength.toLocaleString("zh-CN")} 字符
                    {sourceName ? ` · ${sourceName}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={generationDisabled} onClick={() => mainFileRef.current?.click()} type="button" variant="outline">
                    {busy === "main-document" ? <Loader2 className="animate-spin" /> : <FileUp />}上传文档
                  </Button>
                  <Button disabled={generationDisabled} onClick={openReferenceDialog} type="button" variant="outline">
                    <Paperclip />参考资料
                    {referenceMaterials.length ? <Badge className="ml-1" variant="secondary">{referenceMaterials.length}</Badge> : null}
                  </Button>
                  <Button disabled={generationDisabled} onClick={() => imageFileRef.current?.click()} type="button" variant="outline">
                    {busy === "image-recognition" ? <Loader2 className="animate-spin" /> : <FileImage />}图片识别
                  </Button>
                </div>
              </CardContent>
            </Card>

            {material?.narration || activeProgress?.operation === "CONTENT" ? (
              <Card className="overflow-hidden rounded-2xl shadow-sm">
                <CardHeader className="px-6 py-4">
                  <CardTitle className="text-base font-semibold">完整导读文稿</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  {activeProgress?.operation === "CONTENT" ? <ProgressBar progress={activeProgress} /> : null}
                  {guideParagraphs.map((paragraph, paragraphIndex) => {
                    const originalParagraph = material
                      ? splitReadingGuideParagraphs(material.narration)[paragraphIndex] ?? ""
                      : "";
                    const changed = paragraph.trim() !== originalParagraph;

                    return (
                      <div className="rounded-xl border border-border bg-card p-4" key={`reading-guide-p${paragraphIndex + 1}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">第 {paragraphIndex + 1} 段</p>
                          <Button disabled={generationDisabled || !paragraph.trim() || !changed} onClick={() => void saveGuideParagraph(paragraphIndex)} size="sm" type="button" variant="outline">
                            {busy === `save-script-${paragraphIndex}` ? <Loader2 className="animate-spin" /> : <Save />}
                            保存本段
                          </Button>
                        </div>
                        <Textarea
                          className="min-h-36 resize-y text-base leading-8"
                          onChange={(event) => setGuideParagraphs((current) => current.map((item, index) => index === paragraphIndex ? event.target.value : item))}
                          value={paragraph}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            {material?.questions.length ? (
              <Card className="overflow-hidden rounded-2xl shadow-sm">
                <CardHeader className="px-6 py-4"><CardTitle className="text-base font-semibold">同步练习</CardTitle></CardHeader>
                <CardContent className="space-y-4 p-5">
                  {material.questions.map((question, index) => (
                    <div className="rounded-xl border border-border bg-card p-4" key={question.id}>
                      <p className="text-sm font-semibold">{index + 1}. {question.question}</p>
                      <div className="mt-3 grid gap-2">
                        {question.options.map((option, optionIndex) => {
                          const selected = answers[question.id] === optionIndex;
                          const answered = answers[question.id] !== undefined;
                          return (
                            <button
                              className={cn(
                                "rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                                selected && optionIndex === question.answer && "border-emerald-500 bg-emerald-50",
                                selected && optionIndex !== question.answer && "border-destructive bg-destructive/5"
                              )}
                              key={option}
                              onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                              type="button"
                            >
                              {String.fromCharCode(65 + optionIndex)}. {option}
                              {answered && optionIndex === question.answer ? "（正确答案）" : ""}
                            </button>
                          );
                        })}
                      </div>
                      {answers[question.id] !== undefined ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{question.explanation}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
            {notice ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
          </div>

          <aside className="flex flex-col gap-5">
            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <CardHeader className="px-5 py-4"><CardTitle className="text-base font-semibold">导读设置</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4 p-5">
                <label className="grid gap-2 text-sm font-semibold">
                  学段年级
                  <Select onChange={(event) => setGradeLabel(event.target.value)} value={gradeLabel}>
                    {gradeOptions.map((option) => <option key={option.aiLevel} value={option.label}>{option.label}</option>)}
                  </Select>
                </label>
                <div className="grid gap-2">
                  <p className="text-sm font-semibold">导读时长</p>
                  <div className="grid grid-cols-3 gap-2">
                    {readingGuideDurationOptions.map((minutes) => (
                      <Button key={minutes} onClick={() => setDurationMinutes(minutes)} size="sm" type="button" variant={durationMinutes === minutes ? "default" : "outline"}>{minutes} 分钟</Button>
                    ))}
                  </div>
                </div>
                <Button className="w-full bg-white text-black hover:bg-neutral-100" disabled={generationDisabled || !sourceText.trim()} onClick={() => void prepareMaterialGeneration()} type="button" variant="outline">
                  {busy === "estimate-material" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {material ? "重新生成导读文稿" : "生成导读文稿"}
                </Button>
                {activeProgress?.operation === "CONTENT" ? <ProgressBar progress={activeProgress} /> : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <CardHeader className="px-5 py-4"><CardTitle className="text-base font-semibold">讲解语音</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4 p-5">
                <VoicePicker disabled={!material?.narration || generationDisabled} label="选择音色" onChange={setVoice} value={voice} voices={voiceOptions} />
                <Button className="w-full bg-white text-black hover:bg-neutral-100" disabled={!material?.narration || generationDisabled} onClick={() => void prepareAudioGeneration()} type="button" variant="outline">
                  {busy === "estimate-audio" ? <Loader2 className="animate-spin" /> : <Volume2 />}
                  {material?.audioUrl ? "重新生成讲解音频" : "生成讲解音频"}
                </Button>
                {activeProgress?.operation === "AUDIO" ? <ProgressBar progress={activeProgress} /> : null}
                {material?.audioUrl ? (
                  <ReadingGuideAudioPreview
                    fallbackUrl={material.audioUrl}
                    nodes={material.narrationTimelineV2?.nodes ?? []}
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl shadow-sm">
              <CardHeader className="px-5 py-4"><CardTitle className="text-base font-semibold">同步练习</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="grid gap-2">
                  <p className="text-sm font-semibold">选择同步练习题目数</p>
                  <div className="grid grid-cols-4 gap-2">
                    {readingGuideQuestionCountOptions.map((count) => (
                      <Button key={count} onClick={() => setQuestionCount(count)} size="sm" type="button" variant={questionCount === count ? "default" : "outline"}>{count}</Button>
                    ))}
                  </div>
                </div>
                <Button className="w-full bg-white text-black hover:bg-neutral-100" disabled={!material?.narration || generationDisabled} onClick={() => void generatePractice()} type="button" variant="outline">
                  {busy === "practice" ? <Loader2 className="animate-spin" /> : <ListChecks />}
                  {material?.questions.length ? "重新生成同步练习" : "生成同步练习"}
                </Button>
                {activeProgress?.operation === "PRACTICE" ? <ProgressBar progress={activeProgress} /> : null}
                {material?.questions.length ? <p className="text-xs font-medium text-muted-foreground">已生成 {material.questions.length} 道同步练习</p> : null}
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      {imageDialogOpen && imagePreviewUrl ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-6">
          <div aria-modal="true" className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl" role="dialog">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">选择阅读内容</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">确认图片和识别出的标题、作者与正文。</p>
              </div>
              <Button aria-label="关闭图片识别" className="size-8 px-0" disabled={busy === "image-recognition"} onClick={() => setImageDialogOpen(false)} type="button" variant="ghost"><X /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
                  <img alt="待识别的阅读内容" className="max-h-[60vh] max-w-full object-contain" src={imagePreviewUrl} />
                </div>
                {imageRecognitionDraft ? (
                  <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
                    <label className="grid gap-2 text-sm font-semibold">标题<Input onChange={(event) => setImageRecognitionDraft((current) => current ? { ...current, title: event.target.value } : current)} placeholder="可选" value={imageRecognitionDraft.title} /></label>
                    <label className="grid gap-2 text-sm font-semibold">作者<Input onChange={(event) => setImageRecognitionDraft((current) => current ? { ...current, author: event.target.value } : current)} placeholder="未识别到作者时可留空" value={imageRecognitionDraft.author} /></label>
                    <label className="flex min-h-0 flex-1 flex-col gap-2 text-sm font-semibold">
                      识别文本
                      <Textarea className="min-h-72 flex-1 resize-y text-base leading-8" maxLength={sourceTextMaxLength} onChange={(event) => setImageRecognitionDraft((current) => current ? { ...current, bodyText: event.target.value } : current)} value={imageRecognitionDraft.bodyText} />
                    </label>
                  </div>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
                    <Loader2 className="size-6 animate-spin" />
                    正在提取标题、作者和完整正文
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button disabled={busy === "image-recognition"} onClick={() => imageFileRef.current?.click()} type="button" variant="outline"><ImageUp />重新选择图片</Button>
              <div className="flex gap-2">
                <Button disabled={busy === "image-recognition"} onClick={() => setImageDialogOpen(false)} type="button" variant="outline">取消</Button>
                <Button disabled={busy === "image-recognition" || !imageRecognitionDraft?.bodyText.trim()} onClick={confirmRecognizedImage} type="button"><CheckCircle2 />确认文本</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {referenceOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div aria-modal="true" className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-xl" role="dialog">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold">参考资料</h2><p className="mt-1 text-sm text-muted-foreground">保留补充文本和原有参考文档能力。</p></div>
              <Button aria-label="关闭参考资料" className="size-9 p-0" onClick={() => setReferenceOpen(false)} size="sm" variant="ghost"><X /></Button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="grid gap-2 text-sm font-semibold">补充参考文本<Textarea className="min-h-32" maxLength={10_000} onChange={(event) => setReferenceText(event.target.value)} value={referenceText} /></label>
              <div className="space-y-2">
                {referenceDocuments.map((document) => (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm" key={document.id}>
                    <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0" /><span className="truncate">{document.name}</span></span>
                    <Button aria-label={`移除 ${document.name}`} className="size-9 p-0" onClick={() => setReferenceDocuments((items) => items.filter((item) => item.id !== document.id))} size="sm" variant="ghost"><X /></Button>
                  </div>
                ))}
              </div>
              <input accept=".txt,.md,.markdown,.pdf,.docx" className="hidden" multiple onChange={(event) => void uploadReferenceDocuments(event.target.files)} ref={referenceFileRef} type="file" />
              <Button disabled={referenceDocuments.length >= 3 || busy === "reference-document"} onClick={() => referenceFileRef.current?.click()} variant="outline">
                {busy === "reference-document" ? <Loader2 className="animate-spin" /> : <Paperclip />}上传参考文档（最多 3 个，每个 ≤2MB）
              </Button>
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button onClick={() => setReferenceOpen(false)} variant="outline">取消</Button><Button onClick={confirmReferences}><CheckCircle2 />保留参考资料</Button></div>
          </div>
        </div>
      ) : null}

      {billingDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div aria-modal="true" className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-xl" role="dialog">
            <p className="text-sm font-medium text-muted-foreground">点数消耗确认</p>
            <h2 className="mt-1 text-xl font-semibold">{billingDialog.estimate.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{learningBillingConsumptionLabel(billingDialog.estimate.operation)} {billingDialog.estimate.estimatedCredits.toLocaleString("zh-CN")} 点，当前可用 {billingDialog.estimate.availableCredits.toLocaleString("zh-CN")} 点。</p>
            {!billingDialog.estimate.enoughCredits ? <p className="mt-3 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">当前点数不足，请先充值。</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={Boolean(busy)} onClick={() => setBillingDialog(null)} variant="outline">取消</Button>
              {billingDialog.estimate.enoughCredits ? <Button disabled={Boolean(busy)} onClick={() => void confirmBilling()}>{busy?.startsWith("confirm-") ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}确认生成</Button> : <Button asChild><Link href="/pricing">去充值</Link></Button>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReadingGuideAudioPreview({
  fallbackUrl,
  nodes
}: {
  fallbackUrl: string;
  nodes: Array<{ audioUrl: string }>;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const continuePlaybackRef = useRef(false);
  const [nodeIndex, setNodeIndex] = useState(0);
  const playbackNodes = nodes.length ? nodes : [{ audioUrl: fallbackUrl }];
  const audioUrl = playbackNodes[nodeIndex]?.audioUrl ?? fallbackUrl;

  useEffect(() => {
    setNodeIndex(0);
  }, [fallbackUrl, nodes]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    if (continuePlaybackRef.current) {
      continuePlaybackRef.current = false;
      void audio.play().catch(() => undefined);
    }
  }, [audioUrl]);

  return (
    <div className="grid min-w-0 gap-2 rounded-xl border border-border bg-card p-3">
      {playbackNodes.length > 1 ? (
        <p className="text-center text-xs font-medium text-muted-foreground">讲解片段 {nodeIndex + 1} / {playbackNodes.length}</p>
      ) : null}
      <audio
        className="w-full"
        controls
        onEnded={() => {
          if (nodeIndex >= playbackNodes.length - 1) return;
          continuePlaybackRef.current = true;
          setNodeIndex((current) => current + 1);
        }}
        preload="metadata"
        ref={audioRef}
        src={audioUrl}
      />
    </div>
  );
}

function ProgressBar({ progress }: { progress: NonNullable<EnglishGuidedStudyMaterial["contentGenerationProgress"]> }) {
  return (
    <div className="rounded-xl bg-secondary px-4 py-3">
      <div className="flex justify-between gap-3 text-xs font-medium text-muted-foreground"><span>{progress.message}</span><span>{progress.percent}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} /></div>
    </div>
  );
}

function hasActiveOperation(material: EnglishGuidedStudyMaterial) {
  return [material.contentGenerationProgress, material.practiceGenerationProgress, material.audioGenerationProgress]
    .some((progress) => progress && (progress.status === "QUEUED" || progress.status === "RUNNING"));
}

function friendlyError(reason: unknown) {
  return reason instanceof Error && reason.message ? reason.message : "操作失败，请稍后重试";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function splitReadingGuideParagraphs(script: string) {
  return script
    .replace(/\r\n?/gu, "\n")
    .trim()
    .split(/\n\s*\n+/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function readingGuideParagraphsChanged(paragraphs: string[], narration: string) {
  const original = splitReadingGuideParagraphs(narration);
  return paragraphs.length !== original.length || paragraphs.some((paragraph, index) => paragraph.trim() !== original[index]);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败"));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}
