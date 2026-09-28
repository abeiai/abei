"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Brain,
  CheckCircle2,
  FileUp,
  GraduationCap,
  History,
  Import,
  Info,
  Layers3,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Sparkles,
  X,
  type LucideIcon
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  publishLearningContext,
  publishLearningEvent
} from "@/components/learning/learner-learning-provider";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  generateLearningFlashcardDeck,
  getLearningFlashcardDeck,
  importLearningFlashcardDeck,
  listLearningFlashcardDecks,
  listLearningFlashcardTextbooks,
  reviewLearningFlashcard,
  type LearningFlashcardDeck,
  type LearningFlashcardReviewGrade,
  type LearningFlashcardReviewSummary,
  type LearningFlashcardStrategy
} from "@/lib/learning-flashcards-api";
import type { PublicTextbookFilterOption, PublicTextbookListItem, PublicTextbookListResult } from "@/lib/textbook-public-api";
import {
  createToolCreatorId,
  flashcardCreatorPath
} from "@/lib/tool-creator-routes";
import { cn } from "@/lib/utils";

type SourceId = "textbook" | "upload" | "import";
type StepId = "setup" | "map" | "review" | "study" | "report";
type Grade = "hard" | "blurry" | "mastered";

const sourceOptions: Array<{ icon: LucideIcon; id: SourceId; title: string }> = [
  { id: "textbook", title: "电子教材", icon: BookOpenText },
  { id: "upload", title: "上传材料", icon: FileUp },
  { id: "import", title: "导入闪卡", icon: Import }
];

const steps: Array<{ id: StepId; label: string }> = [
  { id: "setup", label: "选材料" },
  { id: "map", label: "知识地图" },
  { id: "review", label: "审核闪卡" },
  { id: "study", label: "沉浸学习" },
  { id: "report", label: "学习报告" }
];

interface LearningMaterialUnit {
  desc: string;
  id: string;
  title: string;
}

interface LearningMaterial {
  coverLines: string[];
  grade: string;
  hasMarkdownContent?: boolean;
  id: string;
  isFallback?: boolean;
  meta: string;
  subject: string;
  tags: string[];
  title: string;
  units: LearningMaterialUnit[];
  version: string;
  volumeName?: string;
}

const histories = [
  { id: "h1", title: "译林版英语七上 Unit 1", desc: "84 张卡 · 掌握 68%" },
  { id: "h2", title: "七上整册词汇预习", desc: "312 张卡 · 今日待复习 42 张" },
  { id: "h3", title: "Reading 易错句型", desc: "36 张卡 · 昨天生成" }
];

const fallbackMaterials: LearningMaterial[] = [
  {
    id: "yilin7a",
    title: "译林版英语 七年级上册",
    subject: "英语",
    version: "译林版",
    grade: "七年级上册",
    coverLines: ["英语", "七上"],
    isFallback: true,
    meta: "平台教材 · Markdown 已就绪",
    tags: ["英语", "七年级", "整册可生成"],
    units: [
      { id: "unit1", title: "Unit 1 This is me", desc: "自我介绍 · be 动词 · 高频词 42" },
      { id: "unit2", title: "Unit 2 Let's play sports", desc: "运动主题 · 一般现在时 · 高频词 38" },
      { id: "unit3", title: "Unit 3 Welcome to our school", desc: "校园主题 · 指示代词 · 高频词 51" },
      { id: "unit4", title: "Unit 4 My day", desc: "日常作息 · 时间表达 · 高频词 46" }
    ]
  },
  {
    id: "renjiao7a",
    title: "人教版英语 七年级上册",
    subject: "英语",
    version: "人教版",
    grade: "七年级上册",
    coverLines: ["英语", "七上"],
    isFallback: true,
    meta: "平台教材 · 结构化目录",
    tags: ["英语", "人教版", "单元优先"],
    units: [
      { id: "starter1", title: "Starter Unit 1 Good morning", desc: "问候语 · 字母 · 基础表达" },
      { id: "starter2", title: "Starter Unit 2 What's this", desc: "物品表达 · 冠词 · 拼写训练" },
      { id: "unit1", title: "Unit 1 My name's Gina", desc: "自我介绍 · 物主代词 · 高频词 36" }
    ]
  },
  {
    id: "yilin8a",
    title: "译林版英语 八年级上册",
    subject: "英语",
    version: "译林版",
    grade: "八年级上册",
    coverLines: ["英语", "八上"],
    isFallback: true,
    meta: "平台教材 · 待生成索引",
    tags: ["英语", "八年级", "阅读强化"],
    units: [
      { id: "unit1", title: "Unit 1 Friends", desc: "人物描述 · 比较级 · 高频词 44" },
      { id: "unit2", title: "Unit 2 School life", desc: "学校生活 · 比较表达 · 高频词 48" }
    ]
  },
  {
    id: "suxiao5a",
    title: "苏教版数学 五年级上册",
    subject: "数学",
    version: "苏教版",
    grade: "五年级上册",
    coverLines: ["数学", "五上"],
    isFallback: true,
    meta: "学科预留 · 后续接入",
    tags: ["数学", "五年级", "概念卡预留"],
    units: [
      { id: "unit1", title: "负数的初步认识", desc: "概念理解 · 生活场景 · 易错判断" },
      { id: "unit2", title: "多边形面积", desc: "公式推导 · 图形辨析 · 题型迁移" }
    ]
  }
];

interface DisplayFlashcard {
  back: string;
  front: string;
  id?: string;
  reviewSummary?: LearningFlashcardReviewSummary;
  source: string | null;
  sortOrder?: number;
  tags?: string[];
  type: string;
}

const cardTypes = [
  { id: "meaning", label: "词义卡" },
  { id: "spelling", label: "拼写卡" },
  { id: "example", label: "语境例句卡" },
  { id: "grammar", label: "语法规则卡" },
  { id: "compare", label: "辨析卡" },
  { id: "listening", label: "听力卡预留" }
];

const knowledgeNodes = [
  { id: "unit1", title: "Unit 1 This is me", desc: "词汇 42 · 句型 18 · 语法 9 · 易错 7" },
  { id: "unit2", title: "Unit 2 Let's play sports", desc: "词汇 38 · 句型 16 · 语法 8 · 易错 6" },
  { id: "unit3", title: "Unit 3 Welcome to our school", desc: "词汇 51 · 句型 21 · 语法 12 · 易错 10" },
  { id: "cross", title: "整册高频辨析", desc: "excited / exciting、look / see / watch" }
];

const flashcards = [
  {
    type: "词义卡",
    front: "be good at",
    back: "擅长。例句：She is good at drawing. 注意 at 后接名词或动名词。",
    source: "Unit 1 Reading · 第 3 段"
  },
  {
    type: "辨析卡",
    front: "excited vs exciting",
    back: "excited 描述人的感受，exciting 描述事物令人兴奋。I am excited. The match is exciting.",
    source: "Unit 1 Vocabulary · 高频易错"
  },
  {
    type: "语法卡",
    front: "一般现在时何时用第三人称单数？",
    back: "主语是 he、she、it 或单数名词时，动词通常加 s 或 es。例如：He likes football.",
    source: "Unit 2 Grammar Focus"
  },
  {
    type: "拼写卡",
    front: "拼写：同班同学",
    back: "classmate。常见错误是写成 class mate，教材中作为一个单词出现。",
    source: "Unit 1 Word list"
  },
  {
    type: "语境卡",
    front: "补全句子：I often ___ books after school.",
    back: "read。句意：我放学后经常读书。often 提示一般现在时。",
    source: "Unit 3 Exercise"
  }
];

const stepCopy: Record<Exclude<StepId, "study">, { panel: string; title: string }> = {
  setup: { title: "创建学习闪卡", panel: "选择学习材料" },
  map: { title: "知识地图", panel: "教材理解结果" },
  review: { title: "审核闪卡", panel: "确认卡片质量" },
  report: { title: "学习报告", panel: "学习结果" }
};

export function LearningFlashcardsConsole({ creatorId }: { creatorId?: string }) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [step, setStep] = useState<StepId>("setup");
  const [materialOptions, setMaterialOptions] = useState<LearningMaterial[]>([]);
  const [textbookFilterOptions, setTextbookFilterOptions] = useState<{
    grades: PublicTextbookFilterOption[];
    subjects: PublicTextbookFilterOption[];
    versions: PublicTextbookFilterOption[];
    versionsBySubject?: Record<string, PublicTextbookFilterOption[]>;
  }>({
    subjects: [{ value: "英语", label: "英语" }],
    versions: [],
    grades: []
  });
  const [savedDecks, setSavedDecks] = useState<LearningFlashcardDeck[]>([]);
  const [activeDeck, setActiveDeck] = useState<LearningFlashcardDeck | null>(null);
  const [confirmedSource, setConfirmedSource] = useState<SourceId | null>(null);
  const [modalSource, setModalSource] = useState<SourceId | null>(null);
  const [filters, setFilters] = useState({ subject: "英语", version: "译林版", grade: "七年级上册" });
  const [pendingMaterialId, setPendingMaterialId] = useState("yilin7a");
  const [selectedMaterialId, setSelectedMaterialId] = useState("yilin7a");
  const [selectedRange, setSelectedRange] = useState("book");
  const [detailRequest, setDetailRequest] = useState("需要背诵的部分");
  const [strategy, setStrategy] = useState<LearningFlashcardStrategy>("SUBJECT_KNOWLEDGE");
  const [targetCardCount, setTargetCardCount] = useState(120);
  const [confirmedUpload, setConfirmedUpload] = useState<{ sourceName: string; sourceText: string } | null>(null);
  const [confirmedImport, setConfirmedImport] = useState<{ importText: string; sourceName: string; title: string } | null>(null);
  const [activeNode, setActiveNode] = useState("unit1");
  const [activeCard, setActiveCard] = useState(0);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyQueue, setStudyQueue] = useState<DisplayFlashcard[]>([]);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [studyStats, setStudyStats] = useState<Record<Grade, number>>({ hard: 0, blurry: 0, mastered: 0 });
  const [enabledCardTypes, setEnabledCardTypes] = useState(["meaning", "spelling", "example", "grammar", "compare"]);
  const [generation, setGeneration] = useState<{ rows: string[]; title: string } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingTextbooks, setLoadingTextbooks] = useState(false);
  const [textbookTotal, setTextbookTotal] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subjectOptions = useMemo(() => textbookFilterOptions.subjects.map((item) => item.value), [textbookFilterOptions.subjects]);
  const versionOptions = useMemo(
    () =>
      (filters.subject && textbookFilterOptions.versionsBySubject
        ? textbookFilterOptions.versionsBySubject[filters.subject] ?? []
        : textbookFilterOptions.versions
      ).map((item) => item.value),
    [filters.subject, textbookFilterOptions.versions, textbookFilterOptions.versionsBySubject]
  );
  const gradeOptions = useMemo(() => textbookFilterOptions.grades.map((item) => item.value), [textbookFilterOptions.grades]);
  const filteredMaterials = materialOptions;
  const selectedMaterial = materialOptions.find((material) => material.id === selectedMaterialId) ?? materialOptions[0] ?? fallbackMaterials[0];
  const pendingMaterial =
    filteredMaterials.find((material) => material.id === pendingMaterialId) ?? filteredMaterials[0] ?? materialOptions[0] ?? fallbackMaterials[0];
  const selectedUnit = selectedRange === "book" ? null : selectedMaterial.units.find((unit) => unit.id === selectedRange) ?? null;
  const currentStepCopy = step === "study" ? stepCopy.review : stepCopy[step];
  const displayCards: DisplayFlashcard[] = activeDeck?.cards.length ? activeDeck.cards : flashcards;
  const orderedDisplayCards = useMemo(() => orderFlashcardsForStudy(displayCards), [displayCards]);
  const activeStudyCards = studyQueue.length > 0 ? studyQueue : orderedDisplayCards;
  const historyItems = savedDecks.length
    ? savedDecks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        desc: `${deck.cards.length} 张卡 · 掌握 ${summarizeCardReviewSummaries(deck.cards).mastered}/${deck.cards.length}`
      }))
    : histories;
  const activeKnowledgeNodes = activeDeck?.knowledgeMap.length
    ? activeDeck.knowledgeMap.map((node, index) => ({
        id: node.title || `node-${index}`,
        title: node.title || `知识点 ${index + 1}`,
        desc: node.description || "已生成知识点"
      }))
    : knowledgeNodes;

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingHistory(true);
      try {
        const [deckList, textbookResult, requestedDeck] = await Promise.all([
          listLearningFlashcardDecks().catch(() => []),
          listLearningFlashcardTextbooks({ pageSize: "60", subject: "英语" }).catch(() => null),
          creatorId ? getLearningFlashcardDeck(creatorId).catch(() => null) : Promise.resolve(null)
        ]);

        if (cancelled) {
          return;
        }

        setSavedDecks(requestedDeck ? [requestedDeck, ...deckList.filter((deck) => deck.id !== requestedDeck.id)] : deckList);

        if (requestedDeck) {
          applyDeck(requestedDeck, "review", false);
        }

        if (textbookResult) {
          applyTextbookResult(textbookResult);
        }

        const realMaterials = textbookResult?.items.map(toLearningMaterial).filter(Boolean) ?? [];

        if (realMaterials.length > 0) {
          const preferred =
            realMaterials.find((material) => material.subject === "英语" && material.hasMarkdownContent) ??
            realMaterials.find((material) => material.subject === "英语") ??
            realMaterials[0];
          setFilters({
            subject: preferred.subject,
            version: preferred.version,
            grade: preferred.grade
          });
          setPendingMaterialId(preferred.id);
          setSelectedMaterialId(preferred.id);
        }
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  useEffect(() => {
    if (modalSource !== "textbook") {
      return;
    }

    let cancelled = false;

    async function loadFilteredTextbooks() {
      setLoadingTextbooks(true);

      try {
        const result = await listLearningFlashcardTextbooks({
          pageSize: "60",
          subject: filters.subject,
          version: filters.version,
          grade: filters.grade
        });

        if (!cancelled) {
          applyTextbookResult(result);
        }
      } catch (error) {
        if (!cancelled) {
          setMaterialOptions([]);
          setTextbookTotal(0);
          notify(error instanceof Error ? error.message : "电子教材加载失败。");
        }
      } finally {
        if (!cancelled) {
          setLoadingTextbooks(false);
        }
      }
    }

    void loadFilteredTextbooks();

    return () => {
      cancelled = true;
    };
  }, [filters.grade, filters.subject, filters.version, modalSource]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    []
  );

  function applyTextbookResult(result: PublicTextbookListResult) {
    const realMaterials = result.items.map(toLearningMaterial);

    setTextbookFilterOptions({
      subjects: result.filters.subjects,
      versions: result.filters.versions,
      versionsBySubject: result.filters.versionsBySubject,
      grades: result.filters.grades
    });
    setMaterialOptions(realMaterials);
    setTextbookTotal(result.pagination.total);

    if (realMaterials.length > 0) {
      setPendingMaterialId((current) => (realMaterials.some((material) => material.id === current) ? current : realMaterials[0].id));
    }
  }

  function notify(message: string) {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(""), 2400);
  }

  function updateFilter(key: "grade" | "subject" | "version", value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      if (key === "subject") {
        next.version = "";
        next.grade = "";
      }

      if (key === "version") {
        next.grade = "";
      }

      return next;
    });
  }

  function confirmTextbookSource() {
    setConfirmedSource("textbook");
    setSelectedMaterialId(pendingMaterial.id);
    setSelectedRange("book");
    setModalSource(null);
    setStep("setup");
  }

  function confirmUploadSource(input: { sourceName: string; sourceText: string }) {
    const sourceText = input.sourceText.trim();

    if (!sourceText) {
      notify("请先输入材料文本。");
      return;
    }

    setConfirmedUpload({
      sourceName: input.sourceName.trim() || "上传材料",
      sourceText
    });
    setConfirmedSource("upload");
    setModalSource(null);
    setStep("setup");
  }

  function confirmImportSource(input: { importText: string; sourceName: string; title: string }) {
    const importText = input.importText.trim();

    if (!importText) {
      notify("请先输入可导入的闪卡内容。");
      return;
    }

    setConfirmedImport({
      title: input.title.trim() || "导入闪卡组",
      sourceName: input.sourceName.trim() || "导入闪卡",
      importText
    });
    setConfirmedSource("import");
    setModalSource(null);
    setStep("setup");
  }

  async function openSavedDeck(id: string) {
    const deck = savedDecks.find((item) => item.id === id);

    if (!deck) {
      notify("历史卡组暂不可用。");
      return;
    }

    router.push(flashcardCreatorPath(deck.id));
    applyDeck(deck, "review", false);
    notify("已打开历史卡组。");
  }

  function applyDeck(
    deck: LearningFlashcardDeck,
    nextStep: Exclude<StepId, "setup" | "study">,
    syncCreatorRoute = true
  ) {
    setActiveDeck(deck);
    setGeneration(null);
    setSavedDecks((current) => [deck, ...current.filter((item) => item.id !== deck.id)]);
    setActiveNode(deck.knowledgeMap[0]?.title || "unit1");
    setActiveCard(0);
    setStudyIndex(0);
    setStudyQueue([]);
    setAnswerVisible(false);
    setStep(nextStep);

    if (syncCreatorRoute) {
      router.replace(flashcardCreatorPath(deck.id));
    }
  }

  function startNewDeck() {
    router.push(flashcardCreatorPath(createToolCreatorId()));
    setStep("setup");
    setGeneration(null);
    setActiveDeck(null);
    setConfirmedSource(null);
    setStudyQueue([]);
    setAnswerVisible(false);
  }

  async function generateMap() {
    if (!confirmedSource) {
      notify("请先确认学习材料。");
      setModalSource("textbook");
      return;
    }

    if (confirmedSource === "textbook") {
      if (selectedMaterial.isFallback) {
        notify("请先选择真实电子教材。");
        setModalSource("textbook");
        return;
      }

      if (!selectedMaterial.hasMarkdownContent) {
        notify("该教材暂未准备好可生成内容。");
        setModalSource("textbook");
        return;
      }
    }

    setGeneration({
      title: confirmedSource === "import" ? "正在导入闪卡" : `正在生成 ${selectedMaterial.title}`,
      rows:
        confirmedSource === "import"
          ? ["校验正反面", "合并重复卡片", "写入学习历史"]
          : ["读取学习材料", "抽取知识地图", "生成可复习闪卡"]
    });

    try {
      if (confirmedSource === "import") {
        if (!confirmedImport) {
          throw new Error("请先确认导入内容");
        }

        const deck = await importLearningFlashcardDeck({
          title: confirmedImport.title,
          sourceName: confirmedImport.sourceName,
          importText: confirmedImport.importText,
          strategy
        });

        applyDeck(deck, "review");
        notify("闪卡已导入。");
        return;
      }

      if (confirmedSource === "upload" && !confirmedUpload) {
        throw new Error("请先确认上传材料");
      }

      const deck = await generateLearningFlashcardDeck({
        sourceType: confirmedSource === "textbook" ? "TEXTBOOK" : "UPLOAD",
        textbookId: confirmedSource === "textbook" ? selectedMaterial.id : undefined,
        textbookRange: confirmedSource === "textbook" ? selectedRange : undefined,
        sourceName: confirmedSource === "upload" ? confirmedUpload?.sourceName : selectedMaterial.title,
        sourceText: confirmedSource === "upload" ? confirmedUpload?.sourceText : undefined,
        detailRequest,
        strategy,
        cardTypes: enabledCardTypes,
        targetCardCount
      });

      applyDeck(deck, "map");
      notify("闪卡组已生成。");
    } catch (error) {
      setGeneration(null);
      notify(error instanceof Error ? error.message : "生成失败，请稍后重试。");
    }
  }

  function generateCards() {
    if (!activeDeck) {
      void generateMap();
      return;
    }

    setStep("review");
  }

  function startStudy() {
    if (activeDeck?.id) {
      router.push(flashcardStudyHref(activeDeck.id));
      return;
    }

    setStudyIndex(0);
    setStudyQueue(orderFlashcardsForStudy(displayCards));
    setAnswerVisible(false);
    setStudyStats({ hard: 0, blurry: 0, mastered: 0 });
    setStep("study");
  }

  function gradeCard(grade: Grade) {
    const card = activeStudyCards[studyIndex % Math.max(1, activeStudyCards.length)];

    setStudyStats((current) => ({ ...current, [grade]: current[grade] + 1 }));

    if (card?.id) {
      applyLocalReview(card.id, grade);
      void reviewLearningFlashcard(card.id, apiGradeFromUiGrade(grade)).catch(() => {
        notify("复习反馈暂未保存。");
      });
    }

    if (studyIndex >= activeStudyCards.length - 1) {
      setStep("report");
      return;
    }
    setStudyIndex((current) => current + 1);
    setAnswerVisible(false);
  }

  function toggleCardType(id: string) {
    setEnabledCardTypes((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function applyLocalReview(cardId: string, grade: Grade) {
    const reviewSummary = reviewSummaryFromGrade(grade);

    setActiveDeck((current) => (current ? updateDeckCardReviewSummary(current, cardId, reviewSummary) : current));
    setSavedDecks((current) => current.map((deck) => updateDeckCardReviewSummary(deck, cardId, reviewSummary)));
  }

  return (
    <main
      className={cn(
        "min-h-[calc(100vh-4.5rem)] bg-[#f6f6f5] text-foreground lg:grid lg:h-[calc(100vh-4.5rem)] lg:min-h-0 lg:overflow-hidden",
        sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[292px_minmax(0,1fr)]"
      )}
    >
      {toast ? (
        <div className="fixed left-1/2 top-24 z-[90] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-xl">
          {toast}
        </div>
      ) : null}

      <aside className="flex min-h-0 flex-col border-r border-border bg-background">
        <div className={cn("flex h-16 shrink-0 items-center", sidebarCollapsed ? "justify-center px-0" : "justify-between px-5")}>
          {!sidebarCollapsed ? (
            <div className="flex min-w-0 items-center gap-2 font-display text-2xl font-light tracking-normal">
              <Layers3 className="size-7" />
              <span className="truncate">学习闪卡</span>
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
            className={cn(
              "h-11 justify-center gap-2 rounded-full border border-border bg-background text-sm font-medium shadow-sm hover:bg-secondary",
              sidebarCollapsed ? "px-0" : "px-4"
            )}
            onClick={startNewDeck}
            type="button"
            variant="outline"
          >
            <Sparkles className="size-4" />
            {!sidebarCollapsed ? "新建闪卡组" : null}
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
                <span>{loadingHistory ? "正在加载" : "闪卡历史"}</span>
              </div>
              <div className="flex flex-col gap-2">
                {historyItems.map((item, index) => (
                  <button
                    className={cn(
                      "flex flex-col gap-1 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-secondary",
                      activeDeck?.id === item.id || (!activeDeck && index === 0) ? "bg-secondary text-foreground" : "text-muted-foreground"
                    )}
                    key={item.id}
                    onClick={() => void openSavedDeck(item.id)}
                    type="button"
                  >
                    <span className="line-clamp-2 font-medium text-foreground">{item.title}</span>
                    <span className="text-xs">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="min-h-0 lg:overflow-y-auto">
        <div className="grid min-h-full gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-normal">{currentStepCopy.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{currentStepCopy.panel}</p>
              </div>
              <nav className="flex flex-wrap gap-2" aria-label="闪卡流程">
                {steps.map((item, index) => (
                  <button
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
                      item.id === step
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-secondary"
                    )}
                    key={item.id}
                    onClick={() => {
                      if (item.id === "study") {
                        startStudy();
                        return;
                      }
                      setStep(item.id);
                      setGeneration(null);
                    }}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <section className="flex min-h-[620px] flex-1 flex-col rounded-2xl border border-border bg-background shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{currentStepCopy.panel}</h2>
                </div>
                <PanelActions
                  generateCards={generateCards}
                  generateMap={generateMap}
                  setStep={setStep}
                  startStudy={startStudy}
                  step={step}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {generation ? (
                  <GeneratingState rows={generation.rows} title={generation.title} />
                ) : (
                  <>
                    {step === "setup" ? (
                      <SetupContent
                        confirmedImport={confirmedImport}
                        confirmedSource={confirmedSource}
                        confirmedUpload={confirmedUpload}
                        detailRequest={detailRequest}
                        openSource={setModalSource}
                        selectedMaterial={selectedMaterial}
                        selectedRange={selectedRange}
                        selectedUnit={selectedUnit}
                        setDetailRequest={setDetailRequest}
                        setSelectedRange={setSelectedRange}
                      />
                    ) : null}
                    {step === "map" ? (
                      <KnowledgeMap
                        activeNode={activeNode}
                        cardCount={displayCards.length}
                        nodes={activeKnowledgeNodes}
                        setActiveNode={setActiveNode}
                      />
                    ) : null}
                    {step === "review" ? <ReviewCards activeCard={activeCard} cards={displayCards} setActiveCard={setActiveCard} /> : null}
                    {step === "report" ? <LearningReport cardCount={displayCards.length} studyStats={studyStats} startStudy={startStudy} /> : null}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-3 border-t border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-muted-foreground">
                  {activeDeck ? `${activeDeck.cards.length} 张闪卡 · ${activeDeck.sourceName}` : confirmedSource ? "材料已确认。" : "请先确认学习材料。"}
                </div>
                <PanelActions
                  generateCards={generateCards}
                  generateMap={generateMap}
                  setStep={setStep}
                  startStudy={startStudy}
                  step={step}
                />
              </div>
            </section>
          </div>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-6">
                <label className="flex flex-col gap-2 text-sm font-semibold">
                  <LabelWithInfo info="学习策略会影响知识抽取、卡片类型组合和复习顺序。">学习策略</LabelWithInfo>
                  <Select value={strategy} onChange={(event) => setStrategy(event.target.value as LearningFlashcardStrategy)}>
                    <option value="SUBJECT_KNOWLEDGE">学科知识</option>
                    <option value="SCIENCE_POPULARIZATION">科普材料</option>
                    <option value="DAILY_MEMORY">日常记忆</option>
                  </Select>
                </label>

                <section className="flex flex-col gap-3">
                  <LabelWithInfo info="首版以文本卡为主，听力卡等类型作为后续能力预留。">卡片类型</LabelWithInfo>
                  <div className="grid gap-2">
                    {cardTypes.map((type) => {
                      const active = enabledCardTypes.includes(type.id);

                      return (
                        <button
                          className={cn(
                            "flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-medium transition-colors",
                            active ? "border-primary/35 bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground"
                          )}
                          key={type.id}
                          onClick={() => toggleCardType(type.id)}
                          type="button"
                        >
                          <span>{type.label}</span>
                          <span
                            className={cn(
                              "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                              active ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "size-4 rounded-full bg-background shadow-sm transition-transform",
                                active ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <label className="flex flex-col gap-2 text-sm font-semibold">
                  <LabelWithInfo info="目标卡片数用于控制首批生成规模，真实生成时可继续分批追加。">目标卡片数</LabelWithInfo>
                  <Input
                    max={500}
                    min={1}
                    onChange={(event) => setTargetCardCount(clampNumber(Number(event.target.value), 1, 500))}
                    type="number"
                    value={targetCardCount}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold">
                  每日学习目标
                  <Select defaultValue="30">
                    <option value="20">20 分钟</option>
                    <option value="30">30 分钟</option>
                    <option value="45">45 分钟</option>
                    <option value="60">60 分钟</option>
                  </Select>
                </label>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {modalSource === "textbook" ? (
        <TextbookModal
          filters={filters}
          gradeOptions={gradeOptions}
          loading={loadingTextbooks}
          materials={filteredMaterials}
          onClose={() => setModalSource(null)}
          onConfirm={confirmTextbookSource}
          onFilterChange={updateFilter}
          pendingMaterialId={pendingMaterialId}
          pendingMaterialTitle={pendingMaterial.title}
          setPendingMaterialId={setPendingMaterialId}
          subjectOptions={subjectOptions}
          total={textbookTotal}
          versionOptions={versionOptions}
        />
      ) : null}
      {modalSource === "upload" ? <UploadModal onClose={() => setModalSource(null)} onConfirm={confirmUploadSource} /> : null}
      {modalSource === "import" ? <ImportModal onClose={() => setModalSource(null)} onConfirm={confirmImportSource} /> : null}
      {step === "study" ? (
        <StudyOverlay
          answerVisible={answerVisible}
          gradeCard={gradeCard}
          cards={activeStudyCards}
          setAnswerVisible={setAnswerVisible}
          setStep={setStep}
          studyIndex={studyIndex}
        />
      ) : null}
    </main>
  );
}

export function LearningFlashcardStudyPage({
  courseId,
  courseRevisionItemId,
  deckId
}: {
  courseId?: string;
  courseRevisionItemId?: string;
  deckId: string;
}) {
  const router = useRouter();
  const [deck, setDeck] = useState<LearningFlashcardDeck | null>(null);
  const [studyQueue, setStudyQueue] = useState<DisplayFlashcard[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [studyStats, setStudyStats] = useState<Record<Grade, number>>({ hard: 0, blurry: 0, mastered: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "report" | "error">("loading");
  const [message, setMessage] = useState("");
  const gradingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDeck() {
      setStatus("loading");
      try {
        const result = await getLearningFlashcardDeck(deckId);

        if (cancelled) {
          return;
        }

        setDeck(result);
        setStudyQueue(orderFlashcardsForStudy(result.cards));
        setStudyIndex(0);
        setAnswerVisible(false);
        setStudyStats({ hard: 0, blurry: 0, mastered: 0 });
        setStatus(result.cards.length > 0 ? "ready" : "error");
        if (result.cards.length === 0) {
          setMessage("这个闪卡组还没有可学习的卡片。");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "闪卡组暂不可用。");
          setStatus("error");
        }
      }
    }

    void loadDeck();

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  useEffect(() => {
    if (!deck) return;
    const context = {
      isLearning: true,
      ...(courseId ? { courseId } : {}),
      ...(courseRevisionItemId ? { courseRevisionItemId } : {}),
      materialType: "LEARNING_FLASHCARD" as const,
      materialId: deck.id,
      partKey: "FLASHCARD_ROUND"
    };
    const timer = window.setTimeout(() => {
      publishLearningContext(context);
      publishLearningEvent({ type: "MATERIAL_STARTED", partKey: "FLASHCARD_ROUND" });
    });
    return () => {
      window.clearTimeout(timer);
      publishLearningContext({ isLearning: false });
    };
  }, [courseId, courseRevisionItemId, deck]);

  function startStudy() {
    const cards = deck?.cards ?? [];

    setStudyQueue(orderFlashcardsForStudy(cards));
    setStudyIndex(0);
    setAnswerVisible(false);
    setStudyStats({ hard: 0, blurry: 0, mastered: 0 });
    setStatus(cards.length > 0 ? "ready" : "error");
    if (cards.length === 0) {
      setMessage("这个闪卡组还没有可学习的卡片。");
    }
  }

  async function gradeCard(grade: Grade) {
    if (gradingRef.current) return;
    const card = studyQueue[studyIndex % Math.max(1, studyQueue.length)];
    if (!card?.id) return;

    gradingRef.current = true;
    try {
      const review = await reviewLearningFlashcard(card.id, apiGradeFromUiGrade(grade));
      publishLearningEvent({
        type: "FLASHCARD_REVIEWED",
        partKey: "FLASHCARD_ROUND",
        reviewId: review.id
      });
      const reviewSummary = reviewSummaryFromGrade(grade);
      setDeck((current) => (current ? updateDeckCardReviewSummary(current, card.id as string, reviewSummary) : current));
      setStudyStats((current) => ({ ...current, [grade]: current[grade] + 1 }));
      setMessage("");
    } catch {
      setMessage("复习反馈暂未保存，请重试。");
      return;
    } finally {
      gradingRef.current = false;
    }

    if (studyIndex >= studyQueue.length - 1) {
      setStatus("report");
      return;
    }

    setStudyIndex((current) => current + 1);
    setAnswerVisible(false);
  }

  if (status === "loading") {
    return <FlashcardStudyState title="正在加载闪卡" />;
  }

  if (status === "error") {
    return (
      <FlashcardStudyState title={message || "闪卡组暂不可用"}>
        <Button onClick={() => router.push("/flashcard")} type="button">
          返回闪卡
        </Button>
      </FlashcardStudyState>
    );
  }

  if (status === "report") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f6f5] px-4 py-8 text-foreground">
        <div className="w-full max-w-5xl">
          <LearningReport cardCount={studyQueue.length} startStudy={startStudy} studyStats={studyStats} />
          {message ? <div className="mt-4 text-center text-sm text-muted-foreground">{message}</div> : null}
          <div className="mt-5 flex justify-center">
            <Button onClick={() => router.push("/flashcard")} type="button" variant="outline">
              返回闪卡
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <StudyOverlay
      answerVisible={answerVisible}
      cards={studyQueue}
      gradeCard={gradeCard}
      setAnswerVisible={setAnswerVisible}
      setStep={() => router.push("/flashcard")}
      studyIndex={studyIndex}
    />
  );
}

function FlashcardStudyState({ children, title }: { children?: ReactNode; title: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#f6f6f5] px-4 text-center text-foreground">
      <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Layers3 className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
      {children}
    </main>
  );
}

function PanelActions({
  generateCards,
  generateMap,
  setStep,
  startStudy,
  step
}: {
  generateCards: () => void;
  generateMap: () => void;
  setStep: (step: StepId) => void;
  startStudy: () => void;
  step: StepId;
}) {
  if (step === "map") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setStep("setup")} type="button" variant="outline">
          返回选材
        </Button>
        <Button onClick={generateCards} type="button">
          <Sparkles />
          生成闪卡
        </Button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setStep("map")} type="button" variant="outline">
          看知识地图
        </Button>
        <Button onClick={startStudy} type="button">
          <Play />
          开始学习
        </Button>
      </div>
    );
  }

  if (step === "report") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setStep("setup")} type="button" variant="outline">
          <RotateCcw />
          再生成一组
        </Button>
        <Button onClick={startStudy} type="button">
          继续复习
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={generateMap} type="button">
      <Brain />
      生成知识地图
    </Button>
  );
}

function SetupContent({
  confirmedImport,
  confirmedSource,
  confirmedUpload,
  detailRequest,
  openSource,
  selectedMaterial,
  selectedRange,
  selectedUnit,
  setDetailRequest,
  setSelectedRange
}: {
  confirmedImport: { importText: string; sourceName: string; title: string } | null;
  confirmedSource: SourceId | null;
  confirmedUpload: { sourceName: string; sourceText: string } | null;
  detailRequest: string;
  openSource: (source: SourceId) => void;
  selectedMaterial: LearningMaterial;
  selectedRange: string;
  selectedUnit: { desc: string; id: string; title: string } | null;
  setDetailRequest: (value: string) => void;
  setSelectedRange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        {sourceOptions.map(({ icon: Icon, id, title }) => (
          <button
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border px-4 text-left transition-colors hover:border-primary/35 hover:bg-secondary",
              (confirmedSource ?? "textbook") === id ? "border-primary/35 bg-primary/5" : "border-border bg-card"
            )}
            key={id}
            onClick={() => openSource(id)}
            type="button"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
              <Icon className="size-4" />
            </span>
            <span className="font-semibold">{title}</span>
          </button>
        ))}
      </div>

      {confirmedSource === "textbook" ? (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 gap-4">
                <BookCover lines={selectedMaterial.coverLines} />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{selectedMaterial.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedMaterial.meta}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedMaterial.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={() => openSource("textbook")} type="button" variant="outline">
                更换教材
              </Button>
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-border bg-background p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              <LabelWithInfo info="默认使用整册教材；选择任意单元后，将只处理对应单元。">单元选择</LabelWithInfo>
              <Select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>
                <option value="book">整册教材</option>
                {selectedMaterial.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.title}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal text-muted-foreground">
                {selectedRange === "book" ? "整册教材" : selectedUnit?.desc ?? "指定单元"}
              </span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              具体需求
              <Input
                onChange={(event) => setDetailRequest(event.target.value)}
                placeholder="例如：需要背诵的部分"
                value={detailRequest}
              />
            </label>
          </section>
        </>
      ) : null}

      {confirmedSource === "upload" ? (
        <ConfirmedSourceCard
          badge="已确认"
          icon={FileUp}
          meta={`${confirmedUpload?.sourceText.length ?? 0} 字 · 已确认`}
          onChange={() => openSource("upload")}
          title={confirmedUpload?.sourceName || "上传材料"}
        />
      ) : null}

      {confirmedSource === "import" ? (
        <ConfirmedSourceCard
          badge="可清洗"
          icon={Import}
          meta={`${confirmedImport?.importText.split(/\r?\n/).filter(Boolean).length ?? 0} 行 · 已确认`}
          onChange={() => openSource("import")}
          title={confirmedImport?.title || "导入闪卡组"}
        />
      ) : null}

      {!confirmedSource ? (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center text-sm text-muted-foreground">
          确认后的教材、上传材料或导入卡组会出现在这里。
        </div>
      ) : null}
    </div>
  );
}

function ConfirmedSourceCard({
  badge,
  icon: Icon,
  meta,
  onChange,
  title
}: {
  badge: string;
  icon: LucideIcon;
  meta: string;
  onChange: () => void;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
            <Badge className="mt-3" variant="outline">
              {badge}
            </Badge>
          </div>
        </div>
        <Button onClick={onChange} type="button" variant="outline">
          更换
        </Button>
      </div>
    </section>
  );
}

function KnowledgeMap({
  activeNode,
  cardCount,
  nodes,
  setActiveNode
}: {
  activeNode: string;
  cardCount: number;
  nodes: Array<{ desc: string; id: string; title: string }>;
  setActiveNode: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="核心知识单元" value={String(nodes.length)} />
        <Metric label="建议首批闪卡" value={String(cardCount)} />
        <Metric label="首轮学习预计" value="24 分钟" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-3">
          {nodes.map((node) => (
            <button
              className={cn(
                "rounded-xl border p-4 text-left transition-colors hover:border-primary/35 hover:bg-secondary",
                node.id === activeNode ? "border-primary/40 bg-primary/5" : "border-border bg-card"
              )}
              key={node.id}
              onClick={() => setActiveNode(node.id)}
              type="button"
            >
              <h3 className="font-semibold">{node.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{node.desc}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <ProgressRow label="词汇短语" value={82} />
          <ProgressRow label="语法句型" tone="green" value={64} />
          <ProgressRow label="易错辨析" tone="orange" value={48} />
          <ProgressRow label="阅读语境" value={58} />
          <div className="mt-2 rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            确认优先级后再生成闪卡。
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewCards({
  activeCard,
  cards,
  setActiveCard
}: {
  activeCard: number;
  cards: DisplayFlashcard[];
  setActiveCard: (index: number) => void;
}) {
  const card = cards[activeCard] ?? cards[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="grid gap-3">
        {cards.map((item, index) => (
          <button
            className={cn(
              "rounded-xl border p-3 text-left transition-colors hover:border-primary/35 hover:bg-secondary",
              index === activeCard ? "border-primary/40 bg-primary/5" : "border-border bg-card"
            )}
            key={item.id ?? item.front}
            onClick={() => setActiveCard(index)}
            type="button"
          >
            <Badge variant={index % 2 ? "secondary" : "outline"}>{item.type}</Badge>
            <h3 className="mt-3 text-sm font-semibold">{item.front}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{item.source}</p>
          </button>
        ))}
      </div>
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center">
        <Badge variant="outline">{card.type}</Badge>
        <div className="mt-8 text-4xl font-semibold tracking-normal">{card.front}</div>
        <div className="mt-8 max-w-xl rounded-xl border border-border bg-background p-5 text-base leading-8 text-muted-foreground">
          {card.back}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Badge variant="muted">来源：{card.source}</Badge>
          <Badge variant="outline">可编辑</Badge>
          <Badge variant="outline">可导出</Badge>
        </div>
      </div>
    </div>
  );
}

function LearningReport({
  cardCount,
  startStudy,
  studyStats
}: {
  cardCount: number;
  startStudy: () => void;
  studyStats: Record<Grade, number>;
}) {
  const reviewedCount = studyStats.hard + studyStats.blurry + studyStats.mastered;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="size-6" />
        </div>
        <h3 className="mt-5 text-2xl font-semibold tracking-normal">本轮完成 {reviewedCount} 张闪卡</h3>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric label="已掌握" value={String(studyStats.mastered)} />
          <Metric label="待巩固" value={String(studyStats.hard + studyStats.blurry)} />
          <Metric label="卡组总量" value={String(cardCount)} />
        </div>
        <Button className="mt-6" onClick={startStudy} type="button">
          继续复习
        </Button>
      </section>
      <section className="grid gap-3">
        <Insight label="本轮反馈" value={`不会 ${studyStats.hard} · 模糊 ${studyStats.blurry} · 掌握 ${studyStats.mastered}`} />
        <Insight label="最需要巩固" value="excited / exciting、第三人称单数、classmate 拼写" />
        <Insight label="明日建议" value="先复习 Unit 1 高频词，再进入 Unit 2 运动主题词组" />
      </section>
    </div>
  );
}

function StudyOverlay({
  answerVisible,
  cards,
  gradeCard,
  setAnswerVisible,
  setStep,
  studyIndex
}: {
  answerVisible: boolean;
  cards: DisplayFlashcard[];
  gradeCard: (grade: Grade) => void;
  setAnswerVisible: (visible: boolean) => void;
  setStep: (step: StepId) => void;
  studyIndex: number;
}) {
  const card = cards[studyIndex % Math.max(1, cards.length)] ?? flashcards[0];

  return (
    <div className="fixed inset-0 z-[80] flex min-h-screen flex-col bg-[#f6f6f5] text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-8">
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <span>
            {studyIndex + 1} / {cards.length}
          </span>
          <span>{card.type}</span>
        </div>
        <Button onClick={() => setStep("review")} type="button" variant="ghost">
          <X />
          退出
        </Button>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 pb-36 md:px-8">
        <button
          className="flex min-h-[430px] w-full max-w-3xl flex-col items-center justify-center rounded-2xl border border-border bg-background px-6 py-10 text-center shadow-sm"
          onClick={() => setAnswerVisible(true)}
          type="button"
        >
          <Badge variant="outline">{card.type}</Badge>
          <div className="mt-10 text-4xl font-semibold tracking-normal md:text-6xl">{card.front}</div>
          {answerVisible ? (
            <div className="mt-10 max-w-2xl rounded-xl border border-border bg-secondary/50 p-5 text-base leading-8 text-muted-foreground md:text-lg">
              {card.back}
            </div>
          ) : (
            <div className="mt-10 text-sm text-muted-foreground">点击卡片查看答案</div>
          )}
        </button>
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-[81] border-t border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
        {answerVisible ? (
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-3">
            <button
              className="h-14 rounded-full border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 md:h-16 md:text-base"
              onClick={() => gradeCard("hard")}
              type="button"
            >
              我不会
            </button>
            <button
              className="h-14 rounded-full border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 md:h-16 md:text-base"
              onClick={() => gradeCard("blurry")}
              type="button"
            >
              有点模糊
            </button>
            <button
              className="h-14 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 md:h-16 md:text-base"
              onClick={() => gradeCard("mastered")}
              type="button"
            >
              我掌握了
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <Button className="h-14 w-full md:h-16" onClick={() => setAnswerVisible(true)} type="button">
              查看答案
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}

function TextbookModal({
  filters,
  gradeOptions,
  loading,
  materials: materialOptions,
  onClose,
  onConfirm,
  onFilterChange,
  pendingMaterialId,
  pendingMaterialTitle,
  setPendingMaterialId,
  subjectOptions,
  total,
  versionOptions
}: {
  filters: { grade: string; subject: string; version: string };
  gradeOptions: string[];
  loading: boolean;
  materials: readonly LearningMaterial[];
  onClose: () => void;
  onConfirm: () => void;
  onFilterChange: (key: "grade" | "subject" | "version", value: string) => void;
  pendingMaterialId: string;
  pendingMaterialTitle: string;
  setPendingMaterialId: (id: string) => void;
  subjectOptions: string[];
  total: number;
  versionOptions: string[];
}) {
  return (
    <ModalFrame onClose={onClose} title="选择电子教材">
      <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              学科
              <Select value={filters.subject} onChange={(event) => onFilterChange("subject", event.target.value)}>
                {subjectOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              版本
              <Select value={filters.version} onChange={(event) => onFilterChange("version", event.target.value)}>
                <option value="">全部版本</option>
                {versionOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              年级
              <Select value={filters.grade} onChange={(event) => onFilterChange("grade", event.target.value)}>
                <option value="">全部年级</option>
                {gradeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </aside>
        <div className="grid max-h-[56vh] gap-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在加载教材
            </div>
          ) : materialOptions.length > 0 ? (
            materialOptions.map((material) => (
              <button
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:border-primary/35 hover:bg-secondary",
                  material.id === pendingMaterialId ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                )}
                key={material.id}
                onClick={() => setPendingMaterialId(material.id)}
                type="button"
              >
                <div className="flex gap-4">
                  <BookCover lines={material.coverLines} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{material.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{material.meta}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {material.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {material.id === pendingMaterialId ? <CheckCircle2 className="size-5 shrink-0 text-primary" /> : null}
                </div>
              </button>
            ))
          ) : (
            <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-card px-5 text-center text-sm text-muted-foreground">
              没有找到匹配教材
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">{materialOptions.length > 0 ? `当前选中：${pendingMaterialTitle} · 共 ${total} 本` : `共 ${total} 本`}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={loading || materialOptions.length === 0} onClick={onConfirm} type="button">
            确认使用教材
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}

function UploadModal({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (input: { sourceName: string; sourceText: string }) => void;
}) {
  const [sourceName, setSourceName] = useState("七年级英语期中复习讲义");
  const [sourceText, setSourceText] = useState(sampleUploadText);

  return (
    <ModalFrame maxWidth="max-w-xl" onClose={onClose} title="上传材料">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          材料名称
          <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          材料文本
          <Textarea
            className="min-h-56"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onClose} type="button" variant="outline">
          取消
        </Button>
        <Button onClick={() => onConfirm({ sourceName, sourceText })} type="button">
          确认使用材料
        </Button>
      </div>
    </ModalFrame>
  );
}

function ImportModal({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (input: { importText: string; sourceName: string; title: string }) => void;
}) {
  const [title, setTitle] = useState("初中英语词组闪卡");
  const [sourceName, setSourceName] = useState("CSV 导入");
  const [importText, setImportText] = useState(sampleImportText);

  return (
    <ModalFrame maxWidth="max-w-xl" onClose={onClose} title="导入闪卡">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          卡组名称
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          来源名称
          <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          导入内容
          <Textarea
            className="min-h-56"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onClose} type="button" variant="outline">
          取消
        </Button>
        <Button onClick={() => onConfirm({ title, sourceName, importText })} type="button">
          确认导入卡组
        </Button>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  maxWidth = "max-w-5xl",
  onClose,
  title
}: {
  children: ReactNode;
  maxWidth?: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6">
      <div className={cn("flex max-h-[86vh] w-full flex-col rounded-2xl border border-border bg-background p-5 shadow-xl", maxWidth)}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
          <Button aria-label="关闭弹窗" className="size-9 px-0" onClick={onClose} type="button" variant="ghost">
            <X />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function GeneratingState({ rows, title }: { rows: string[]; title: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 text-base font-semibold">
          <Loader2 className="size-5 animate-spin text-primary" />
          {title}
        </div>
        <div className="mt-5 grid gap-3">
          {rows.map((row) => (
            <div className="flex items-center gap-3 rounded-lg bg-background px-4 py-3 text-sm text-muted-foreground" key={row}>
              <span className="size-2 rounded-full bg-primary" />
              <span>{row}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookCover({ lines }: { lines: readonly string[] }) {
  return (
    <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-[#2f66d0] text-center text-sm font-semibold leading-5 text-white shadow-sm">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

function LabelWithInfo({ children, info }: { children: ReactNode; info: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{children}</span>
      <InfoHint text={info} />
    </span>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <button
      aria-label="查看说明"
      className="group relative inline-flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus:text-foreground"
      type="button"
    >
      <Info className="size-4" />
      <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs font-medium leading-5 text-popover-foreground shadow-xl group-hover:block group-focus:block">
        {text}
      </span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-2xl font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function ProgressRow({ label, tone = "blue", value }: { label: string; tone?: "blue" | "green" | "orange"; value: number }) {
  const fillClass = tone === "green" ? "bg-emerald-500" : tone === "orange" ? "bg-amber-500" : "bg-primary";

  return (
    <div className="grid grid-cols-[90px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
      <span className="font-medium">{label}</span>
      <span className="h-2 rounded-full bg-secondary">
        <span className={cn("block h-2 rounded-full", fillClass)} style={{ width: `${value}%` }} />
      </span>
      <strong className="text-right">{value}%</strong>
    </div>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{value}</div>
    </div>
  );
}

function toLearningMaterial(textbook: PublicTextbookListItem): LearningMaterial {
  return {
    id: textbook.id,
    title: textbook.title,
    subject: textbook.subject,
    version: textbook.version,
    grade: textbook.grade,
    volumeName: textbook.volumeName,
    coverLines: [textbook.subject.slice(0, 4) || "教材", shortVolumeName(textbook.volumeName || textbook.grade)],
    meta: `${textbook.version} · ${textbook.hasMarkdownContent ? "Markdown 已就绪" : "待处理"}`,
    tags: [textbook.subject, textbook.version, textbook.grade, textbook.hasMarkdownContent ? "可生成" : "待处理"].filter(Boolean),
    units: defaultTextbookUnits(textbook.subject),
    hasMarkdownContent: textbook.hasMarkdownContent
  };
}

function defaultTextbookUnits(subject: string): LearningMaterialUnit[] {
  if (subject === "英语") {
    return Array.from({ length: 8 }, (_, index) => ({
      id: `Unit ${index + 1}`,
      title: `Unit ${index + 1}`,
      desc: "按教材 Markdown 标题匹配"
    }));
  }

  return Array.from({ length: 8 }, (_, index) => ({
    id: `第${index + 1}单元`,
    title: `第${index + 1}单元`,
    desc: "按教材 Markdown 标题匹配"
  }));
}

function orderFlashcardsForStudy(cards: DisplayFlashcard[]) {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const priorityDiff = flashcardStudyPriority(left.card) - flashcardStudyPriority(right.card);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return (left.card.sortOrder ?? left.index) - (right.card.sortOrder ?? right.index) || left.index - right.index;
    })
    .map(({ card }) => card);
}

function flashcardStudyPriority(card: DisplayFlashcard) {
  const state = latestReviewState(card.reviewSummary);

  if (state === "hard") {
    return 0;
  }

  if (state === "blurry") {
    return 1;
  }

  if (state === "mastered") {
    return 3;
  }

  return 2;
}

function latestReviewState(summary?: LearningFlashcardReviewSummary): Grade | "new" {
  if (!summary) {
    return "new";
  }

  if (summary.hard > 0) {
    return "hard";
  }

  if (summary.blurry > 0) {
    return "blurry";
  }

  if (summary.mastered > 0) {
    return "mastered";
  }

  return "new";
}

function updateDeckCardReviewSummary(deck: LearningFlashcardDeck, cardId: string, reviewSummary: LearningFlashcardReviewSummary) {
  let updated = false;
  const cards = deck.cards.map((card) => {
    if (card.id !== cardId) {
      return card;
    }

    updated = true;
    return {
      ...card,
      reviewSummary
    };
  });

  if (!updated) {
    return deck;
  }

  return {
    ...deck,
    cards,
    reviewSummary: summarizeCardReviewSummaries(cards)
  };
}

function summarizeCardReviewSummaries(cards: Array<{ reviewSummary?: LearningFlashcardReviewSummary }>): LearningFlashcardReviewSummary {
  return cards.reduce<LearningFlashcardReviewSummary>(
    (summary, card) => {
      const state = latestReviewState(card.reviewSummary);

      if (state === "hard") {
        summary.hard += 1;
      } else if (state === "blurry") {
        summary.blurry += 1;
      } else if (state === "mastered") {
        summary.mastered += 1;
      }

      return summary;
    },
    { hard: 0, blurry: 0, mastered: 0 }
  );
}

function reviewSummaryFromGrade(grade: Grade): LearningFlashcardReviewSummary {
  return {
    hard: grade === "hard" ? 1 : 0,
    blurry: grade === "blurry" ? 1 : 0,
    mastered: grade === "mastered" ? 1 : 0
  };
}

function flashcardStudyHref(deckId: string) {
  return `/flashcard/${encodeURIComponent(deckId)}`;
}

function apiGradeFromUiGrade(grade: Grade): LearningFlashcardReviewGrade {
  if (grade === "hard") {
    return "HARD";
  }

  if (grade === "blurry") {
    return "BLURRY";
  }

  return "MASTERED";
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function shortVolumeName(value: string) {
  return value.replace("年级", "").replace("上册", "上").replace("下册", "下").slice(0, 4) || "教材";
}

const sampleUploadText = [
  "七年级英语期中复习讲义",
  "be good at 表示擅长，后面接名词或动名词。",
  "classmate 表示同班同学，注意不要写成 class mate。",
  "一般现在时中，主语为第三人称单数时，动词通常加 s 或 es。",
  "excited 描述人的感受，exciting 描述事物令人兴奋。"
].join("\n");

const sampleImportText = [
  "be good at,擅长。后面接名词或动名词。,词义卡,Unit 1,短语|重点",
  "classmate,同班同学，是一个单词。,拼写卡,Unit 1,拼写",
  "excited vs exciting,excited 描述人的感受，exciting 描述事物令人兴奋。,辨析卡,Unit 1,易错"
].join("\n");
