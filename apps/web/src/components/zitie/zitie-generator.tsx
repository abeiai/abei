"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction
} from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Grid3X3,
  Layers3,
  Loader2,
  Maximize2,
  MoreHorizontal,
  MoveVertical,
  Pencil,
  Printer,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  containsCnsPua,
  containsCnsSupplement,
  encodeTextForFont,
  isCnsBaseFontName,
  isCnsExtBFontName,
  isCnsPuaFontName,
  type CopybookFontEncoding
} from "./cns-pua-encoding";
import { bottomAnchoredTextOffsetY } from "./bottom-anchored-text";
import {
  copybookGenerateDialog,
  copybookPreviewMode,
  copybookPricingForPages
} from "./copybook-pricing";
import { buildEightLinePages, tokenizeEightLineInput } from "./eight-line-layout";
import {
  buildNameLabelSheetGeometry,
  centimetersToPoints,
  clampSteppedNumber,
  nameLabelPageMarginPresets,
  nameLabelPageMarginsToPoints,
  paginateNameLabelGroups,
  parseNameLabelGroups,
  splitNameLabelFieldLine,
  type NameLabelBorderStyle,
  type NameLabelColumnsMode,
  type NameLabelPageMarginPreset,
  type NameLabelSeparatorMode,
  type NameLabelTextLayout
} from "./name-label-layout";
import {
  createNameLabelRecordSourceConfig,
  defaultNameLabelOptions,
  parseNameLabelRecordSourceConfig,
  type NameLabelOptions
} from "./name-label-record";
import { NameLabelRosterDialog } from "./name-label-roster-dialog";
import {
  formatNameLabelRosterInput,
  paginateNameLabelRosterGroups,
  parseNameLabelRosterText,
  type NameLabelRosterEntry
} from "./name-label-roster";
import {
  exampleCountsForMode,
  practiceModesForTemplate,
  type PracticeLineMode
} from "./practice-mode";
import { wrapRuledPaperLines, type RuledPaperLineLayout } from "./ruled-paper-wrap";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

type GridType = "tianzi" | "hui" | "fang" | "rizhi" | "line";
type ContentStyle = "trace" | "copy" | "hybrid";
type InputMode = "copybook" | "pinyin";
type PaperSize = "A4" | "B5";
type CopybookTheme = "green-red" | "green-black" | "red-black";
type CopybookFontType = "kaiti" | "source-han-serif" | "serif" | "custom";
type PageNumberPosition = "hidden" | "bottom-center" | "bottom-right";
type PageNumberFormat = "number-only" | "fraction" | "full";
type WorksheetTitleFont = "copybook" | "kaiti" | "songti" | "heiti";
type WatermarkPosition = "center" | "spread-top-right" | "spread-bottom-right";

interface WatermarkOptions {
  text: {
    font: WorksheetTitleFont;
    fontSize: number;
    visible: boolean;
    value: string;
  };
  image: {
    height: number;
    visible: boolean;
    src: string;
    name: string;
  };
  position: WatermarkPosition;
  gray: number;
}

interface WorksheetFieldConfig {
  visible: boolean;
  value: string;
}

interface WorksheetOptions {
  showTitle: boolean;
  title: string;
  titleStyle: {
    color: string;
    font: WorksheetTitleFont;
    fontSize: number;
  };
  studentFields: {
    school: WorksheetFieldConfig;
    name: WorksheetFieldConfig;
    className: WorksheetFieldConfig;
    studentNumber: WorksheetFieldConfig;
  };
  pageNumberPosition: PageNumberPosition;
  pageNumberFormat: PageNumberFormat;
  showFooter: boolean;
  footerStyle: {
    color: string;
    font: WorksheetTitleFont;
    fontSize: number;
  };
  footer: string;
}

interface CopybookLayout {
  page: {
    width: number;
    height: number;
    margin: number;
  };
  worksheet: {
    title: string;
    footer: string;
    showStudentFields: boolean;
    showTitle?: boolean;
    titleStyle?: WorksheetOptions["titleStyle"];
    showFooter?: boolean;
    footerStyle?: WorksheetOptions["footerStyle"];
    studentFields?: WorksheetOptions["studentFields"];
    pageNumber?: {
      visible: boolean;
      position: Exclude<PageNumberPosition, "hidden">;
      text: string;
    };
  };
  grid: {
    type: GridType;
    variant?: "ruled" | "calligraphy" | "pinyin-tian" | "eight-line";
    visible?: boolean;
    cell: number;
    cellWidth: number;
    cellHeight: number;
    rowGap: number;
    rows: number;
    cols: number;
    x: number;
    y: number;
  };
  content: Array<{
    text: string;
    pinyin?: string;
    pinyinOptions?: string[];
    pinyinSelected?: boolean;
    pinyinKey?: string;
    pinyinChar?: string;
    pinyinX?: number;
    pinyinY?: number;
    x: number;
    y: number;
    repeat: number;
    style: ContentStyle;
    align?: "left" | "center";
    darkExampleCount?: number;
    traceExampleCount?: number;
    preserveSpace?: boolean;
    baselineOffsetRatio?: number;
    fitWidth?: number;
    letterSpacing?: number;
    clipId?: string;
    clipX?: number;
    clipY?: number;
    clipWidth?: number;
    clipHeight?: number;
    textOffsetX?: number;
    textOffsetY?: number;
    verticalAlign?: "middle";
    contentCellHeight?: number;
    maxFontSize?: number;
  }>;
  strokeGlyphs?: Record<string, StrokeGlyph>;
  strokePracticeRows?: StrokePracticeRowLayout[];
  watermark?: WatermarkOptions | null;
  nameLabelSheet?: NameLabelSheetLayout;
  style: {
    strokeColor: string;
    guideColor: string;
    textColor: string;
    traceColor?: string;
    font: CopybookFontType;
    customFontFamily?: string;
    customFontUrl?: string;
    customFontPreviewUrl?: string;
    customFontFallbackFamily?: string;
    customFontFallbackUrl?: string;
    customFontFallbackPreviewUrl?: string;
    fontEncoding?: CopybookFontEncoding;
    fontSize: number;
    pinyinFontFamily?: string;
    pinyinFontUrl?: string;
    pinyinFontPreviewUrl?: string;
    pinyinFontSize: number;
  };
}

interface CopybookLayoutDocument {
  pages: CopybookLayout[];
}

type CopybookRenderLayout = CopybookLayout | CopybookLayoutDocument;

interface StrokeGlyph {
  character: string;
  strokes: string[];
  medians?: unknown[];
}

interface HanziStrokeData extends StrokeGlyph {
  pinyin: string[];
  radical: string;
  strokeCount: number;
}

interface StrokePracticeRowLayout {
  type: "stroke-practice-row";
  blank?: boolean;
  char: string;
  pinyin: string;
  pinyinOptions: string[];
  pinyinSelected: boolean;
  pinyinKey: string;
  radical: string;
  strokeCount: number | null;
  x: number;
  y: number;
  width: number;
  header: {
    height: number;
    metaWidth: number;
    wrapStrokeStrip?: boolean;
    background: string;
    borderColor: string;
  };
  practice: {
    cellSize: number;
    cellCount: number;
    darkExampleCount: number;
    traceExampleCount: number;
    textOffsetY?: number;
  };
  style: {
    borderColor: string;
    guideLineColor: string;
    darkFill: string;
    traceFill: string;
  };
  strokeRef: string;
}

interface NameLabelSheetLayout {
  x: number;
  y: number;
  labelWidth: number;
  labelHeight: number;
  horizontalGap: number;
  verticalGap: number;
  rows: number;
  columns: number;
  padding: number;
  horizontalPadding: number;
  lineHeight: number;
  textLayout: NameLabelTextLayout;
  showUnderline: boolean;
  labels: Array<{ lines: string[] }>;
  backgroundImage: {
    src: string;
    name: string;
  };
  border: {
    visible: boolean;
    style: NameLabelBorderStyle;
    color: string;
    width: number;
    radius: number;
    innerColor: string;
    innerWidth: number;
    innerRadius: number;
    innerInset: number;
  };
}

interface PublicCopybookFont {
  id: string;
  name: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  ownerType?: "ADMIN" | "USER";
  suitableTemplates: string[];
  sortOrder?: number;
  updatedAt: string;
}

interface CopybookRecord {
  id: string;
  templateId: string;
  templateName: string;
  contentPreview: string;
  pdfUrl: string;
  pdfFilename: string;
  pdfSize: number;
  credits: number;
  pageCount: number;
  hasSourceConfig: boolean;
  createdAt: string;
}

interface SelectedFontConfig {
  font: CopybookFontType;
  customFontFamily?: string;
  customFontUrl?: string;
  customFontPreviewUrl?: string;
  customFontFallbackFamily?: string;
  customFontFallbackUrl?: string;
  customFontFallbackPreviewUrl?: string;
  fontEncoding?: CopybookFontEncoding;
}

interface PinyinPickerState {
  key: string;
  char: string;
  options: string[];
  x: number;
  y: number;
}

interface TemplateOption {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "red" | "green" | "blue" | "orange" | "purple" | "brown" | "cyan" | "gray";
  text: string;
  pinyin: string;
  gridType: GridType;
  contentStyle: ContentStyle;
  inputMode: InputMode;
  practiceLineMode?: PracticeLineMode;
}

type FontPickerOption =
  | {
      font: Exclude<CopybookFontType, "custom">;
      id: string;
      label: string;
      type: "built-in";
    }
  | {
      font: PublicCopybookFont;
      id: string;
      label: string;
      type: "custom";
    };
type FontPickerFilter = "chinese" | "english" | "mine";

const paperSizes: Record<PaperSize, CopybookLayout["page"]> = {
  A4: {
    width: 595,
    height: 842,
    margin: 40
  },
  B5: {
    width: 499,
    height: 709,
    margin: 36
  }
};
const cell = 38;
const cols = 10;
const pinyinCols = 6;
const pinyinCellWidth = 76;
const pinyinCellHeight = 38;
const pinyinRowGap = 16;
const pinyinTianCols = 10;
const pinyinTianHeaderHeight = 18;
const pinyinTianRowGap = 10;
const englishWordCols = 4;
const englishLetterCols = 10;
const englishRowGap = 16;
const numberCols = 12;
const numberRowGap = 18;
const huiRowGap = 16;
const calligraphyCols = 3;
const essayCols = 15;
const essayCellHeightRatio = 0.78;
const essayRowGap = 6;
const essayMaxFontSizeRatio = 1;
const ruledLineHeightByPaper: Record<PaperSize, number> = {
  A4: 28,
  B5: 25
};
const ruledLineTextMaxFontSizeRatio = 1;
const pinyinMiddleTopRatio = 0.34;
const pinyinMiddleBottomRatio = 0.66;
const pinyinXHeightRatio = 0.545;
const verticalMiddleBaselineOffsetRatio = 0.46;
const calligraphyMiddleBaselineOffsetRatio = 0.34;
const huiMiddleBaselineOffsetRatio = 0.36;
const pinyinTianMiddleBaselineOffsetRatio = 0.36;
const strokeMetaLabelFontSize = 10;
const strokeMetaValueFontSize = 15;
const sourceHanSerifFontFamily = "Songti SC, Source Han Serif, serif";
const sourceHanSansFontFamily = "Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif";
const strokeStepSize = 13;
const strokeStepGap = 3;
const strokeStepLabelWidth = 24;
const strokeStepLabelGap = 8;
const strokeStepPaddingX = 8;
const strokeStepWrapLineHeight = 24;
const strokeStepWrapThreshold = 12;
const maxTextLength = 50_000;
const maxTraceCount = 6;
const fontPreviewChineseText = "天地玄黄，宇宙洪荒。";
const fontPreviewEnglishText = "Dream big and act.";
const fontUploadTemplates = [
  "shengzi",
  "pinyin",
  "pinyin-tian",
  "english",
  "number",
  "essay",
  "calligraphy",
  "huizi",
  "line",
  "eight-line",
  "name-label"
];
const userUploadedFontsStorageKey = "xueleai:zitie:user-uploaded-fonts";
const favoriteFontsStorageKey = "xueleai:zitie:favorite-fonts";
const centeredPopoverPadding = 16;
const previewZoomMin = 0.25;
const previewZoomMax = 2.5;
const previewZoomStep = 0.12;
const previewZoomDefault = 1 + previewZoomStep * 4;
const shengziDefaultText = "天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳";
const nameLabelDefaultText = "姓名：张小乐\n班级：三年级2班\n学号：18";
const practiceLineModes: Record<PracticeLineMode, string> = {
  sample: "示范",
  word: "逐字",
  alternate: "隔行",
  letter: "字母"
};

const copybookThemes: Record<CopybookTheme, { label: string; strokeColor: string; guideColor: string; textColor: string }> = {
  "green-red": {
    label: "绿格红字",
    strokeColor: "#2F8F6B",
    guideColor: "#A9D1BF",
    textColor: "#EF1D28"
  },
  "green-black": {
    label: "绿格黑字",
    strokeColor: "#2F8F6B",
    guideColor: "#A9D1BF",
    textColor: "#111827"
  },
  "red-black": {
    label: "红格黑字",
    strokeColor: "#EF4444",
    guideColor: "#FECACA",
    textColor: "#111827"
  }
};

const watermarkPositionOptions: Array<{ label: string; value: WatermarkPosition }> = [
  { label: "单一居中", value: "center" },
  { label: "右上铺开", value: "spread-top-right" },
  { label: "右下铺开", value: "spread-bottom-right" }
];
const watermarkGrayOptions = Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
const watermarkImageHeightOptions = [40, 60, 80, 100, 120, 150, 180];

const builtInFontOptions: Array<{ font: Exclude<CopybookFontType, "custom">; id: string; label: string }> = [];

const englishDefaultFontName = "Caveat";
const pinyinDedicatedFontName = "Quicksand";

const templates: TemplateOption[] = [
  {
    id: "shengzi",
    title: "生字练习",
    description: "汉字描红练习",
    icon: Pencil,
    tone: "red",
    text: shengziDefaultText,
    pinyin: "",
    gridType: "tianzi",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "pinyin",
    title: "拼音练习",
    description: "四线拼音抄写",
    icon: BookOpen,
    tone: "green",
    text: "chuáng qián míng yuè guāng yí shì dì shàng shuāng",
    pinyin: "",
    gridType: "line",
    contentStyle: "trace",
    inputMode: "pinyin"
  },
  {
    id: "pinyin-tian",
    title: "拼音田格",
    description: "拼音田字格",
    icon: BookOpen,
    tone: "green",
    text: "天地人你我他",
    pinyin: "",
    gridType: "tianzi",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "english",
    title: "英文抄写",
    description: "单词句子抄写",
    icon: FileText,
    tone: "blue",
    text: "apple banana",
    pinyin: "",
    gridType: "line",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "number",
    title: "数字书写",
    description: "数字描红练习",
    icon: Tags,
    tone: "orange",
    text: "1234567890",
    pinyin: "",
    gridType: "tianzi",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "essay",
    title: "作文纸",
    description: "方格稿纸练习",
    icon: Grid3X3,
    tone: "purple",
    text: "　　夏天的飞鸟，飞到我的窗前唱歌，又飞去了。\n　　秋天的黄叶，它们没有什么可唱，只叹息一声，飞落在那里。",
    pinyin: "",
    gridType: "fang",
    contentStyle: "copy",
    inputMode: "copybook",
    practiceLineMode: "alternate"
  },
  {
    id: "line",
    title: "横线纸",
    description: "横线书写练习",
    icon: FileText,
    tone: "cyan",
    text: "　　夏天的飞鸟，飞到我的窗前唱歌，又飞去了。\n　　秋天的黄叶，它们没有什么可唱，只叹息一声，飞落在那里。",
    pinyin: "",
    gridType: "line",
    contentStyle: "trace",
    inputMode: "copybook",
    practiceLineMode: "alternate"
  },
  {
    id: "huizi",
    title: "回字格",
    description: "回字格练习",
    icon: Layers3,
    tone: "red",
    text: "春夏秋冬",
    pinyin: "",
    gridType: "hui",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "calligraphy",
    title: "书法练习",
    description: "毛笔字帖临摹",
    icon: Edit3,
    tone: "brown",
    text: "静以修身",
    pinyin: "",
    gridType: "tianzi",
    contentStyle: "trace",
    inputMode: "copybook"
  },
  {
    id: "eight-line",
    title: "八行笺",
    description: "传统竖排笺纸",
    icon: FileText,
    tone: "red",
    text:
      "　　谢中书雅鉴\n" +
      "　山川之美古来共谈高峰入云清流见底\n" +
      "　两岸石壁五色交辉青林翠竹四时俱备\n" +
      "　晓雾将歇猿鸟乱鸣夕日欲颓沉鳞竞跃\n" +
      "　实是欲界之仙都\n" +
      "　自康乐以来未复有能与其奇者\n" +
      "　　顺候清安\n" +
      "　　　　　　　　　　　　　陶弘景启",
    pinyin: "",
    gridType: "fang",
    contentStyle: "trace",
    inputMode: "copybook",
    practiceLineMode: "sample"
  },
  {
    id: "name-label",
    title: "姓名贴",
    description: "背胶标签批量打印",
    icon: Tags,
    tone: "green",
    text: nameLabelDefaultText,
    pinyin: "",
    gridType: "fang",
    contentStyle: "copy",
    inputMode: "copybook"
  },
  {
    id: "more",
    title: "更多模板",
    description: "敬请期待",
    icon: MoreHorizontal,
    tone: "gray",
    text: "天地人你我他",
    pinyin: "tiān dì rén nǐ wǒ tā",
    gridType: "tianzi",
    contentStyle: "hybrid",
    inputMode: "copybook"
  }
];

const commonTemplates = templates.filter((template) => template.id !== "pinyin-tian").slice(0, 6);

const toneClasses: Record<TemplateOption["tone"], string> = {
  red: "bg-red-500 text-white",
  green: "bg-emerald-600 text-white",
  blue: "bg-blue-600 text-white",
  orange: "bg-orange-500 text-white",
  purple: "bg-violet-700 text-white",
  brown: "bg-amber-800 text-white",
  cyan: "bg-cyan-600 text-white",
  gray: "bg-slate-200 text-slate-600"
};

export function ZitieGenerator({ isAuthenticated }: { isAuthenticated: boolean }) {
  const generateRequestIdRef = useRef<string | null>(null);
  const [text, setText] = useState(shengziDefaultText);
  const [pinyin, setPinyin] = useState("");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [practiceLineMode, setPracticeLineMode] = useState<PracticeLineMode>("word");
  const [theme, setTheme] = useState<CopybookTheme>("green-red");
  const [gridType, setGridType] = useState<GridType>("tianzi");
  const [contentStyle, setContentStyle] = useState<ContentStyle>("trace");
  const [inputMode, setInputMode] = useState<InputMode>("copybook");
  const [repeat, setRepeat] = useState(1);
  const [fontSize, setFontSize] = useState(32);
  const [contentOffsetY, setContentOffsetY] = useState(0);
  const [strokeColor, setStrokeColor] = useState(copybookThemes["green-red"].strokeColor);
  const [guideColor, setGuideColor] = useState(copybookThemes["green-red"].guideColor);
  const [textColor, setTextColor] = useState(copybookThemes["green-red"].textColor);
  const [traceColor, setTraceColor] = useState(traceFillForTextColor(copybookThemes["green-red"].textColor));
  const [showSheetTitle, setShowSheetTitle] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("一年级生字练习");
  const [titleFont, setTitleFont] = useState<WorksheetTitleFont>("kaiti");
  const [titleFontSize, setTitleFontSize] = useState(16);
  const [titleColor, setTitleColor] = useState(copybookThemes["green-red"].textColor);
  const [showStudentSchool, setShowStudentSchool] = useState(true);
  const [studentSchool, setStudentSchool] = useState("");
  const [showStudentName, setShowStudentName] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [showStudentClass, setShowStudentClass] = useState(true);
  const [studentClass, setStudentClass] = useState("");
  const [showStudentNumber, setShowStudentNumber] = useState(true);
  const [studentNumber, setStudentNumber] = useState("");
  const [pageNumberPosition, setPageNumberPosition] = useState<PageNumberPosition>("hidden");
  const [pageNumberFormat, setPageNumberFormat] = useState<PageNumberFormat>("full");
  const [showFooterText, setShowFooterText] = useState(true);
  const [footerText, setFooterText] = useState("好好写字  天天向上");
  const [footerFont, setFooterFont] = useState<WorksheetTitleFont>("kaiti");
  const [footerFontSize, setFooterFontSize] = useState(11);
  const [footerColor, setFooterColor] = useState(copybookThemes["green-red"].textColor);
  const [showTextWatermark, setShowTextWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkTextFont, setWatermarkTextFont] = useState<WorksheetTitleFont>("heiti");
  const [watermarkTextFontSize, setWatermarkTextFontSize] = useState(34);
  const [showImageWatermark, setShowImageWatermark] = useState(false);
  const [watermarkImageSrc, setWatermarkImageSrc] = useState("");
  const [watermarkImageName, setWatermarkImageName] = useState("");
  const [watermarkImageHeight, setWatermarkImageHeight] = useState(80);
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>("center");
  const [watermarkGray, setWatermarkGray] = useState(30);
  const [activeTemplateId, setActiveTemplateId] = useState("shengzi");
  const [selectedFontId, setSelectedFontId] = useState("");
  const [availableFonts, setAvailableFonts] = useState<PublicCopybookFont[]>([]);
  const [userUploadedFontIds, setUserUploadedFontIds] = useState<string[]>([]);
  const [favoriteFontIds, setFavoriteFontIds] = useState<string[]>([]);
  const [hanziStrokeData, setHanziStrokeData] = useState<Record<string, HanziStrokeData>>({});
  const [selectedStrokePinyin, setSelectedStrokePinyin] = useState<Record<string, string>>({});
  const [pinyinPicker, setPinyinPicker] = useState<PinyinPickerState | null>(null);
  const [svg, setSvg] = useState("");
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(previewZoomDefault);
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRecordListLoading, setIsRecordListLoading] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [generatedLayoutSignature, setGeneratedLayoutSignature] = useState("");
  const [generatedCopybookRecord, setGeneratedCopybookRecord] = useState<CopybookRecord | null>(null);
  const [copybookRecords, setCopybookRecords] = useState<CopybookRecord[]>([]);
  const [deletingRecordId, setDeletingRecordId] = useState("");
  const [restoringRecordId, setRestoringRecordId] = useState("");
  const [recordListMessage, setRecordListMessage] = useState("");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [fontPickerInitialFilter, setFontPickerInitialFilter] = useState<FontPickerFilter>("chinese");
  const [showMoreTemplates, setShowMoreTemplates] = useState(false);
  const [showCommonTemplates, setShowCommonTemplates] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  const [nameLabelOpen, setNameLabelOpen] = useState(false);
  const [nameLabelRosterOpen, setNameLabelRosterOpen] = useState(false);
  const [nameLabelRosterMode, setNameLabelRosterMode] = useState(false);
  const [nameLabelOptions, setNameLabelOptions] = useState<NameLabelOptions>(defaultNameLabelOptions);
  const [advancedPopoverFrame, setAdvancedPopoverFrame] = useState({ width: 820, maxHeight: 520 });
  const [fontPreviewUrls, setFontPreviewUrls] = useState<Record<string, string>>({});
  const actionButtonsRef = useRef<HTMLDivElement>(null);
  const previewSectionRef = useRef<HTMLElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewToolbarRef = useRef<HTMLDivElement>(null);
  const previewPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const fontPickerRef = useRef<HTMLDivElement>(null);
  const fontPreviewUrlsRef = useRef<Record<string, string>>({});
  const [previewToolbarTop, setPreviewToolbarTop] = useState<number | null>(null);

  const isPinyinPractice = inputMode === "pinyin";
  const isEnglishTemplate = activeTemplateId === "english";
  const isPinyinTianTemplate = activeTemplateId === "pinyin-tian" && inputMode === "copybook";
  const isEightLineTemplate = activeTemplateId === "eight-line" && inputMode === "copybook";
  const isNameLabelTemplate = activeTemplateId === "name-label" && inputMode === "copybook";
  const nameLabelRosterCount = useMemo(
    () => (nameLabelRosterMode ? parseNameLabelRosterText(text).length : 0),
    [nameLabelRosterMode, text]
  );
  const isStrokePracticeTemplate =
    activeTemplateId === "shengzi" && inputMode === "copybook" && practiceLineMode !== "alternate";
  const needsHanziMeta = isStrokePracticeTemplate || isPinyinTianTemplate;
  const customFontOptions = availableFonts;
  const fontPickerOptions = useMemo<FontPickerOption[]>(
    () => [
      ...builtInFontOptions.map((font) => ({
        font: font.font,
        id: font.id,
        label: font.label,
        type: "built-in" as const
      })),
      ...availableFonts.map((font) => ({
        font,
        id: font.id,
        label: font.name,
        type: "custom" as const
      }))
    ],
    [availableFonts]
  );
  const selectedFontLabel = useMemo(
    () => fontPickerOptions.find((font) => font.id === selectedFontId)?.label ?? "选择字体",
    [fontPickerOptions, selectedFontId]
  );
  const englishDefaultFont = useMemo(
    () =>
      availableFonts.find(
        (font) => font.name === englishDefaultFontName && font.suitableTemplates.includes("english")
      ),
    [availableFonts]
  );
  const pinyinDedicatedFont = useMemo(
    () =>
      availableFonts.find(
        (font) =>
          font.name === pinyinDedicatedFontName &&
          (font.suitableTemplates.includes("pinyin") || font.suitableTemplates.includes("pinyin-tian"))
      ),
    [availableFonts]
  );
  const selectedFont = useMemo(
    () => resolveSelectedFont(selectedFontId, customFontOptions, fontPreviewUrls),
    [customFontOptions, fontPreviewUrls, selectedFontId]
  );
  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) ?? templates[0],
    [activeTemplateId]
  );
  const chars = useMemo(
    () =>
      tokenizePracticeItems({
        isEightLineTemplate,
        isEnglishTemplate,
        isHanziOnlyTemplate: isPinyinTianTemplate,
        isPinyinPractice,
        mode: practiceLineMode,
        text
      }),
    [isEightLineTemplate, isEnglishTemplate, isPinyinPractice, isPinyinTianTemplate, practiceLineMode, text]
  );
  const layout = useMemo(
    () =>
      buildLayout({
        chars,
        contentStyle,
        contentOffsetY: -contentOffsetY,
        fontSize,
        gridType,
        guideColor,
        hanziStrokeData,
        inputMode,
        paperSize,
        pinyin,
        pinyinDedicatedFont,
        practiceLineMode,
        rawText: text,
        repeat,
        selectedFont,
        selectedStrokePinyin,
        strokeColor,
        templateId: activeTemplateId,
        textColor,
        traceColor,
        nameLabelOptions,
        nameLabelRosterMode,
        watermarkOptions: {
          gray: watermarkGray,
          image: {
            height: watermarkImageHeight,
            name: watermarkImageName,
            src: watermarkImageSrc,
            visible: showImageWatermark
          },
          position: watermarkPosition,
          text: {
            font: watermarkTextFont,
            fontSize: watermarkTextFontSize,
            value: watermarkText,
            visible: showTextWatermark
          }
        },
        worksheetOptions: {
          footer: footerText,
          footerStyle: {
            color: footerColor,
            font: footerFont,
            fontSize: footerFontSize
          },
          pageNumberFormat,
          pageNumberPosition,
          showFooter: showFooterText,
          showTitle: showSheetTitle,
          titleStyle: {
            color: titleColor,
            font: titleFont,
            fontSize: titleFontSize
          },
          studentFields: {
            school: {
              value: studentSchool,
              visible: showStudentSchool
            },
            className: {
              value: studentClass,
              visible: showStudentClass
            },
            name: {
              value: studentName,
              visible: showStudentName
            },
            studentNumber: {
              value: studentNumber,
              visible: showStudentNumber
            }
          },
          title: sheetTitle
        }
      }),
    [
      activeTemplateId,
      chars,
      contentStyle,
      contentOffsetY,
      fontSize,
      footerColor,
      footerFont,
      footerFontSize,
      footerText,
      gridType,
      guideColor,
      hanziStrokeData,
      inputMode,
      nameLabelOptions,
      nameLabelRosterMode,
      pageNumberFormat,
      pageNumberPosition,
      paperSize,
      pinyin,
      pinyinDedicatedFont,
      practiceLineMode,
      text,
      repeat,
      selectedFont,
      selectedStrokePinyin,
      sheetTitle,
      showFooterText,
      showSheetTitle,
      showStudentClass,
      showStudentName,
      showStudentNumber,
      showStudentSchool,
      strokeColor,
      studentClass,
      studentName,
      studentNumber,
      studentSchool,
      textColor,
      titleColor,
      titleFont,
      titleFontSize,
      traceColor,
      showImageWatermark,
      showTextWatermark,
      watermarkGray,
      watermarkImageHeight,
      watermarkImageName,
      watermarkImageSrc,
      watermarkPosition,
      watermarkText,
      watermarkTextFont,
      watermarkTextFontSize
    ]
  );
  const layoutSignature = useMemo(() => JSON.stringify(layout), [layout]);
  const previewLayoutPages = useMemo(() => layoutPages(layout), [layout]);
  const previewPageCount = Math.max(svgPages.length, previewLayoutPages.length);
  const previewCurrentPageIndex = Math.min(previewPageIndex, Math.max(0, previewPageCount - 1));
  const previewPageLayout = previewLayoutPages[previewCurrentPageIndex] ?? firstLayoutPage(layout);
  const previewBasePageLayout = previewLayoutPages[0] ?? firstLayoutPage(layout);
  const previewPageSvgs = svgPages.length > 0 ? svgPages : svg ? [svg] : [];
  const hasGeneratedCurrentLayout =
    generatedLayoutSignature === layoutSignature && hasRenderableContent(layout) && Boolean(generatedCopybookRecord);
  const generatePricing = useMemo(
    () => copybookPricingForPages(previewLayoutPages, activeTemplateId),
    [activeTemplateId, previewLayoutPages]
  );

  function rememberUserUploadedFont(fontId: string) {
    setUserUploadedFontIds((current) => {
      const next = uniqueFontIds([fontId, ...current]);

      writeStoredFontIds(userUploadedFontsStorageKey, next);

      return next;
    });
  }

  function toggleFavoriteFont(fontId: string) {
    setFavoriteFontIds((current) => {
      const next = current.includes(fontId)
        ? current.filter((item) => item !== fontId)
        : uniqueFontIds([fontId, ...current]);

      writeStoredFontIds(favoriteFontsStorageKey, next);

      return next;
    });
  }

  async function reloadAvailableFonts() {
    const fonts = await requestPublicFonts();

    setAvailableFonts(fonts);

    return fonts;
  }

  async function uploadFont(file: File) {
    const formData = new FormData();

    formData.set("file", file);
    formData.set("name", fontNameFromFilename(file.name));
    fontUploadTemplates.forEach((template) => {
      formData.append("suitableTemplates", template);
    });

    const response = await fetch("/api/fonts", {
      body: formData,
      cache: "no-store",
      method: "POST"
    });
    const payload = (await response.json()) as ApiResponse<PublicCopybookFont>;

    if (!response.ok || payload.code !== 0 || !payload.data) {
      throw new Error(payload.message || "字体上传失败，请稍后重试。");
    }

    try {
      await reloadAvailableFonts();
    } catch {
      setAvailableFonts((current) => [payload.data as PublicCopybookFont, ...current]);
    }

    rememberUserUploadedFont(payload.data.id);
    setSelectedFontId(payload.data.id);
  }

  async function deleteUploadedFont(fontId: string) {
    const response = await fetch(`/api/fonts/${encodeURIComponent(fontId)}`, {
      cache: "no-store",
      method: "DELETE"
    });
    const payload = (await response.json()) as ApiResponse<Record<string, never>>;

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.message || "字体删除失败，请稍后重试。");
    }

    let nextFonts = availableFonts.filter((font) => font.id !== fontId);

    try {
      nextFonts = await reloadAvailableFonts();
    } catch {
      setAvailableFonts(nextFonts);
    }

    setUserUploadedFontIds((current) => {
      const next = current.filter((id) => id !== fontId);

      writeStoredFontIds(userUploadedFontsStorageKey, next);

      return next;
    });
    setFavoriteFontIds((current) => {
      const next = current.filter((id) => id !== fontId);

      writeStoredFontIds(favoriteFontsStorageKey, next);

      return next;
    });
    setFontPreviewUrls((current) => {
      const staleKeys = Object.keys(current).filter((key) => key === fontId || key.startsWith(`${fontId}:`));

      if (staleKeys.length === 0) {
        return current;
      }

      const next = { ...current };

      staleKeys.forEach((key) => {
        URL.revokeObjectURL(next[key]);
        delete next[key];
      });

      return next;
    });
    setSelectedFontId((current) => (current === fontId ? nextFonts[0]?.id ?? "" : current));
  }

  async function handleWatermarkImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!/^image\/(?:png|jpeg)$/i.test(file.type)) {
      setMessage("图片水印仅支持 PNG 或 JPG 文件。");
      event.target.value = "";
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessage("图片水印文件不能超过 4MB。");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);

      setWatermarkImageSrc(dataUrl);
      setWatermarkImageName(file.name);
      setShowImageWatermark(true);
    } catch {
      setMessage("图片水印读取失败，请重新选择图片。");
    } finally {
      event.target.value = "";
    }
  }

  useEffect(() => {
    setUserUploadedFontIds(readStoredFontIds(userUploadedFontsStorageKey));
    setFavoriteFontIds(readStoredFontIds(favoriteFontsStorageKey));
  }, []);

  useEffect(() => {
    fontPreviewUrlsRef.current = fontPreviewUrls;
  }, [fontPreviewUrls]);

  useEffect(
    () => () => {
      Object.values(fontPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(() => {
    let isCurrent = true;

    async function loadFonts() {
      try {
        const fonts = await requestPublicFonts();

        if (isCurrent) {
          setAvailableFonts(fonts);
        }
      } catch {
        if (isCurrent) {
          setAvailableFonts([]);
        }
      }
    }

    void loadFonts();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    function refreshFonts() {
      void reloadAvailableFonts().catch(() => undefined);
    }

    function refreshVisibleFonts() {
      if (document.visibilityState === "visible") {
        refreshFonts();
      }
    }

    window.addEventListener("focus", refreshFonts);
    document.addEventListener("visibilitychange", refreshVisibleFonts);

    return () => {
      window.removeEventListener("focus", refreshFonts);
      document.removeEventListener("visibilitychange", refreshVisibleFonts);
    };
  }, []);

  useEffect(() => {
    const liveFontKeys = new Set(availableFonts.map((font) => fontPreviewUrlKey(font)));

    setFontPreviewUrls((current) => {
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(current).forEach(([fontKey, objectUrl]) => {
        if (liveFontKeys.has(fontKey)) {
          next[fontKey] = objectUrl;
        } else {
          URL.revokeObjectURL(objectUrl);
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [availableFonts]);

  useEffect(() => {
    let isCurrent = true;
    const missingUserFonts = availableFonts.filter(
      (font) => font.ownerType === "USER" && !fontPreviewUrls[fontPreviewUrlKey(font)]
    );

    if (missingUserFonts.length === 0) {
      return () => {
        isCurrent = false;
      };
    }

    async function loadPreviewUrls() {
      const entries = await Promise.all(
        missingUserFonts.map(async (font) => {
          const response = await fetch(fontUrlForPreview(font), {
            cache: "no-store",
            credentials: "same-origin"
          });

          if (!response.ok) {
            return null;
          }

          return [fontPreviewUrlKey(font), URL.createObjectURL(await response.blob())] as const;
        })
      );

      if (!isCurrent) {
        entries.forEach((entry) => {
          if (entry) {
            URL.revokeObjectURL(entry[1]);
          }
        });
        return;
      }

      setFontPreviewUrls((current) => {
        const next = { ...current };
        let changed = false;

        entries.forEach((entry) => {
          if (!entry) {
            return;
          }

          const [fontKey, objectUrl] = entry;

          if (next[fontKey]) {
            URL.revokeObjectURL(objectUrl);
          } else {
            next[fontKey] = objectUrl;
            changed = true;
          }
        });

        return changed ? next : current;
      });
    }

    void loadPreviewUrls();

    return () => {
      isCurrent = false;
    };
  }, [availableFonts, fontPreviewUrls]);

  useEffect(() => {
    if (builtInFontOptions.some((font) => font.id === selectedFontId)) {
      return;
    }

    if (!availableFonts.some((font) => font.id === selectedFontId)) {
      setSelectedFontId(availableFonts[0]?.id ?? "");
    }
  }, [availableFonts, selectedFontId]);

  useEffect(() => {
    if (!showFontPicker) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Node ? event.target : null;

      if (target && fontPickerRef.current?.contains(target)) {
        return;
      }

      setShowFontPicker(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowFontPicker(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showFontPicker]);

  useEffect(() => {
    if (!advancedOpen && !watermarkOpen && !nameLabelOpen) {
      return;
    }

    function updateAdvancedPopoverFrame() {
      setAdvancedPopoverFrame(centeredPopoverSize(900, 820));
    }

    updateAdvancedPopoverFrame();
    window.addEventListener("resize", updateAdvancedPopoverFrame);
    window.addEventListener("scroll", updateAdvancedPopoverFrame, true);

    return () => {
      window.removeEventListener("resize", updateAdvancedPopoverFrame);
      window.removeEventListener("scroll", updateAdvancedPopoverFrame, true);
    };
  }, [advancedOpen, nameLabelOpen, watermarkOpen]);

  useEffect(() => {
    function updatePreviewToolbarPosition() {
      const actionButtons = actionButtonsRef.current;
      const previewSection = previewSectionRef.current;

      if (!actionButtons || !previewSection) {
        return;
      }

      const actionRect = actionButtons.getBoundingClientRect();
      const sectionRect = previewSection.getBoundingClientRect();
      const toolbarHeight = previewToolbarRef.current?.offsetHeight ?? 40;
      const maxTop = Math.max(0, previewSection.clientHeight - toolbarHeight - 8);
      const nextTop = fixed(Math.min(maxTop, Math.max(0, actionRect.bottom - sectionRect.top - toolbarHeight)));

      setPreviewToolbarTop((current) => (current === nextTop ? current : nextTop));
    }

    updatePreviewToolbarPosition();
    window.addEventListener("resize", updatePreviewToolbarPosition);
    window.addEventListener("scroll", updatePreviewToolbarPosition, true);

    const resizeObserver = new ResizeObserver(updatePreviewToolbarPosition);

    if (actionButtonsRef.current) {
      resizeObserver.observe(actionButtonsRef.current);
    }

    if (previewSectionRef.current) {
      resizeObserver.observe(previewSectionRef.current);
    }

    return () => {
      window.removeEventListener("resize", updatePreviewToolbarPosition);
      window.removeEventListener("scroll", updatePreviewToolbarPosition, true);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeTemplateId !== "english" || !englishDefaultFont || selectedFontId === englishDefaultFont.id) {
      return;
    }

    if (!selectedFontId || selectedFontId === availableFonts[0]?.id) {
      setSelectedFontId(englishDefaultFont.id);
    }
  }, [activeTemplateId, availableFonts, englishDefaultFont, selectedFontId]);

  useEffect(() => {
    if (!practiceModesForTemplate(activeTemplateId).includes(practiceLineMode)) {
      setPracticeLineMode("sample");
    }
  }, [activeTemplateId, practiceLineMode]);

  useEffect(() => {
    if ((practiceLineMode === "sample" || practiceLineMode === "alternate") && repeat !== 0) {
      setRepeat(0);
    }
  }, [practiceLineMode, repeat]);

  useEffect(() => {
    generateRequestIdRef.current = null;

    if (generatedLayoutSignature && generatedLayoutSignature !== layoutSignature) {
      setGeneratedLayoutSignature("");
      setGeneratedCopybookRecord(null);
    }
  }, [generatedLayoutSignature, layoutSignature]);

  useEffect(() => {
    setPreviewPageIndex((current) => Math.min(current, Math.max(0, previewPageCount - 1)));
  }, [previewPageCount]);

  useEffect(() => {
    previewPageRefs.current = previewPageRefs.current.slice(0, previewPageCount);
  }, [previewPageCount]);

  useEffect(() => {
    const pageElement = previewPageRefs.current[previewCurrentPageIndex];

    if (!pageElement) {
      return;
    }

    pageElement.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest"
    });
  }, [previewCurrentPageIndex]);

  useEffect(() => {
    if (!needsHanziMeta || chars.length === 0) {
      return;
    }

    const missingChars = uniqueHanziChars(chars.join("")).filter((char) => !hanziStrokeData[char]);

    if (missingChars.length === 0) {
      return;
    }

    const controller = new AbortController();

    async function loadStrokeData() {
      try {
        const response = await fetch(`/api/hanzi/strokes?chars=${encodeURIComponent(missingChars.join(""))}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as ApiResponse<{ items: Record<string, HanziStrokeData> }>;

        const items = payload.data?.items;

        if (response.ok && payload.code === 0 && items) {
          setHanziStrokeData((current) => ({
            ...current,
            ...items
          }));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(isPinyinTianTemplate ? "部分汉字拼音数据暂未加载" : "部分生字笔顺数据暂未加载，已保留空白练习格");
        }
      }
    }

    void loadStrokeData();

    return () => {
      controller.abort();
    };
  }, [chars, hanziStrokeData, isPinyinTianTemplate, needsHanziMeta]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void renderPreview(layout, controller.signal);
    }, 180);

    async function renderPreview(nextLayout: CopybookRenderLayout, signal: AbortSignal) {
      if (!hasRenderableContent(nextLayout)) {
        setSvg("");
        setSvgPages([]);
        setPreviewPageIndex(0);
        setMessage("请输入要练习的内容");
        return;
      }

      setMessage("");

      if (copybookPreviewMode(isAuthenticated) === "local") {
        const fallbackPages = buildPreviewSvgs(nextLayout);

        setSvgPages(fallbackPages);
        setSvg(fallbackPages[0] ?? "");
        setPreviewPageIndex((current) => Math.min(current, Math.max(0, fallbackPages.length - 1)));
        return;
      }

      try {
        const response = await fetch("/api/render/svg", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ layout: nextLayout }),
          signal
        });
        const payload = (await response.json()) as ApiResponse<{ svg: string; svgs?: string[] }>;

        if (!response.ok || payload.code !== 0 || !payload.data) {
          throw new Error(payload.message || "预览生成失败");
        }

        const nextSvgPages = payload.data.svgs?.length ? payload.data.svgs : splitSvgDocuments(payload.data.svg);

        setSvgPages(nextSvgPages);
        setSvg(nextSvgPages[0] ?? "");
        setPreviewPageIndex((current) => Math.min(current, Math.max(0, nextSvgPages.length - 1)));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const fallbackPages = buildPreviewSvgs(nextLayout);

        setSvgPages(fallbackPages);
        setSvg(fallbackPages[0] ?? "");
        setPreviewPageIndex((current) => Math.min(current, Math.max(0, fallbackPages.length - 1)));
        setMessage(
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "API Core 未连接，已使用本地预览；导出 PDF 需要启动后端服务"
        );
      }
    }

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, layout]);

  function zoomPreviewBy(delta: number) {
    setPreviewZoom((current) => clampPreviewZoom(current + delta));
  }

  function goPreviewPage(delta: number) {
    setPreviewPageIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(0, previewPageCount - 1)));
  }

  function fitPreviewWidth() {
    const viewport = previewViewportRef.current;

    if (!viewport) {
      return;
    }

    const availableWidth = Math.max(120, viewport.clientWidth - 32);

    setPreviewZoom(clampPreviewZoom(availableWidth / previewPageLayout.page.width));
  }

  function fitPreviewHeight() {
    const viewport = previewViewportRef.current;

    if (!viewport) {
      return;
    }

    const availableHeight = Math.max(120, viewport.clientHeight - 24);

    setPreviewZoom(clampPreviewZoom(availableHeight / previewPageLayout.page.height));
  }

  function requestGenerateCopybook() {
    if (!hasRenderableContent(layout)) {
      setMessage("请输入要练习的内容");
      return;
    }

    setShowMoreTemplates(false);
    setAdvancedOpen(false);
    setWatermarkOpen(false);

    if (copybookGenerateDialog(isAuthenticated) === "login") {
      setLoginPromptOpen(true);
      return;
    }

    setGenerateConfirmOpen(true);
  }

  async function generateCopybook() {
    if (!hasRenderableContent(layout)) {
      setMessage("请输入要练习的内容");
      setGenerateConfirmOpen(false);
      return;
    }

    setGenerateConfirmOpen(false);
    setIsGenerating(true);
    setMessage("");
    const requestId = generateRequestIdRef.current ?? createRequestId();
    generateRequestIdRef.current = requestId;

    try {
      const response = await fetch("/api/copybooks/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          layout,
          content: text,
          templateId: activeTemplateId,
          templateName: activeTemplate.title,
          requestId,
          sourceConfig: isNameLabelTemplate
            ? createNameLabelRecordSourceConfig({
                colors: {
                  guide: guideColor,
                  stroke: strokeColor,
                  text: textColor,
                  trace: traceColor
                },
                content: text,
                fontSize,
                options: nameLabelOptions,
                paperSize,
                rosterMode: nameLabelRosterMode,
                selectedFontId,
                theme
              })
            : undefined
        })
      });
      const payload = (await response.json()) as ApiResponse<{
        credits: number;
        wallet: {
          availableCredits: number;
        };
        record: CopybookRecord;
      }>;

      if (response.status === 401 || payload.code === 40101) {
        setLoginPromptOpen(true);
        return;
      }

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "字帖生成失败");
      }

      setGeneratedLayoutSignature(layoutSignature);
      setGeneratedCopybookRecord(payload.data.record);
      generateRequestIdRef.current = null;
      setMessage(
        payload.data.credits > 0
          ? `字帖已生成，已扣除 ${payload.data.credits} 点，剩余 ${payload.data.wallet.availableCredits} 点`
          : "字帖已生成，活动期间未扣点"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "字帖生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadPdf() {
    if (!hasRenderableContent(layout)) {
      setMessage("请输入要练习的内容");
      return;
    }

    if (!hasGeneratedCurrentLayout) {
      setMessage("请先生成字帖后再导出 PDF");
      return;
    }

    if (!generatedCopybookRecord) {
      setMessage("请先生成字帖后再导出 PDF");
      return;
    }

    setIsDownloading(true);
    setMessage("");
    downloadCopybookRecord(generatedCopybookRecord);
    window.setTimeout(() => setIsDownloading(false), 250);
  }

  function printCopybook() {
    if (!hasGeneratedCurrentLayout) {
      setMessage("请先生成字帖后再打印");
      return;
    }

    window.print();
  }

  function applyTemplate(template: TemplateOption) {
    if (template.id === "more") {
      setShowMoreTemplates(true);
      return;
    }

    const nextPracticeLineMode = template.practiceLineMode ?? "word";

    setInputMode(template.inputMode);
    setActiveTemplateId(template.id);
    setText(template.inputMode === "pinyin" ? normalizePinyinInput(template.text) : template.text);
    setPinyin(template.inputMode === "pinyin" ? "" : template.pinyin);
    setGridType(template.gridType);
    setContentStyle(template.contentStyle);
    setPracticeLineMode(nextPracticeLineMode);
    setSheetTitle(template.title === "生字练习" ? "一年级生字练习" : template.title);
    setFontSize(template.inputMode === "pinyin" ? pinyinPracticeFontSize(pinyinCellHeight) : 32);
    setRepeat(nextPracticeLineMode === "sample" || nextPracticeLineMode === "alternate" ? 0 : 1);
    if (template.id === "english" && englishDefaultFont) {
      setSelectedFontId(englishDefaultFont.id);
    }
    if (template.id === "name-label") {
      setFontSize(16);
      setTheme("green-black");
      setStrokeColor(copybookThemes["green-black"].strokeColor);
      setGuideColor(copybookThemes["green-black"].guideColor);
      setTextColor(copybookThemes["green-black"].textColor);
      setTraceColor(traceFillForTextColor(copybookThemes["green-black"].textColor));
    }
    setMessage("");
    setPinyinPicker(null);
    setNameLabelRosterMode(false);
    setNameLabelRosterOpen(false);
    setNameLabelOpen(false);
    setShowCommonTemplates(false);
    setShowMoreTemplates(false);
  }

  async function handleNameLabelBackgroundUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!/^image\/(?:png|jpeg)$/i.test(file.type)) {
      setMessage("姓名贴背景仅支持 PNG 或 JPG 文件。");
      event.target.value = "";
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessage("姓名贴背景图片不能超过 4MB。");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);

      setNameLabelOptions((current) => ({
        ...current,
        backgroundImageName: file.name,
        backgroundImageSrc: dataUrl
      }));
    } catch {
      setMessage("姓名贴背景图片读取失败，请重新选择。");
    } finally {
      event.target.value = "";
    }
  }

  function applyNameLabelRoster(entries: NameLabelRosterEntry[]) {
    updateText(formatNameLabelRosterInput(entries));
    setNameLabelRosterMode(true);
    setNameLabelRosterOpen(false);
    setMessage(`已录入 ${entries.length} 名学生，将生成 ${entries.length} 页姓名贴。`);
  }

  function updateTheme(nextTheme: CopybookTheme) {
    const themeConfig = copybookThemes[nextTheme];

    setTheme(nextTheme);
    setStrokeColor(themeConfig.strokeColor);
    setGuideColor(themeConfig.guideColor);
    setTextColor(themeConfig.textColor);
    setTraceColor(traceFillForTextColor(themeConfig.textColor));
    setTitleColor(themeConfig.textColor);
  }

  function updateText(value: string) {
    const nextValue = isPinyinPractice ? normalizePinyinInput(value) : isPinyinTianTemplate ? normalizeHanziInput(value) : value;

    setText(nextValue.slice(0, maxTextLength));
    setPinyinPicker(null);
    setMessage(
      isPinyinPractice && nextValue !== value
        ? "拼音练习只能输入拼音"
        : isPinyinTianTemplate && nextValue !== value
          ? "拼音田格只能输入汉字"
          : ""
    );
  }

  async function openCopybookRecords() {
    setRecordModalOpen(true);
    setRecordListMessage("");
    setShowMoreTemplates(false);
    setAdvancedOpen(false);
    setWatermarkOpen(false);
    await loadCopybookRecords();
  }

  async function loadCopybookRecords() {
    setIsRecordListLoading(true);
    setRecordListMessage("");

    try {
      const response = await fetch("/api/copybooks", {
        cache: "no-store"
      });
      const payload = (await response.json()) as ApiResponse<CopybookRecord[]>;

      if (response.status === 401 || payload.code === 40101) {
        throw new Error("请先注册或登录会员后查看字帖记录");
      }

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "字帖记录加载失败");
      }

      setCopybookRecords(payload.data);
    } catch (error) {
      setRecordListMessage(error instanceof Error ? error.message : "字帖记录加载失败");
    } finally {
      setIsRecordListLoading(false);
    }
  }

  function viewCopybookRecord(record: CopybookRecord) {
    window.open(copybookRecordPdfUrl(record), "_blank", "noopener,noreferrer");
  }

  function downloadCopybookRecord(record: CopybookRecord) {
    const link = document.createElement("a");

    link.href = copybookRecordPdfUrl(record, true);
    link.download = record.pdfFilename || "zitie.pdf";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function restoreNameLabelRecord(record: CopybookRecord) {
    setRecordListMessage("");

    if (!record.hasSourceConfig) {
      setRecordListMessage("该记录生成于“做同款”功能上线前，未保存可恢复的姓名贴设置。");
      return;
    }

    setRestoringRecordId(record.id);

    try {
      const response = await fetch(`/api/copybooks/${encodeURIComponent(record.id)}/source`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as ApiResponse<{ sourceConfig: unknown }>;

      if (!response.ok || payload.code !== 0 || !payload.data) {
        throw new Error(payload.message || "姓名贴设置读取失败");
      }

      const sourceConfig = parseNameLabelRecordSourceConfig(payload.data.sourceConfig);

      if (!sourceConfig) {
        throw new Error("姓名贴设置已损坏，无法做同款");
      }

      const fontIsAvailable =
        !sourceConfig.selectedFontId || fontPickerOptions.some((font) => font.id === sourceConfig.selectedFontId);

      setInputMode("copybook");
      setActiveTemplateId("name-label");
      setText(sourceConfig.content);
      setPinyin("");
      setPaperSize(sourceConfig.paperSize);
      setPracticeLineMode("word");
      setGridType("fang");
      setContentStyle("copy");
      setRepeat(1);
      setFontSize(sourceConfig.fontSize);
      setTheme(sourceConfig.theme);
      setStrokeColor(sourceConfig.colors.stroke);
      setGuideColor(sourceConfig.colors.guide);
      setTextColor(sourceConfig.colors.text);
      setTraceColor(sourceConfig.colors.trace);
      setNameLabelOptions(sourceConfig.options);
      setNameLabelRosterMode(sourceConfig.rosterMode);
      if (fontIsAvailable) {
        setSelectedFontId(sourceConfig.selectedFontId);
      }
      setPinyinPicker(null);
      setGeneratedCopybookRecord(null);
      setGeneratedLayoutSignature("");
      generateRequestIdRef.current = null;
      setShowCommonTemplates(false);
      setShowMoreTemplates(false);
      setNameLabelOpen(false);
      setNameLabelRosterOpen(false);
      setRecordModalOpen(false);
      setMessage(
        fontIsAvailable
          ? "已恢复原姓名贴设置，可以继续修改或生成。"
          : "已恢复原姓名贴设置；原字体已不可用，已保留当前可用字体。"
      );
    } catch (error) {
      setRecordListMessage(error instanceof Error ? error.message : "姓名贴设置读取失败");
    } finally {
      setRestoringRecordId("");
    }
  }

  async function deleteCopybookRecord(recordId: string) {
    setDeletingRecordId(recordId);
    setMessage("");

    try {
      const response = await fetch(`/api/copybooks/${encodeURIComponent(recordId)}`, {
        cache: "no-store",
        method: "DELETE"
      });
      const payload = (await response.json()) as ApiResponse<Record<string, never>>;

      if (!response.ok || payload.code !== 0) {
        throw new Error(payload.message || "字帖记录删除失败");
      }

      setCopybookRecords((current) => current.filter((record) => record.id !== recordId));
      setGeneratedCopybookRecord((current) => (current?.id === recordId ? null : current));
      if (generatedCopybookRecord?.id === recordId) {
        setGeneratedLayoutSignature("");
      }
      setMessage("字帖记录已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "字帖记录删除失败");
    } finally {
      setDeletingRecordId("");
    }
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const pickerTarget = target?.closest<SVGGElement>('[data-role="stroke-pinyin-picker"]');

    if (!pickerTarget) {
      setPinyinPicker(null);
      return;
    }

    const options = (pickerTarget.dataset.options ?? "").split("|").filter(Boolean);
    const key = pickerTarget.dataset.key ?? "";

    if (!key || options.length < 2) {
      setPinyinPicker(null);
      return;
    }

    setPinyinPicker({
      key,
      char: pickerTarget.dataset.char ?? "",
      options,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY + 10, window.innerHeight - 140)
    });
  }

  function selectStrokePinyin(key: string, value: string) {
    setSelectedStrokePinyin((current) => ({
      ...current,
      [key]: value
    }));
    setPinyinPicker(null);
  }

  function toggleFontPicker() {
    if (showFontPicker) {
      setShowFontPicker(false);
      return;
    }

    setFontPickerInitialFilter(resolveFontPickerInitialFilter(selectedFontId, fontPickerOptions, userUploadedFontIds));
    void reloadAvailableFonts().catch(() => undefined);
    setShowFontPicker(true);
  }

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#F6F8FC] text-[#162033]">
      <style>{fontFaceCssForHtml(availableFonts, fontPreviewUrls)}</style>
      <section className="grid gap-6 px-6 py-4 xl:grid-cols-[460px_minmax(0,1fr)] 2xl:grid-cols-[600px_minmax(0,1fr)]">
        <aside className="relative flex min-w-0 flex-col gap-3">
          <ControlPanel
            action={
              <div className="relative" ref={fontPickerRef}>
                <button
                  className="inline-flex h-9 w-[220px] max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={toggleFontPicker}
                  type="button"
                >
                  <span className="shrink-0 whitespace-nowrap text-slate-500">字体</span>
                  <span className="min-w-0 flex-1 truncate text-left">{selectedFontLabel}</span>
                  <ChevronRight className={cn("size-4 shrink-0 transition-transform", showFontPicker ? "rotate-90" : "")} />
                </button>
                {showFontPicker ? (
                  <FontPickerPopover
                    favoriteFontIds={favoriteFontIds}
                    fonts={fontPickerOptions}
                    initialFilter={fontPickerInitialFilter}
                    onSelect={(fontId) => {
                      setSelectedFontId(fontId);
                      setShowFontPicker(false);
                    }}
                    onToggleFavorite={toggleFavoriteFont}
                    onDeleteFont={deleteUploadedFont}
                    onUploadFont={uploadFont}
                    selectedFontId={selectedFontId}
                    userUploadedFontIds={userUploadedFontIds}
                  />
                ) : null}
              </div>
            }
            title="输入内容"
            icon={<Edit3 className="size-5 text-[#EF1D28]" />}
          >
            <div className="relative">
              <Textarea
                className="min-h-[130px] resize-none rounded-lg border-blue-300 bg-white px-4 py-4 text-base leading-7 shadow-inner placeholder:text-slate-400 focus:border-blue-500"
                maxLength={maxTextLength}
                onBlur={(event) => {
                  if (isPinyinPractice) {
                    setText(normalizePinyinInput(event.target.value, true).slice(0, maxTextLength));
                  }
                }}
                onChange={(event) => updateText(event.target.value)}
                placeholder={
                  isPinyinPractice
                    ? "例如：bā bá bǎ bà   mā má mǎ mà   nǐ hǎo"
                    : isNameLabelTemplate
                      ? "每行填写标签内的一行内容，空一行开始下一张标签"
                      : "例如：天地人，你好中国   apple banana   123456"
                }
                value={text}
              />
              <span className="absolute bottom-3 right-4 text-sm text-slate-500">
                {text.length}/{maxTextLength}
              </span>
            </div>
          </ControlPanel>

          <ControlPanel
            action={
              <button
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => {
                  setAdvancedOpen(false);
                  setShowMoreTemplates(true);
                }}
                type="button"
              >
                更多模板
                <ChevronRight className="size-4" />
              </button>
            }
            icon={<Grid3X3 className="size-5 text-blue-500" />}
            title={showCommonTemplates ? "常用模板" : `当前模板：${activeTemplate.title}`}
          >
            {showCommonTemplates ? (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {commonTemplates.map((template) => (
                  <TemplateButton key={template.id} onClick={() => applyTemplate(template)} template={template} />
                ))}
              </div>
            ) : null}
          </ControlPanel>

          <div className="relative">
            <ControlPanel
              action={
                <div className="flex items-center gap-2">
                  {isNameLabelTemplate ? (
                    <button
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      onClick={() => {
                        setShowMoreTemplates(false);
                        setAdvancedOpen(false);
                        setWatermarkOpen(false);
                        setNameLabelOpen((current) => !current);
                      }}
                      type="button"
                    >
                      姓名贴设置
                      <ChevronRight className={cn("size-4 transition-transform", nameLabelOpen ? "rotate-90" : "")} />
                    </button>
                  ) : (
                    <>
                      <button
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        onClick={() => {
                          setShowMoreTemplates(false);
                          setAdvancedOpen(false);
                          setNameLabelOpen(false);
                          setWatermarkOpen((current) => !current);
                        }}
                        type="button"
                      >
                        水印设置
                        <ChevronRight className={cn("size-4 transition-transform", watermarkOpen ? "rotate-90" : "")} />
                      </button>
                      <button
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        onClick={() => {
                          setShowMoreTemplates(false);
                          setWatermarkOpen(false);
                          setNameLabelOpen(false);
                          setAdvancedOpen((current) => !current);
                        }}
                        type="button"
                      >
                        高级设置
                        <ChevronRight className={cn("size-4 transition-transform", advancedOpen ? "rotate-90" : "")} />
                      </button>
                    </>
                  )}
                </div>
              }
              title="快速设置"
              icon={<Sparkles className="size-5 text-blue-500" />}
            >
              {isNameLabelTemplate ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <QuickSettingSelect label="纸张" onChange={(value) => setPaperSize(value as PaperSize)} value={paperSize}>
                      <option value="A4">A4</option>
                      <option value="B5">B5</option>
                    </QuickSettingSelect>
                    <QuickSettingSelect
                      label="页面边距"
                      onChange={(value) =>
                        setNameLabelOptions((current) => ({
                          ...current,
                          pageMarginPreset: value as NameLabelPageMarginPreset
                        }))
                      }
                      value={nameLabelOptions.pageMarginPreset ?? "narrow"}
                    >
                      {Object.entries(nameLabelPageMarginPresets).map(([value, preset]) => (
                        <option key={value} value={value}>
                          {preset.label}
                        </option>
                      ))}
                    </QuickSettingSelect>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span className="block text-sm text-slate-500">标签尺寸</span>
                      <span className="mt-1 block h-8 text-base font-bold leading-8 text-slate-950">
                        {nameLabelOptions.labelWidthCm} × {nameLabelOptions.labelHeightCm} cm
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <QuickSettingRange compact label="字号" max={60} min={8} onChange={setFontSize} step={1} value={fontSize} />
                    <QuickSettingRange
                      compact
                      decimals={1}
                      label="行距"
                      max={2.5}
                      min={0.5}
                      onChange={(value) => setNameLabelOptions((current) => ({ ...current, lineHeight: value }))}
                      step={0.5}
                      value={nameLabelOptions.lineHeight ?? 1.5}
                    />
                    <QuickSettingRange
                      compact
                      decimals={1}
                      label="边距"
                      max={1.5}
                      min={0.1}
                      onChange={(value) => setNameLabelOptions((current) => ({ ...current, horizontalPaddingCm: value }))}
                      step={0.1}
                      value={nameLabelOptions.horizontalPaddingCm ?? 0.5}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <QuickSettingSelect label="纸张" onChange={(value) => setPaperSize(value as PaperSize)} value={paperSize}>
                  <option value="A4">A4</option>
                  <option value="B5">B5</option>
                </QuickSettingSelect>
                <QuickSettingSelect
                  label="排版"
                  onChange={(value) => setPracticeLineMode(value as PracticeLineMode)}
                  value={practiceLineMode}
                >
                  {practiceModesForTemplate(activeTemplateId).map((mode) => (
                    <option key={mode} value={mode}>
                      {practiceLineModes[mode]}
                    </option>
                  ))}
                </QuickSettingSelect>
                <QuickSettingSelect
                  disabled={practiceLineMode === "sample" || practiceLineMode === "alternate"}
                  label="难度"
                  onChange={(value) => setRepeat(clampNumber(value, 0, maxTraceCount))}
                  value={practiceLineMode === "sample" || practiceLineMode === "alternate" ? "0" : String(repeat)}
                >
                  {Array.from({ length: maxTraceCount + 1 }, (_, index) => index).map((count) => (
                    <option key={count} value={count}>
                      描写{count}个
                    </option>
                  ))}
                </QuickSettingSelect>
                <QuickSettingSelect label="风格" onChange={(value) => updateTheme(value as CopybookTheme)} value={theme}>
                  {Object.entries(copybookThemes).map(([value, config]) => (
                    <option key={value} value={value}>
                      {config.label}
                    </option>
                  ))}
                </QuickSettingSelect>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <QuickSettingRange label="字号" max={60} min={12} onChange={setFontSize} value={fontSize} />
                    <QuickSettingRange label="上下" max={12} min={-12} onChange={setContentOffsetY} value={contentOffsetY} />
                  </div>
                </>
              )}
            </ControlPanel>

            {nameLabelOpen && isNameLabelTemplate ? (
              <NameLabelSettingsPopover
                frame={advancedPopoverFrame}
                onBackgroundUpload={handleNameLabelBackgroundUpload}
                onChange={setNameLabelOptions}
                onClose={() => setNameLabelOpen(false)}
                onOpenRoster={() => setNameLabelRosterOpen(true)}
                options={nameLabelOptions}
                page={paperSizes[paperSize]}
                rosterCount={nameLabelRosterCount}
                rosterMode={nameLabelRosterMode}
              />
            ) : null}

            {nameLabelRosterOpen && isNameLabelTemplate ? (
              <NameLabelRosterDialog
                active={nameLabelRosterMode}
                initialText={nameLabelRosterMode ? text : ""}
                onApply={(entries) => applyNameLabelRoster(entries)}
                onClose={() => setNameLabelRosterOpen(false)}
                onExitRoster={() => {
                  setNameLabelRosterMode(false);
                  setNameLabelRosterOpen(false);
                  setMessage("已退出名单模式，恢复普通姓名贴分页。");
                }}
              />
            ) : null}

            {watermarkOpen ? (
              <div
                className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-2xl"
                style={{ maxHeight: advancedPopoverFrame.maxHeight, width: advancedPopoverFrame.width }}
              >
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">水印设置</h2>
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setWatermarkOpen(false)}
                    type="button"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="space-y-5 pb-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input checked={showTextWatermark} onChange={(event) => setShowTextWatermark(event.target.checked)} type="checkbox" />
                        文本水印
                      </label>
                      <Input
                        className="min-w-[180px] flex-1"
                        disabled={!showTextWatermark}
                        onChange={(event) => setWatermarkText(event.target.value)}
                        placeholder="请输入水印文本"
                        value={watermarkText}
                      />
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字体
                        <Select
                          className="h-10 w-[112px]"
                          disabled={!showTextWatermark}
                          onChange={(event) => setWatermarkTextFont(event.target.value as WorksheetTitleFont)}
                          value={watermarkTextFont}
                        >
                          <option value="copybook">字帖</option>
                          <option value="kaiti">楷体</option>
                          <option value="songti">宋体</option>
                          <option value="heiti">黑体</option>
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字号
                        <Input
                          className="h-10 w-20"
                          disabled={!showTextWatermark}
                          max={60}
                          min={14}
                          onChange={(event) => setWatermarkTextFontSize(clampNumber(event.target.value, 14, 60))}
                          type="number"
                          value={watermarkTextFontSize}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input checked={showImageWatermark} onChange={(event) => setShowImageWatermark(event.target.checked)} type="checkbox" />
                        图片水印
                      </label>
                      <label
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm",
                          showImageWatermark ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-60"
                        )}
                      >
                        <Upload className="size-4" />
                        上传图片
                        <input
                          accept="image/png,image/jpeg"
                          className="sr-only"
                          disabled={!showImageWatermark}
                          onChange={handleWatermarkImageUpload}
                          type="file"
                        />
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        高度
                        <Select
                          className="h-10 w-24"
                          disabled={!showImageWatermark}
                          onChange={(event) => setWatermarkImageHeight(clampNumber(event.target.value, 40, 180))}
                          value={String(watermarkImageHeight)}
                        >
                          {watermarkImageHeightOptions.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </label>
                      {showImageWatermark && watermarkImageSrc ? (
                        <div className="flex min-w-0 items-center gap-2">
                          <img
                            alt="图片水印预览"
                            className="h-10 w-14 rounded border border-slate-200 bg-white object-contain"
                            src={watermarkImageSrc}
                          />
                          <span className="max-w-[120px] truncate text-xs font-semibold text-slate-500">{watermarkImageName}</span>
                          <button
                            className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-white"
                            onClick={() => {
                              setWatermarkImageSrc("");
                              setWatermarkImageName("");
                            }}
                            type="button"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        水印位置
                        <Select
                          className="h-10 w-[132px]"
                          disabled={!showTextWatermark && !showImageWatermark}
                          onChange={(event) => setWatermarkPosition(event.target.value as WatermarkPosition)}
                          value={watermarkPosition}
                        >
                          {watermarkPositionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        水印灰度
                        <Select
                          className="h-10 w-24"
                          disabled={!showTextWatermark && !showImageWatermark}
                          onChange={(event) => setWatermarkGray(clampNumber(event.target.value, 10, 90))}
                          value={String(watermarkGray)}
                        >
                          {watermarkGrayOptions.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>
                  </div>
                  <button
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-[#EF1D28] text-sm font-bold text-white shadow-sm transition hover:bg-[#D71920]"
                    onClick={() => setWatermarkOpen(false)}
                    type="button"
                  >
                    确认修改
                  </button>
                </div>
              </div>
            ) : null}

            {advancedOpen ? (
              <div
                className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-2xl"
                style={{ maxHeight: advancedPopoverFrame.maxHeight, width: advancedPopoverFrame.width }}
              >
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">高级设置</h2>
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setAdvancedOpen(false)}
                    type="button"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="space-y-5 pb-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        框格线色
                        <Input onChange={(event) => setStrokeColor(event.target.value)} type="color" value={strokeColor} />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        辅助线色
                        <Input onChange={(event) => setGuideColor(event.target.value)} type="color" value={guideColor} />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        示范字色
                        <Input onChange={(event) => setTextColor(event.target.value)} type="color" value={textColor} />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700">
                        描写字色
                        <Input onChange={(event) => setTraceColor(event.target.value)} type="color" value={traceColor} />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input checked={showSheetTitle} onChange={(event) => setShowSheetTitle(event.target.checked)} type="checkbox" />
                        显示标题
                      </label>
                      <Input
                        className="min-w-[180px] flex-1"
                        disabled={!showSheetTitle}
                        onChange={(event) => setSheetTitle(event.target.value)}
                        placeholder="请输入标题内容"
                        value={sheetTitle}
                      />
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字体
                        <Select
                          className="h-10 w-[112px]"
                          disabled={!showSheetTitle}
                          onChange={(event) => setTitleFont(event.target.value as WorksheetTitleFont)}
                          value={titleFont}
                        >
                          <option value="copybook">字帖</option>
                          <option value="kaiti">楷体</option>
                          <option value="songti">宋体</option>
                          <option value="heiti">黑体</option>
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字号
                        <Input
                          className="h-10 w-20"
                          disabled={!showSheetTitle}
                          max={32}
                          min={10}
                          onChange={(event) => setTitleFontSize(clampNumber(event.target.value, 10, 32))}
                          type="number"
                          value={titleFontSize}
                        />
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        颜色
                        <Input
                          className="h-10 w-16"
                          disabled={!showSheetTitle}
                          onChange={(event) => setTitleColor(event.target.value)}
                          type="color"
                          value={titleColor}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">学生信息</h3>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      <WorksheetFieldEditor
                        checked={showStudentSchool}
                        className="col-span-2"
                        label="学校"
                        layout="stacked"
                        onCheckedChange={setShowStudentSchool}
                        onValueChange={setStudentSchool}
                        value={studentSchool}
                      />
                      <WorksheetFieldEditor
                        checked={showStudentClass}
                        label="班级"
                        layout="stacked"
                        onCheckedChange={setShowStudentClass}
                        onValueChange={setStudentClass}
                        value={studentClass}
                      />
                      <WorksheetFieldEditor
                        checked={showStudentName}
                        label="姓名"
                        layout="stacked"
                        onCheckedChange={setShowStudentName}
                        onValueChange={setStudentName}
                        value={studentName}
                      />
                      <WorksheetFieldEditor
                        checked={showStudentNumber}
                        label="学号"
                        layout="stacked"
                        onCheckedChange={setShowStudentNumber}
                        onValueChange={setStudentNumber}
                        value={studentNumber}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input checked={showFooterText} onChange={(event) => setShowFooterText(event.target.checked)} type="checkbox" />
                        页脚文字
                      </label>
                      <Input
                        className="min-w-[180px] flex-1"
                        disabled={!showFooterText}
                        onChange={(event) => setFooterText(event.target.value)}
                        placeholder="请输入页脚文字"
                        value={footerText}
                      />
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字体
                        <Select
                          className="h-10 w-[112px]"
                          disabled={!showFooterText}
                          onChange={(event) => setFooterFont(event.target.value as WorksheetTitleFont)}
                          value={footerFont}
                        >
                          <option value="copybook">字帖</option>
                          <option value="kaiti">楷体</option>
                          <option value="songti">宋体</option>
                          <option value="heiti">黑体</option>
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        字号
                        <Input
                          className="h-10 w-20"
                          disabled={!showFooterText}
                          max={24}
                          min={8}
                          onChange={(event) => setFooterFontSize(clampNumber(event.target.value, 8, 24))}
                          type="number"
                          value={footerFontSize}
                        />
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        颜色
                        <Input
                          className="h-10 w-16"
                          disabled={!showFooterText}
                          onChange={(event) => setFooterColor(event.target.value)}
                          type="color"
                          value={footerColor}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-700 lg:flex-nowrap">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberPosition !== "hidden"}
                          onChange={(event) => setPageNumberPosition(event.target.checked ? "bottom-center" : "hidden")}
                          type="checkbox"
                        />
                        显示页码
                      </label>
                      <span className="whitespace-nowrap text-slate-500">位置</span>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberPosition === "bottom-center"}
                          disabled={pageNumberPosition === "hidden"}
                          name="zitie-page-number-position"
                          onChange={() => setPageNumberPosition("bottom-center")}
                          type="radio"
                        />
                        居中
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberPosition === "bottom-right"}
                          disabled={pageNumberPosition === "hidden"}
                          name="zitie-page-number-position"
                          onChange={() => setPageNumberPosition("bottom-right")}
                          type="radio"
                        />
                        居右
                      </label>
                      <span className="whitespace-nowrap text-slate-500">形式</span>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberFormat === "number-only"}
                          disabled={pageNumberPosition === "hidden"}
                          name="zitie-page-number-format"
                          onChange={() => setPageNumberFormat("number-only")}
                          type="radio"
                        />
                        1
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberFormat === "fraction"}
                          disabled={pageNumberPosition === "hidden"}
                          name="zitie-page-number-format"
                          onChange={() => setPageNumberFormat("fraction")}
                          type="radio"
                        />
                        1/20
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <input
                          checked={pageNumberFormat === "full"}
                          disabled={pageNumberPosition === "hidden"}
                          name="zitie-page-number-format"
                          onChange={() => setPageNumberFormat("full")}
                          type="radio"
                        />
                        第1页/共20页
                      </label>
                    </div>
                  </div>
                  <button
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-[#EF1D28] text-sm font-bold text-white shadow-sm transition hover:bg-[#D71920]"
                    onClick={() => setAdvancedOpen(false)}
                    type="button"
                  >
                    确认修改
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]" ref={actionButtonsRef}>
            <button
              className="inline-flex h-[60px] min-w-0 items-center justify-center gap-2 rounded-lg bg-[#EB333D] px-5 text-base font-bold whitespace-nowrap text-white shadow-sm transition hover:bg-[#D71920] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGenerating || chars.length === 0}
              onClick={requestGenerateCopybook}
              type="button"
            >
              {isGenerating ? <Loader2 className="size-6 animate-spin" /> : <Sparkles className="size-6" />}
              {isGenerating ? "正在生成" : "生成字帖"}
            </button>
            <div className="grid gap-3 sm:grid-cols-3 xl:w-[456px]">
              <button
                className="inline-flex h-[60px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-base font-bold text-[#EF1D28] shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDownloading || !hasGeneratedCurrentLayout}
                onClick={downloadPdf}
                title={hasGeneratedCurrentLayout ? "导出 PDF" : "请先生成字帖"}
                type="button"
              >
                {isDownloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
                导出PDF
              </button>
              <button
                className="inline-flex h-[60px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasGeneratedCurrentLayout}
                onClick={printCopybook}
                title={hasGeneratedCurrentLayout ? "打印字帖" : "请先生成字帖"}
                type="button"
              >
                <Printer className="size-5" />
                打印字帖
              </button>
              <button
                className="inline-flex h-[60px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={openCopybookRecords}
                type="button"
              >
                <FileText className="size-5" />
                字帖记录
              </button>
            </div>
          </div>

          {loginPromptOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4">
              <div className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">请先登录</h2>
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setLoginPromptOpen(false)}
                    type="button"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="text-sm leading-6 text-slate-700">生成字帖需要登录，请先登录后继续。</p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={() => setLoginPromptOpen(false)}
                    type="button"
                  >
                    取消
                  </button>
                  <Link
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-[#EF1D28] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#D71920]"
                    href="/login?next=%2Fzitie"
                  >
                    去登录
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {generateConfirmOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4">
              <div className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">确认生成字帖</h2>
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setGenerateConfirmOpen(false)}
                    type="button"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="text-sm leading-6 text-slate-700">
                  {generatePricing.confirmationMessage}
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={() => setGenerateConfirmOpen(false)}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-[#EF1D28] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#D71920] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isGenerating}
                    onClick={generateCopybook}
                    type="button"
                  >
                    {isGenerating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    确认生成
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {recordModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4">
              <div className="flex max-h-[calc(100vh-32px)] w-[min(760px,calc(100vw-32px))] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-bold text-slate-900">字帖记录</h2>
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    onClick={() => setRecordModalOpen(false)}
                    type="button"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="min-h-[260px] overflow-y-auto p-5">
                  {recordListMessage ? (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      {recordListMessage}
                    </div>
                  ) : null}
                  {isRecordListLoading ? (
                    <div className="flex h-40 items-center justify-center text-sm font-semibold text-slate-500">
                      <Loader2 className="mr-2 size-5 animate-spin" />
                      正在加载字帖记录
                    </div>
                  ) : copybookRecords.length === 0 ? (
                    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-semibold text-slate-500">
                      暂无生成记录
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {copybookRecords.map((record) => (
                        <div
                          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          key={record.id}
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700">
                              {record.templateName}
                            </span>
                            <span className="min-w-[120px] flex-1 truncate font-bold text-slate-900">
                              {record.contentPreview}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              {formatCopybookRecordTime(record.createdAt)}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-500">{record.pageCount} 页</span>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {record.templateId === "name-label" ? (
                              <button
                                aria-label="做同款"
                                className="inline-flex size-9 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={restoringRecordId === record.id}
                                onClick={() => restoreNameLabelRecord(record)}
                                title={record.hasSourceConfig ? "做同款" : "旧记录未保存姓名贴设置"}
                                type="button"
                              >
                                {restoringRecordId === record.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Copy className="size-4" />
                                )}
                              </button>
                            ) : null}
                            <button
                              aria-label="查看"
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              onClick={() => viewCopybookRecord(record)}
                              title="查看"
                              type="button"
                            >
                              <Eye className="size-4" />
                            </button>
                            <button
                              aria-label="下载"
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 bg-white text-[#EF1D28] hover:bg-red-50"
                              onClick={() => downloadCopybookRecord(record)}
                              title="下载"
                              type="button"
                            >
                              <Download className="size-4" />
                            </button>
                            <button
                              aria-label="删除"
                              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingRecordId === record.id}
                              onClick={() => deleteCopybookRecord(record.id)}
                              title="删除"
                              type="button"
                            >
                              {deletingRecordId === record.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showMoreTemplates ? (
            <div className="fixed left-1/2 top-1/2 z-40 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">更多模板</h2>
                <button
                  className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  onClick={() => setShowMoreTemplates(false)}
                  type="button"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {templates.map((template) => (
                  <button
                    className="flex min-h-[102px] flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm hover:border-red-200 hover:bg-red-50"
                    key={`more-${template.id}`}
                    onClick={() => applyTemplate(template)}
                    type="button"
                  >
                    <span className={cn("flex size-9 items-center justify-center rounded-md", toneClasses[template.tone])}>
                      <template.icon className="size-5" />
                    </span>
                    <span className="text-sm font-bold text-slate-900">{template.title}</span>
                    <span className="text-xs leading-4 text-slate-500">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <section
          className="relative flex h-[calc(100vh-104px)] min-w-0 flex-col overflow-hidden rounded-lg bg-[#F7F9FD]"
          ref={previewSectionRef}
        >
          <div
            className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-4 pb-4 pt-0"
            ref={previewViewportRef}
          >
            <div
              className="zitie-preview flex shrink-0 flex-col items-center gap-6 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:rounded-[4px] [&_svg]:bg-white [&_svg]:shadow-[0_8px_28px_rgba(15,23,42,0.16)]"
              onClick={handlePreviewClick}
              style={{ width: fixed(previewBasePageLayout.page.width * previewZoom) }}
            >
              {previewPageSvgs.length > 0 ? (
                previewPageSvgs.map((pageSvg, index) => (
                  <div
                    className="w-full"
                    dangerouslySetInnerHTML={{ __html: pageSvg }}
                    key={`preview-page-${index}`}
                    ref={(node) => {
                      previewPageRefs.current[index] = node;
                    }}
                  />
                ))
              ) : (
                <div
                  className="flex w-full items-center justify-center rounded-[4px] bg-white text-sm text-slate-500 shadow-[0_8px_28px_rgba(15,23,42,0.16)]"
                  style={{ height: fixed(previewBasePageLayout.page.height * previewZoom) }}
                >
                  {message || "正在生成预览"}
                </div>
              )}
            </div>
          </div>
          <div
            className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
            ref={previewToolbarRef}
            style={{ top: previewToolbarTop ?? undefined }}
          >
            <div className="pointer-events-auto flex items-center justify-center gap-2">
              <button
                aria-label="放大"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => zoomPreviewBy(previewZoomStep)}
                title="放大"
                type="button"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                aria-label="缩小"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => zoomPreviewBy(-previewZoomStep)}
                title="缩小"
                type="button"
              >
                <ZoomOut className="size-4" />
              </button>
              <button
                aria-label="上一页"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={previewCurrentPageIndex <= 0}
                onClick={() => goPreviewPage(-1)}
                title="上一页"
                type="button"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                aria-label="下一页"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={previewCurrentPageIndex >= previewPageCount - 1}
                onClick={() => goPreviewPage(1)}
                title="下一页"
                type="button"
              >
                <ChevronRight className="size-4" />
              </button>
              <button
                aria-label="全宽"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={fitPreviewWidth}
                title="全宽"
                type="button"
              >
                <Maximize2 className="size-4" />
              </button>
              <button
                aria-label="全高"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={fitPreviewHeight}
                title="全高"
                type="button"
              >
                <MoveVertical className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </section>

      {message ? (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {message}
        </div>
      ) : null}

      {pinyinPicker ? (
        <div
          className="fixed z-50 rounded-lg border border-yellow-200 bg-white p-2 shadow-xl"
          style={{ left: pinyinPicker.x, top: pinyinPicker.y }}
        >
          <div className="mb-1 px-2 text-xs font-semibold text-slate-500">
            选择“{pinyinPicker.char}”的读音
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pinyinPicker.options.map((option) => (
              <button
                className="rounded-md border border-slate-200 bg-yellow-50 px-3 py-1.5 text-sm font-bold text-slate-900 hover:border-yellow-300 hover:bg-yellow-100"
                key={`${pinyinPicker.key}-${option}`}
                onClick={() => selectStrokePinyin(pinyinPicker.key, option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ControlPanel({
  action,
  children,
  icon,
  title
}: {
  action?: React.ReactNode;
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
      <div className={cn("flex items-center justify-between gap-3", children ? "mb-4" : "")}>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function FontPickerPopover({
  favoriteFontIds,
  fonts,
  initialFilter,
  onDeleteFont,
  onSelect,
  onToggleFavorite,
  onUploadFont,
  selectedFontId,
  userUploadedFontIds
}: {
  favoriteFontIds: string[];
  fonts: FontPickerOption[];
  initialFilter: FontPickerFilter;
  onDeleteFont: (fontId: string) => Promise<void>;
  onSelect: (fontId: string) => void;
  onToggleFavorite: (fontId: string) => void;
  onUploadFont: (file: File) => Promise<void>;
  selectedFontId: string;
  userUploadedFontIds: string[];
}) {
  const [filter, setFilter] = useState<FontPickerFilter>(initialFilter);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingFontId, setDeletingFontId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [popoverFrame, setPopoverFrame] = useState({ width: 760, maxHeight: 560 });
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const userUploadedFontIdSet = new Set(userUploadedFontIds);
  const favoriteFontIdSet = new Set(favoriteFontIds);
  const isUserUploadedFont = (font: FontPickerOption) => isUserUploadedFontOption(font, userUploadedFontIdSet);
  const visibleFonts = fonts.filter((font) => {
    if (filter === "chinese") {
      return !isUserUploadedFont(font) && isChineseFontOption(font);
    }

    if (filter === "english") {
      return !isUserUploadedFont(font) && isEnglishFontOption(font);
    }

    return !isUserUploadedFont(font);
  });
  const userUploadedFonts = fonts.filter((font) => isUserUploadedFont(font));
  const favoriteFonts = fonts.filter((font) => favoriteFontIdSet.has(font.id) && !isUserUploadedFont(font));
  const displayFonts = filter === "mine" ? [...userUploadedFonts, ...favoriteFonts] : visibleFonts;

  useEffect(() => {
    function updatePopoverFrame() {
      setPopoverFrame(centeredPopoverSize(840, 720));
    }

    updatePopoverFrame();
    window.addEventListener("resize", updatePopoverFrame);
    window.addEventListener("scroll", updatePopoverFrame, true);

    return () => {
      window.removeEventListener("resize", updatePopoverFrame);
      window.removeEventListener("scroll", updatePopoverFrame, true);
    };
  }, []);

  async function handleUpload(file: File) {
    if (!isAllowedFontUpload(file)) {
      setUploadMessage("仅支持 ttf、otf、ttc、woff、woff2 字体文件");
      return;
    }

    if (file.size > 60 * 1024 * 1024) {
      setUploadMessage("字体文件大小不能超过 60MB");
      return;
    }

    setIsUploading(true);
    setUploadMessage("");

    try {
      await onUploadFont(file);
      setUploadMessage("字体上传成功，已自动选中。");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "字体上传失败，请稍后重试。");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteFont(font: FontPickerOption) {
    if (font.type !== "custom" || !window.confirm(`确认删除字体“${font.label}”？`)) {
      return;
    }

    setDeletingFontId(font.id);
    setUploadMessage("");

    try {
      await onDeleteFont(font.id);
      setUploadMessage("字体已删除。");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "字体删除失败，请稍后重试。");
    } finally {
      setDeletingFontId(null);
    }
  }

  return (
    <div
      className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-2xl"
      style={{ maxHeight: popoverFrame.maxHeight, width: popoverFrame.width }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        {[
          { id: "chinese", label: "中文字体" },
          { id: "english", label: "英文字体" },
          { id: "mine", label: "我的字体" }
        ].map((item) => (
          <button
            aria-pressed={filter === item.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              filter === item.id
                ? "border-red-200 bg-red-50 text-[#EF1D28]"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50",
              item.id === "chinese" ? "text-sm font-bold" : ""
            )}
            key={item.id}
            onClick={() => {
              setFilter(item.id as FontPickerFilter);
              setUploadMessage("");
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
        {filter === "mine" ? (
          <div className="ml-auto flex items-center gap-2">
            <input
              accept=".ttf,.otf,.ttc,.woff,.woff2,font/ttf,font/otf,font/collection,font/woff,font/woff2"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;

                event.currentTarget.value = "";

                if (file) {
                  void handleUpload(file);
                }
              }}
              ref={uploadInputRef}
              type="file"
            />
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#EF1D28] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#d71923] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUploading}
              onClick={() => uploadInputRef.current?.click()}
              type="button"
            >
              {isUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {isUploading ? "上传中" : "上传字体"}
            </button>
          </div>
        ) : null}
      </div>
      {filter === "mine" && uploadMessage ? (
        <p className={cn("mb-2 px-1 text-xs font-medium", uploadMessage.includes("成功") ? "text-emerald-600" : "text-[#EF1D28]")}>
          {uploadMessage}
        </p>
      ) : null}
      {displayFonts.length > 0 ? (
        <div className="grid max-h-[430px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {displayFonts.map((font) => {
            const selected = font.id === selectedFontId;
            const showChinesePreview = filter !== "english" && isChineseFontOption(font);
            const showFavoriteButton = filter === "chinese" || filter === "english";
            const showDeleteButton = filter === "mine" && isUserUploadedFont(font);
            const favorite = favoriteFontIdSet.has(font.id);
            const actionButtonVisible = showFavoriteButton || showDeleteButton;

            return (
              <div
                className={cn(
                  "relative rounded-lg border bg-white text-left shadow-sm transition hover:border-red-200 hover:bg-red-50",
                  selected ? "border-red-300 bg-red-50 ring-1 ring-red-200" : "border-slate-200"
                )}
                key={font.id}
              >
                <button className="flex min-h-[112px] w-full flex-col p-3 pr-11 text-left" onClick={() => onSelect(font.id)} type="button">
                  <span className="flex min-h-[70px] flex-col justify-start">
                    {showChinesePreview ? (
                      <span className="block whitespace-nowrap text-[23px] leading-9 text-slate-950" style={{ fontFamily: fontPreviewFamily(font) }}>
                        {fontPreviewChineseText}
                      </span>
                    ) : null}
                    <span
                      className={cn("block whitespace-nowrap leading-8 text-slate-700", showChinesePreview ? "text-[20px]" : "text-[24px]")}
                      style={{ fontFamily: fontPreviewFamily(font) }}
                    >
                      {fontPreviewEnglishText}
                    </span>
                  </span>
                  <span className="mt-auto flex h-6 items-end justify-between gap-2 text-xs font-semibold">
                    <span className="min-w-0 truncate text-slate-500">{font.label}</span>
                    {selected ? <span className={cn("shrink-0 text-[#EF1D28]", actionButtonVisible ? "mr-6" : "")}>已选</span> : null}
                  </span>
                </button>
                {showFavoriteButton ? (
                  <button
                    aria-label={favorite ? `取消收藏${font.label}` : `收藏${font.label}`}
                    className={cn(
                      "absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full border bg-white shadow-sm transition hover:border-amber-300 hover:bg-amber-50",
                      favorite ? "border-amber-300 text-amber-400" : "border-slate-200 text-slate-300"
                    )}
                    onClick={() => onToggleFavorite(font.id)}
                    type="button"
                  >
                    <Star className="size-4" fill={favorite ? "currentColor" : "none"} />
                  </button>
                ) : null}
                {showDeleteButton ? (
                  <button
                    aria-label={`删除${font.label}`}
                    className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full border border-red-100 bg-white text-red-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#EF1D28] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={deletingFontId === font.id}
                    onClick={() => void handleDeleteFont(font)}
                    type="button"
                  >
                    {deletingFontId === font.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm font-medium text-slate-400">
          暂无对应字体
        </div>
      )}
    </div>
  );
}

function TemplateButton({ onClick, template }: { onClick: () => void; template: TemplateOption }) {
  return (
    <button
      className="flex min-h-[78px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50"
      onClick={onClick}
      type="button"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", toneClasses[template.tone])}>
        <template.icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-900">{template.title}</span>
        <span className="block truncate text-xs text-slate-500">{template.description}</span>
      </span>
    </button>
  );
}

function centeredPopoverSize(maxWidth: number, minDesktopWidth = 520) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const availableWidth = viewportWidth - centeredPopoverPadding * 2;
  const mobileWidth = Math.max(280, availableWidth);
  const desktopWidth = Math.min(maxWidth, Math.max(minDesktopWidth, availableWidth * 0.72));

  return {
    maxHeight: Math.max(260, viewportHeight - centeredPopoverPadding * 2),
    width: viewportWidth < 768 ? mobileWidth : Math.min(availableWidth, desktopWidth)
  };
}

function QuickSettingSelect({
  children,
  disabled = false,
  label,
  onChange,
  value
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={cn("rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5", disabled ? "opacity-60" : "")}>
      <span className="block text-sm text-slate-500">{label}</span>
      <Select
        className="mt-1 h-8 border-0 bg-transparent px-0 py-0 text-base font-bold text-slate-950 shadow-none focus:border-0 focus:ring-0 disabled:cursor-not-allowed"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </Select>
    </label>
  );
}

function QuickSettingRange({
  compact = false,
  decimals,
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix = "",
  value
}: {
  compact?: boolean;
  decimals?: number;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <label
      className={cn(
        "flex h-12 items-center rounded-lg border border-slate-200 bg-slate-50 py-2",
        compact ? "gap-1.5 px-2" : "gap-3 px-4"
      )}
    >
      <span className="shrink-0 text-sm font-semibold text-slate-500">{label}</span>
      <input
        aria-label={label}
        className="h-3 min-w-0 flex-1 cursor-pointer accent-[#EF1D28]"
        max={max}
        min={min}
        onChange={(event) => onChange(clampSteppedNumber(event.target.value, min, max, step))}
        step={step}
        type="range"
        value={value}
      />
      <span className={cn("shrink-0 text-right text-sm font-bold text-slate-950", suffix ? "w-12" : "w-8")}>
        {decimals === undefined ? value : value.toFixed(decimals)}{suffix}
      </span>
    </label>
  );
}

function NameLabelSettingsPopover({
  frame,
  onBackgroundUpload,
  onChange,
  onClose,
  onOpenRoster,
  options,
  page,
  rosterCount,
  rosterMode
}: {
  frame: { width: number; maxHeight: number };
  onBackgroundUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onChange: Dispatch<SetStateAction<NameLabelOptions>>;
  onClose: () => void;
  onOpenRoster: () => void;
  options: NameLabelOptions;
  page: CopybookLayout["page"];
  rosterCount: number;
  rosterMode: boolean;
}) {
  const pageMargins = nameLabelPageMarginsToPoints(options.pageMarginPreset ?? "narrow");
  const geometry = buildNameLabelSheetGeometry({
    pageWidth: page.width,
    pageHeight: page.height,
    pageMarginPreset: options.pageMarginPreset ?? "narrow",
    labelWidthCm: options.labelWidthCm,
    labelHeightCm: options.labelHeightCm,
    verticalGapCm: options.verticalGapCm,
    columnsMode: options.columnsMode,
    manualColumns: options.manualColumns
  });
  const maxWidthCm = fixed((page.width - pageMargins.left - pageMargins.right) / centimetersToPoints(1));
  const maxHeightCm = fixed((page.height - pageMargins.top - pageMargins.bottom) / centimetersToPoints(1));
  const update = <Key extends keyof NameLabelOptions>(key: Key, value: NameLabelOptions[Key]) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl"
      style={{ maxHeight: frame.maxHeight, width: frame.width }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">姓名贴设置</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            当前每页 {geometry.columns} 列 × {geometry.rows} 行，共 {geometry.capacity} 张
            {rosterMode ? ` · 名单 ${rosterCount} 人 / ${rosterCount} 页` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#EF1D28] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#d81923]"
            onClick={onOpenRoster}
            type="button"
          >
            <Upload className="size-4" />
            {rosterMode ? "修改名单" : "录入名单"}
          </button>
          <button
            aria-label="关闭姓名贴设置"
            className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="space-y-0 px-6">
        <section className="border-b border-slate-100 py-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">尺寸与排布</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CompactNumberField
              label="宽度（cm）"
              max={maxWidthCm}
              min={2}
              onChange={(value) => update("labelWidthCm", value)}
              step={0.1}
              value={options.labelWidthCm}
            />
            <CompactNumberField
              label="高度（cm）"
              max={maxHeightCm}
              min={1.5}
              onChange={(value) => update("labelHeightCm", value)}
              step={0.1}
              value={options.labelHeightCm}
            />
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">每行数量</span>
              <Select
                className="h-10 w-full"
                onChange={(event) => update("columnsMode", event.target.value as NameLabelColumnsMode)}
                value={options.columnsMode}
              >
                <option value="auto">按宽度自动</option>
                <option value="manual">手动指定</option>
              </Select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">手动列数</span>
              <Select
                className="h-10 w-full"
                disabled={options.columnsMode !== "manual"}
                onChange={(event) => update("manualColumns", clampNumber(event.target.value, 1, Math.max(1, geometry.maxColumns)))}
                value={String(Math.min(options.manualColumns, Math.max(1, geometry.maxColumns)))}
              >
                {Array.from({ length: Math.max(1, geometry.maxColumns) }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count} 列</option>
                ))}
              </Select>
            </label>
            <CompactNumberField
              label="纵向间距（cm）"
              max={3}
              min={0}
              onChange={(value) => update("verticalGapCm", value)}
              step={0.1}
              value={options.verticalGapCm}
            />
          </div>
        </section>

        <section className="border-b border-slate-100 py-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">内容分组与排版</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">标签分隔</span>
              <Select
                className="h-10 w-full"
                onChange={(event) => update("separatorMode", event.target.value as NameLabelSeparatorMode)}
                value={options.separatorMode}
              >
                <option value="blank-line">空一行分隔</option>
                <option value="custom">自定义分隔符</option>
              </Select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">分隔符</span>
              <Input
                className="h-10"
                disabled={options.separatorMode !== "custom"}
                maxLength={12}
                onChange={(event) => update("customSeparator", event.target.value)}
                placeholder="例如：---"
                value={options.customSeparator}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">文字排版</span>
              <Select
                className="h-10 w-full"
                onChange={(event) => update("textLayout", event.target.value as NameLabelTextLayout)}
                value={options.textLayout}
              >
                <option value="auto">自动识别</option>
                <option value="center">全部居中</option>
                <option value="field-line">字段横线</option>
              </Select>
            </label>
            <label className="flex h-[66px] items-end pb-2 text-sm font-semibold text-slate-700">
              <span className="flex items-center gap-2">
                <input
                  checked={options.showUnderline}
                  onChange={(event) => update("showUnderline", event.target.checked)}
                  type="checkbox"
                />
                显示横线
              </span>
            </label>
          </div>
        </section>

        <section className="border-b border-slate-100 py-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">边框</h3>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                checked={options.showBorder}
                onChange={(event) => update("showBorder", event.target.checked)}
                type="checkbox"
              />
              显示边框
            </label>
            <label className="text-sm font-semibold text-slate-700">
              <span className="mb-1.5 block">边框样式</span>
              <Select
                className="h-10 w-full"
                disabled={!options.showBorder}
                onChange={(event) => update("borderStyle", event.target.value as NameLabelBorderStyle)}
                value={options.borderStyle}
              >
                <option value="single">单边框</option>
                <option value="double">双边框</option>
              </Select>
            </label>
          </div>
          {options.showBorder ? (
            <div className={cn("mt-4 grid gap-4", options.borderStyle === "double" ? "lg:grid-cols-2" : "lg:grid-cols-1")}>
              <fieldset className="rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-bold text-slate-800">
                  {options.borderStyle === "double" ? "外框" : "边框"}
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ColorField
                    label="颜色"
                    onChange={(value) => update("borderColor", value)}
                    value={options.borderColor}
                  />
                  <CompactNumberField
                    label="粗细（pt）"
                    max={8}
                    min={0.5}
                    onChange={(value) => update("borderWidth", value)}
                    step={0.25}
                    value={options.borderWidth}
                  />
                  <CompactNumberField
                    label="圆角（cm）"
                    max={1.5}
                    min={0}
                    onChange={(value) => update("borderRadiusCm", value)}
                    step={0.05}
                    value={options.borderRadiusCm}
                  />
                </div>
              </fieldset>
              {options.borderStyle === "double" ? (
                <fieldset className="rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-bold text-slate-800">内框</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ColorField
                      label="颜色"
                      onChange={(value) => update("innerBorderColor", value)}
                      value={options.innerBorderColor}
                    />
                    <CompactNumberField
                      label="粗细（pt）"
                      max={6}
                      min={0.25}
                      onChange={(value) => update("innerBorderWidth", value)}
                      step={0.25}
                      value={options.innerBorderWidth}
                    />
                    <CompactNumberField
                      label="圆角（cm）"
                      max={1.5}
                      min={0}
                      onChange={(value) => update("innerBorderRadiusCm", value)}
                      step={0.05}
                      value={options.innerBorderRadiusCm}
                    />
                  </div>
                </fieldset>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="py-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">标签背景</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="size-4" />
              {options.backgroundImageSrc ? "替换背景" : "上传背景"}
              <input accept="image/png,image/jpeg" className="hidden" onChange={onBackgroundUpload} type="file" />
            </label>
            {options.backgroundImageSrc ? (
              <>
                <img
                  alt="姓名贴背景预览"
                  className="h-16 w-28 rounded-md border border-slate-200 object-cover"
                  src={options.backgroundImageSrc}
                />
                <span className="max-w-[220px] truncate text-sm font-medium text-slate-500">
                  {options.backgroundImageName}
                </span>
                <button
                  aria-label="删除姓名贴背景"
                  className="flex size-9 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
                  onClick={() => onChange((current) => ({ ...current, backgroundImageName: "", backgroundImageSrc: "" }))}
                  title="删除背景"
                  type="button"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-400">PNG 或 JPG，单张不超过 4MB</span>
            )}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-6 py-4">
        <button
          className="h-10 rounded-lg bg-[#EF1D28] px-6 text-sm font-bold text-white shadow-sm hover:bg-[#D71923]"
          onClick={onClose}
          type="button"
        >
          确认修改
        </button>
      </div>
    </div>
  );
}

function ColorField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      <input
        className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white p-1"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </label>
  );
}

function CompactNumberField({
  disabled = false,
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      <Input
        className="h-10"
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(clampSteppedNumber(event.target.value, min, max, step))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function WorksheetFieldEditor({
  checked,
  className,
  label,
  layout = "inline",
  onCheckedChange,
  onValueChange,
  value
}: {
  checked: boolean;
  className?: string;
  label: string;
  layout?: "inline" | "stacked";
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className={cn("grid gap-2", layout === "inline" ? "sm:grid-cols-[96px_minmax(0,1fr)]" : "", className)}>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} type="checkbox" />
        {label}
      </label>
      <Input disabled={!checked} onChange={(event) => onValueChange(event.target.value)} placeholder={`填写${label}`} value={value} />
    </div>
  );
}

function worksheetGridY(pageInfo: CopybookLayout["page"], paperSize: PaperSize, options: WorksheetOptions) {
  const titleReserve = options.showTitle ? Math.max(28, options.titleStyle.fontSize + 12) : 0;
  const studentReserve = hasVisibleStudentFields(options) ? 26 : 0;
  const topOffset = paperSize === "A4" ? 16 : 12;

  return pageInfo.margin + topOffset + titleReserve + studentReserve + 22;
}

function worksheetBottomReserve(options: WorksheetOptions) {
  const footerReserve = options.showFooter ? Math.max(24, options.footerStyle.fontSize + 13) : 0;
  const pageNumberReserve = options.pageNumberPosition !== "hidden" ? 18 : 0;

  return Math.max(8, footerReserve + pageNumberReserve);
}

function fittedWorksheetRowCount({
  bottomReserve,
  cellHeight,
  pageInfo,
  rowGap,
  y
}: {
  bottomReserve: number;
  cellHeight: number;
  pageInfo: CopybookLayout["page"];
  rowGap: number;
  y: number;
}) {
  const availableHeight = pageInfo.height - pageInfo.margin - bottomReserve - y;
  const fittedRows = Math.floor((availableHeight + rowGap) / (cellHeight + rowGap));

  return Math.max(1, Math.min(60, Math.max(0, fittedRows)));
}

function hasVisibleStudentFields(options: WorksheetOptions) {
  return Object.values(options.studentFields).some((field) => field.visible);
}

function createWorksheet(
  options: WorksheetOptions,
  pageIndex: number,
  pageCount: number,
  fallbackTitle: string
): CopybookLayout["worksheet"] {
  const title = normalizedWorksheetText(options.title, fallbackTitle, 32);
  const footer = normalizedWorksheetText(options.footer, "好好写字  天天向上", 32);
  const pageNumberVisible = options.pageNumberPosition !== "hidden";

  return {
    title,
    footer,
    showStudentFields: hasVisibleStudentFields(options),
    showTitle: options.showTitle && Boolean(title),
    titleStyle: {
      color: options.titleStyle.color,
      font: options.titleStyle.font,
      fontSize: options.titleStyle.fontSize
    },
    showFooter: options.showFooter && Boolean(footer),
    footerStyle: {
      color: options.footerStyle.color,
      font: options.footerStyle.font,
      fontSize: options.footerStyle.fontSize
    },
    studentFields: {
      school: normalizeWorksheetField(options.studentFields.school),
      className: normalizeWorksheetField(options.studentFields.className),
      name: normalizeWorksheetField(options.studentFields.name),
      studentNumber: normalizeWorksheetField(options.studentFields.studentNumber)
    },
    pageNumber: {
      position: options.pageNumberPosition === "bottom-right" ? "bottom-right" : "bottom-center",
      text: formatPageNumberText(options.pageNumberFormat, pageIndex, pageCount),
      visible: pageNumberVisible
    }
  };
}

function formatPageNumberText(format: PageNumberFormat, pageIndex: number, pageCount: number) {
  const currentPage = pageIndex + 1;
  const totalPages = Math.max(1, pageCount);

  if (format === "number-only") {
    return String(currentPage);
  }

  if (format === "fraction") {
    return `${currentPage}/${totalPages}`;
  }

  return `第${currentPage}页/共${totalPages}页`;
}

function normalizeWorksheetField(field: WorksheetFieldConfig): WorksheetFieldConfig {
  return {
    value: field.value.trim().slice(0, 24),
    visible: field.visible
  };
}

function normalizedWorksheetText(value: string, fallback: string, maxLength: number) {
  return (value.trim() || fallback).slice(0, maxLength);
}

function createWatermark(options: WatermarkOptions): WatermarkOptions | null {
  const textValue = options.text.value.trim().slice(0, 40);
  const imageSrc = options.image.src.trim();
  const textVisible = options.text.visible && Boolean(textValue);
  const imageVisible = options.image.visible && Boolean(imageSrc);

  if (!textVisible && !imageVisible) {
    return null;
  }

  return {
    text: {
      font: options.text.font,
      fontSize: clampNumber(options.text.fontSize, 14, 60),
      visible: textVisible,
      value: textValue
    },
    image: {
      height: clampNumber(options.image.height, 40, 180),
      visible: imageVisible,
      src: imageSrc,
      name: options.image.name.trim().slice(0, 80)
    },
    position: options.position,
    gray: clampNumber(options.gray, 10, 90)
  };
}

function buildLayout({
  chars,
  contentStyle,
  contentOffsetY,
  fontSize,
  gridType,
  guideColor,
  hanziStrokeData,
  inputMode,
  paperSize,
  pinyin,
  pinyinDedicatedFont,
  practiceLineMode,
  rawText,
  repeat,
  selectedFont,
  selectedStrokePinyin,
  strokeColor,
  templateId,
  textColor,
  traceColor,
  nameLabelOptions,
  nameLabelRosterMode,
  watermarkOptions,
  worksheetOptions
}: {
  chars: string[];
  contentStyle: ContentStyle;
  contentOffsetY: number;
  fontSize: number;
  gridType: GridType;
  guideColor: string;
  hanziStrokeData: Record<string, HanziStrokeData>;
  inputMode: InputMode;
  paperSize: PaperSize;
  pinyin: string;
  pinyinDedicatedFont?: PublicCopybookFont;
  practiceLineMode: PracticeLineMode;
  rawText: string;
  repeat: number;
  selectedFont: SelectedFontConfig;
  selectedStrokePinyin: Record<string, string>;
  strokeColor: string;
  templateId: string;
  textColor: string;
  traceColor: string;
  nameLabelOptions: NameLabelOptions;
  nameLabelRosterMode: boolean;
  watermarkOptions: WatermarkOptions;
  worksheetOptions: WorksheetOptions;
}): CopybookRenderLayout {
  const pageInfo = paperSizes[paperSize];
  const isPinyinPractice = inputMode === "pinyin";
  const isAlternatePractice = practiceLineMode === "alternate";
  const isEnglishPractice = templateId === "english" && inputMode === "copybook";
  const isEnglishWordPractice = isEnglishPractice && practiceLineMode === "word";
  const isEnglishAlternatePractice = isEnglishPractice && isAlternatePractice;
  const isEnglishLetterPractice = isEnglishPractice && practiceLineMode === "letter";
  const isNumberPractice = templateId === "number" && inputMode === "copybook";
  const isEssayPaper = templateId === "essay" && inputMode === "copybook";
  const isEssayRowPractice = isEssayPaper && !isAlternatePractice;
  const isEssayAlternatePractice = isEssayPaper && isAlternatePractice;
  const isRuledPaper = templateId === "line" && inputMode === "copybook";
  const isRuledRowPractice = isRuledPaper && !isAlternatePractice;
  const isRuledAlternatePractice = isRuledPaper && isAlternatePractice;
  const isHuiPractice = templateId === "huizi" && inputMode === "copybook";
  const isCalligraphyPractice = templateId === "calligraphy" && inputMode === "copybook";
  const isPinyinTianPractice = templateId === "pinyin-tian" && inputMode === "copybook";
  const isStrokePractice = templateId === "shengzi" && inputMode === "copybook" && !isAlternatePractice;
  const isEightLinePaper = templateId === "eight-line" && inputMode === "copybook";
  const isNameLabelSheet = templateId === "name-label" && inputMode === "copybook";
  const shouldUseDedicatedPinyinFont = isStrokePractice || isPinyinTianPractice;
  const contentWidth = pageInfo.width - pageInfo.margin * 2;
  const gridCell = isPinyinPractice
    ? pinyinCellHeight
    : isPinyinTianPractice
      ? contentWidth / pinyinTianCols
    : isNumberPractice
      ? contentWidth / numberCols
      : isRuledPaper
        ? ruledLineHeightByPaper[paperSize]
      : isCalligraphyPractice
        ? contentWidth / calligraphyCols
      : isHuiPractice
        ? contentWidth / cols
      : isEssayPaper
        ? contentWidth / essayCols
        : cell;
  const gridCellWidth = isPinyinPractice
    ? pinyinCellWidth
    : isPinyinTianPractice
      ? contentWidth / pinyinTianCols
    : isEnglishAlternatePractice
      ? contentWidth
      : isEnglishLetterPractice
        ? contentWidth / englishLetterCols
        : isEnglishWordPractice
          ? contentWidth / englishWordCols
          : isNumberPractice
            ? contentWidth / numberCols
            : isRuledPaper
              ? isRuledRowPractice
                ? contentWidth / cols
                : contentWidth
            : isCalligraphyPractice
              ? contentWidth / calligraphyCols
            : isHuiPractice
              ? contentWidth / cols
            : isEssayPaper
              ? contentWidth / essayCols
              : cell;
  const gridCellHeight = isPinyinPractice
    ? pinyinCellHeight
    : isPinyinTianPractice
      ? pinyinTianHeaderHeight + gridCellWidth
    : isEssayPaper
      ? gridCellWidth * essayCellHeightRatio
      : isRuledPaper
        ? ruledLineHeightByPaper[paperSize]
      : isCalligraphyPractice
        ? gridCellWidth
      : isHuiPractice
        ? gridCellWidth
      : isNumberPractice
        ? gridCellWidth
        : cell;
  const gridRowGap = isPinyinPractice
    ? pinyinRowGap
    : isPinyinTianPractice
      ? pinyinTianRowGap
    : isEnglishPractice
      ? englishRowGap
      : isNumberPractice
        ? numberRowGap
      : isCalligraphyPractice
        ? 0
        : isHuiPractice
          ? huiRowGap
        : isEssayPaper
          ? essayRowGap
          : 0;
  const gridCols = isPinyinPractice
    ? pinyinCols
    : isPinyinTianPractice
      ? pinyinTianCols
    : isEnglishAlternatePractice
      ? 1
      : isEnglishLetterPractice
        ? englishLetterCols
        : isEnglishWordPractice
          ? englishWordCols
          : isNumberPractice
            ? numberCols
            : isRuledPaper
              ? isRuledRowPractice
                ? cols
                : 1
            : isCalligraphyPractice
              ? calligraphyCols
            : isEssayPaper
              ? essayCols
              : cols;
  const gridWidth = gridCols * gridCellWidth;
  const gridX = (pageInfo.width - gridWidth) / 2;
  const gridY = worksheetGridY(pageInfo, paperSize, worksheetOptions);
  const bottomReserve = worksheetBottomReserve(worksheetOptions);
  const rowCount = fittedWorksheetRowCount({
    bottomReserve,
    cellHeight: gridCellHeight,
    pageInfo,
    rowGap: gridRowGap,
    y: gridY
  });
  const exampleRowsPerPage = isAlternatePractice ? Math.max(1, Math.floor(rowCount / 2)) : rowCount;
  const itemsPerPage = isEssayPaper
    ? isAlternatePractice
      ? exampleRowsPerPage * gridCols
      : rowCount
    : isPinyinTianPractice
      ? rowCount * gridCols
    : isAlternatePractice
      ? exampleRowsPerPage * gridCols
      : rowCount;
  const pinyinItems = isCalligraphyPractice ? [] : pinyin.split(/\s+/).filter(Boolean);
  const renderedFontSize = isCalligraphyPractice ? fontSize * 3 : fontSize;
  const baseStyle = {
    strokeColor,
    guideColor,
    textColor,
    traceColor,
    font: selectedFont.font,
    customFontFamily: selectedFont.customFontFamily,
    customFontUrl: selectedFont.customFontUrl,
    customFontPreviewUrl: selectedFont.customFontPreviewUrl,
    customFontFallbackFamily: selectedFont.customFontFallbackFamily,
    customFontFallbackUrl: selectedFont.customFontFallbackUrl,
    customFontFallbackPreviewUrl: selectedFont.customFontFallbackPreviewUrl,
    fontEncoding: selectedFont.fontEncoding,
    fontSize: renderedFontSize,
    ...(shouldUseDedicatedPinyinFont
      ? {
          pinyinFontFamily: pinyinDedicatedFont?.name ?? pinyinDedicatedFontName,
          pinyinFontUrl: pinyinDedicatedFont ? fontUrlForPreview(pinyinDedicatedFont) : undefined,
          pinyinFontPreviewUrl: pinyinDedicatedFont ? fontUrlForBrowser(pinyinDedicatedFont, {}) : undefined
        }
      : {}),
    pinyinFontSize: 10
  };
  const watermark = createWatermark(watermarkOptions);

  if (isNameLabelSheet) {
    const labels = parseNameLabelGroups(
      rawText,
      nameLabelOptions.separatorMode,
      nameLabelOptions.customSeparator
    );
    const geometry = buildNameLabelSheetGeometry({
      pageWidth: pageInfo.width,
      pageHeight: pageInfo.height,
      pageMarginPreset: nameLabelOptions.pageMarginPreset ?? "narrow",
      labelWidthCm: nameLabelOptions.labelWidthCm,
      labelHeightCm: nameLabelOptions.labelHeightCm,
      verticalGapCm: nameLabelOptions.verticalGapCm,
      columnsMode: nameLabelOptions.columnsMode,
      manualColumns: nameLabelOptions.manualColumns
    });
    const hiddenWorksheetOptions: WorksheetOptions = {
      ...worksheetOptions,
      showFooter: false,
      showTitle: false,
      pageNumberPosition: "hidden",
      studentFields: {
        school: { value: "", visible: false },
        className: { value: "", visible: false },
        name: { value: "", visible: false },
        studentNumber: { value: "", visible: false }
      }
    };
    const labelPages = nameLabelRosterMode
      ? paginateNameLabelRosterGroups(labels)
      : paginateNameLabelGroups(labels, geometry.capacity);
    const pages = labelPages.length > 0 ? labelPages : [[]];

    return renderLayoutFromPages(
      pages.map((pageLabels, pageIndex) => ({
        page: pageInfo,
        watermark: null,
        worksheet: createWorksheet(hiddenWorksheetOptions, pageIndex, pages.length, "姓名贴"),
        grid: {
          type: "fang" as const,
          visible: false,
          cell: 8,
          cellWidth: 8,
          cellHeight: 8,
          rowGap: 0,
          rows: 1,
          cols: 1,
          x: 0,
          y: 0
        },
        content: [],
        nameLabelSheet:
          pageLabels.length > 0
            ? {
              x: geometry.x,
              y: geometry.y,
              labelWidth: geometry.labelWidth,
              labelHeight: geometry.labelHeight,
              horizontalGap: geometry.horizontalGap,
              verticalGap: geometry.verticalGap,
              rows: geometry.rows,
              columns: geometry.columns,
              padding: centimetersToPoints(0.35),
              horizontalPadding: centimetersToPoints(nameLabelOptions.horizontalPaddingCm ?? 0.5),
              lineHeight: nameLabelOptions.lineHeight ?? 1.5,
              textLayout: nameLabelOptions.textLayout,
              showUnderline: nameLabelOptions.showUnderline,
              labels: pageLabels.map((lines) => ({ lines })),
              backgroundImage: {
                src: nameLabelOptions.backgroundImageSrc,
                name: nameLabelOptions.backgroundImageName
              },
              border: {
                visible: nameLabelOptions.showBorder,
                style: nameLabelOptions.borderStyle,
                color: nameLabelOptions.borderColor,
                width: nameLabelOptions.borderWidth,
                radius: centimetersToPoints(nameLabelOptions.borderRadiusCm),
                innerColor: nameLabelOptions.innerBorderColor,
                innerWidth: nameLabelOptions.innerBorderWidth,
                innerRadius: centimetersToPoints(nameLabelOptions.innerBorderRadiusCm),
                innerInset: centimetersToPoints(0.25)
              }
            }
            : undefined,
        style: {
          ...baseStyle,
          fontSize
        }
      }))
    );
  }

  if (isEightLinePaper) {
    const availableGridHeight = Math.max(
      8,
      pageInfo.height - pageInfo.margin - bottomReserve - gridY
    );
    const eightLinePages = buildEightLinePages({
      chars,
      fontSize,
      gridHeight: availableGridHeight,
      gridWidth: contentWidth,
      gridX: pageInfo.margin,
      gridY,
      mode: isAlternatePractice ? "alternate" : "sample"
    });

    return renderLayoutFromPages(
      eightLinePages.map((eightLinePage, pageIndex) => ({
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, eightLinePages.length, "八行笺"),
        grid: {
          type: "fang" as const,
          variant: "eight-line" as const,
          cell: eightLinePage.columnWidth,
          cellWidth: eightLinePage.columnWidth,
          cellHeight: availableGridHeight,
          rowGap: 0,
          rows: 1,
          cols: 8,
          x: pageInfo.margin,
          y: gridY
        },
        content: eightLinePage.items.map((item) => ({
          text: item.text,
          pinyin: "",
          x: item.x,
          y: item.y,
          repeat: 1,
          style: contentStyle,
          align: "center" as const,
          darkExampleCount: 1,
          traceExampleCount: 0,
          verticalAlign: "middle" as const,
          contentCellHeight: eightLinePage.verticalAdvance,
          maxFontSize: eightLinePage.effectiveFontSize,
          textOffsetY: contentOffsetY
        })),
        style: {
          ...baseStyle,
          fontSize: eightLinePage.effectiveFontSize
        }
      }))
    );
  }

  if (isPinyinTianPractice) {
    const pinyinTianPages = chunkArray(chars, itemsPerPage);
    const charCellHeight = gridCellWidth;
    const maxFontSize = charCellHeight * 0.78;

    return renderLayoutFromPages(
      pinyinTianPages.map((pageChars, pageIndex) => {
        const pageOffset = pageIndex * itemsPerPage;

        return {
          page: pageInfo,
          watermark,
          worksheet: createWorksheet(worksheetOptions, pageIndex, pinyinTianPages.length, "拼音田格"),
          grid: {
            type: "tianzi" as const,
            variant: "pinyin-tian" as const,
            cell: charCellHeight,
            cellWidth: gridCellWidth,
            cellHeight: gridCellHeight,
            rowGap: gridRowGap,
            rows: rowCount,
            cols: gridCols,
            x: gridX,
            y: gridY
          },
          content: pageChars.map((char, index) => {
            const globalIndex = pageOffset + index;
            const rowIndex = Math.floor(index / gridCols);
            const colIndex = index % gridCols;
            const cellX = gridX + colIndex * gridCellWidth;
            const groupY = gridY + rowIndex * (gridCellHeight + gridRowGap);
            const pinyinOptions = uniquePinyinOptions(hanziStrokeData[char]?.pinyin ?? []);
            const pinyinKey = `${globalIndex}:${char}`;
            const selectedPinyin = selectedStrokePinyin[pinyinKey];

            return {
              text: char,
              pinyin: selectedPinyin ?? pinyinOptions[0] ?? "",
              pinyinChar: char,
              pinyinKey,
              pinyinOptions,
              pinyinSelected: Boolean(selectedPinyin),
              pinyinX: cellX + gridCellWidth / 2,
              pinyinY: groupY + pinyinTianHeaderHeight * 0.72,
              x: cellX,
              y: groupY + pinyinTianHeaderHeight,
              repeat: 1,
              style: contentStyle,
              darkExampleCount: 1,
              traceExampleCount: 0,
              baselineOffsetRatio: pinyinTianMiddleBaselineOffsetRatio,
              textOffsetY: contentOffsetY,
              verticalAlign: "middle" as const,
              contentCellHeight: charCellHeight,
              maxFontSize
            };
          }),
          style: {
            ...baseStyle,
            fontSize: Math.min(renderedFontSize, maxFontSize),
            pinyinFontSize: Math.min(10, pinyinTianHeaderHeight * 0.56)
          }
        };
      })
    );
  }

  if (isStrokePractice) {
    const practiceCellCount = 10;
    const practiceCellSize = contentWidth / practiceCellCount;
    const baseHeaderHeight = paperSize === "A4" ? 34 : 30;
    const strokeGridY = gridY;
    const metaWidth = practiceCellSize * 4;
    const maxStrokeGridBottom = pageInfo.height - pageInfo.margin - bottomReserve;
    const traceFill = traceColor;
    const rowDrafts = chars.map((char, globalIndex) => {
      const strokeData = hanziStrokeData[char];
      const pinyinOptions = uniquePinyinOptions(strokeData?.pinyin ?? []);
      const pinyinKey = `${globalIndex}:${char}`;
      const selectedPinyin = selectedStrokePinyin[pinyinKey];
      const manualPinyin = pinyinItems[globalIndex];
      const rowPinyin = selectedPinyin ?? manualPinyin ?? pinyinOptions[0] ?? "";
      const strokeCount = strokeData?.strokeCount ?? strokeData?.strokes.length ?? 0;
      const wrapStrokeStrip = shouldWrapStrokeStepStrip({
        rowWidth: contentWidth,
        metaWidth,
        strokeCount
      });
      const headerHeight = baseHeaderHeight + (wrapStrokeStrip ? strokeStepWrapLineHeight : 0);

      return {
        globalIndex,
        char,
        pinyin: rowPinyin,
        pinyinOptions,
        pinyinSelected: Boolean(selectedPinyin || manualPinyin),
        pinyinKey,
        radical: strokeData?.radical ?? "",
        strokeCount: strokeData?.strokeCount ?? null,
        headerHeight,
        rowHeight: headerHeight + practiceCellSize,
        wrapStrokeStrip
      };
    });
    const pageDrafts = rowDrafts.reduce<Array<typeof rowDrafts>>((pages, row) => {
      const currentPage = pages.at(-1);
      const currentHeight = currentPage?.reduce((sum, item) => sum + item.rowHeight, 0) ?? 0;

      if (!currentPage || (currentPage.length > 0 && strokeGridY + currentHeight + row.rowHeight > maxStrokeGridBottom)) {
        pages.push([row]);
        return pages;
      }

      currentPage.push(row);
      return pages;
    }, []);
    const pageDraftGroups = pageDrafts.length > 0 ? pageDrafts : [[]];
    const pages = pageDraftGroups.map((pageRows, pageIndex) => {
      let currentY = strokeGridY;
      const strokePracticeRows = pageRows.map((row) => {
        const y = currentY;

        currentY += row.rowHeight;

        return {
          type: "stroke-practice-row" as const,
          char: row.char,
          pinyin: row.pinyin,
          pinyinOptions: row.pinyinOptions,
          pinyinSelected: row.pinyinSelected,
          pinyinKey: row.pinyinKey,
          radical: row.radical,
          strokeCount: row.strokeCount,
          x: pageInfo.margin,
          y,
          width: contentWidth,
          header: {
            height: row.headerHeight,
            metaWidth,
            wrapStrokeStrip: row.wrapStrokeStrip,
            background: "#DDF5E9",
            borderColor: strokeColor
          },
          practice: {
            cellSize: practiceCellSize,
            cellCount: practiceCellCount,
            ...exampleCountsForMode(practiceLineMode, Math.min(repeat, practiceCellCount - 1)),
            textOffsetY: contentOffsetY
          },
          style: {
            borderColor: strokeColor,
            guideLineColor: guideColor,
            darkFill: textColor,
            traceFill
          },
          strokeRef: row.char
        };
      });
      const pageGridHeight = Math.max(practiceCellSize, currentY - strokeGridY);
      const strokeGlyphs = Object.fromEntries(
        pageRows
          .map((row) => row.char)
          .map((char) => hanziStrokeData[char])
          .filter((data): data is HanziStrokeData => Boolean(data?.strokes.length))
          .map((data) => [
            data.character,
            {
              character: data.character,
              strokes: data.strokes,
              medians: data.medians
            }
          ])
      );

      return {
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, pageDraftGroups.length, "一年级生字练习"),
        grid: {
          type: "tianzi" as const,
          visible: false,
          cell: practiceCellSize,
          cellWidth: practiceCellSize,
          cellHeight: pageGridHeight / Math.max(pageRows.length, 1),
          rowGap: 0,
          rows: Math.max(pageRows.length, 1),
          cols: practiceCellCount,
          x: pageInfo.margin,
          y: strokeGridY
        },
        content: [],
        strokeGlyphs,
        strokePracticeRows,
        style: baseStyle
      };
    });

    return renderLayoutFromPages(pages);
  }

  if (isEnglishPractice) {
    const englishItems = isEnglishAlternatePractice ? wrapEnglishTextLines(rawText, contentWidth - 18, fontSize) : chars;
    const englishRowsPerPage = isEnglishAlternatePractice ? exampleRowsPerPage : rowCount;
    const englishPages = chunkArray(englishItems, englishRowsPerPage);
    const englishExampleCounts = exampleCountsForMode(
      practiceLineMode,
      Math.min(repeat, Math.max(0, gridCols - 1))
    );
    const englishTraceCount = englishExampleCounts.traceExampleCount;

    return renderLayoutFromPages(
      englishPages.map((pageItems, pageIndex) => ({
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, englishPages.length, "英文抄写"),
        grid: {
          type: "line" as const,
          cell: gridCell,
          cellWidth: gridCellWidth,
          cellHeight: gridCellHeight,
          rowGap: gridRowGap,
          rows: rowCount,
          cols: gridCols,
          x: gridX,
          y: gridY
        },
        content: pageItems.map((item, index) => ({
          text: item,
          pinyin: "",
          x: isEnglishAlternatePractice ? gridX + 9 : gridX,
          y: gridY + index * (isEnglishAlternatePractice ? 2 : 1) * (gridCellHeight + gridRowGap),
          repeat: isEnglishAlternatePractice ? 1 : 1 + englishTraceCount,
          style: contentStyle,
          align: isEnglishAlternatePractice ? ("left" as const) : ("center" as const),
          ...englishExampleCounts,
          textOffsetY: contentOffsetY
        })),
        style: {
          ...baseStyle
        }
      }))
    );
  }

  if (isNumberPractice) {
    const numberItems = chars.filter((char) => /^\d$/u.test(char));
    const numberItemsPerPage = isAlternatePractice ? exampleRowsPerPage * gridCols : rowCount;
    const numberPages = chunkArray(numberItems, numberItemsPerPage);
    const numberExampleCounts = exampleCountsForMode(
      practiceLineMode,
      Math.min(repeat, Math.max(0, gridCols - 1))
    );
    const numberTraceCount = numberExampleCounts.traceExampleCount;
    const numberMaxFontSize = gridCellHeight;

    return renderLayoutFromPages(
      numberPages.map((pageItems, pageIndex) => ({
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, numberPages.length, "数字书写"),
        grid: {
          type: "tianzi" as const,
          cell: gridCell,
          cellWidth: gridCellWidth,
          cellHeight: gridCellHeight,
          rowGap: gridRowGap,
          rows: rowCount,
          cols: gridCols,
          x: gridX,
          y: gridY
        },
        content: pageItems.map((item, index) => {
          const rowIndex = isAlternatePractice ? Math.floor(index / gridCols) : index;
          const colIndex = isAlternatePractice ? index % gridCols : 0;
          const itemX = gridX + colIndex * gridCellWidth;
          const itemY =
            gridY + rowIndex * (isAlternatePractice ? 2 : 1) * (gridCellHeight + gridRowGap);

          return {
            text: item,
            pinyin: "",
            x: itemX,
            y: itemY,
            repeat: isAlternatePractice ? 1 : 1 + numberTraceCount,
            style: contentStyle,
            align: "center" as const,
            ...numberExampleCounts,
            textOffsetX: -gridCellWidth / 4,
            textOffsetY: contentOffsetY,
            verticalAlign: "middle" as const,
            maxFontSize: numberMaxFontSize,
            clipX: itemX,
            clipY: itemY,
            clipWidth: gridCellWidth / 2,
            clipHeight: gridCellHeight,
            clipId: `number-cell-${pageIndex}-${index}`
          };
        }),
        style: {
          ...baseStyle,
          fontSize: Math.min(fontSize, numberMaxFontSize)
        }
      }))
    );
  }

  if (isEssayAlternatePractice) {
    const essayRows = tokenizeEssayAlternateRows(rawText, gridCols);
    const essayPages = chunkArray(essayRows, exampleRowsPerPage);
    const essayTextSettings = {
      darkExampleCount: 1,
      traceExampleCount: 0,
      textOffsetY: bottomAnchoredTextOffsetY(
        gridCellHeight,
        Math.min(fontSize, gridCellHeight * essayMaxFontSizeRatio),
        contentOffsetY
      ),
      maxFontSize: gridCellHeight * essayMaxFontSizeRatio
    };

    return renderLayoutFromPages(
      essayPages.map((pageRows, pageIndex) => ({
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, essayPages.length, "作文纸"),
        grid: {
          type: "fang" as const,
          cell: gridCell,
          cellWidth: gridCellWidth,
          cellHeight: gridCellHeight,
          rowGap: gridRowGap,
          rows: rowCount,
          cols: gridCols,
          x: gridX,
          y: gridY
        },
        content: pageRows.flatMap((rowCells, rowIndex) =>
          rowCells.flatMap((text, colIndex) =>
            text === " "
              ? []
              : [
                  {
                    text,
                    pinyin: "",
                    x: gridX + colIndex * gridCellWidth,
                    y: gridY + rowIndex * 2 * (gridCellHeight + gridRowGap),
                    repeat: 1,
                    style: contentStyle,
                    ...essayTextSettings
                  }
                ]
          )
        ),
        style: baseStyle
      }))
    );
  }

  if (isRuledPaper) {
    const ruledTextMaxFontSize = gridCellHeight * ruledLineTextMaxFontSizeRatio;
    const ruledEffectiveFontSize = Math.min(fontSize, ruledTextMaxFontSize);
    const ruledLineLayouts = wrapRuledPaperLines(rawText, contentWidth - 8, ruledEffectiveFontSize);
    const ruledExampleCounts = exampleCountsForMode(
      practiceLineMode,
      isRuledRowPractice ? Math.min(repeat, Math.max(0, gridCols - 1)) : 0
    );
    const ruledTraceCount = ruledExampleCounts.traceExampleCount;
    const ruledItems: Array<RuledPaperLineLayout | string> = isRuledAlternatePractice ? ruledLineLayouts : chars;
    const ruledRowsPerPage = isRuledAlternatePractice ? exampleRowsPerPage : rowCount;
    const ruledPages = chunkArray(ruledItems, ruledRowsPerPage);
    const ruledTextSettings = {
      ...ruledExampleCounts,
      textOffsetY: bottomAnchoredTextOffsetY(gridCellHeight, ruledEffectiveFontSize, contentOffsetY),
      maxFontSize: ruledTextMaxFontSize
    };

    return renderLayoutFromPages(
      ruledPages.map((pageLines, pageIndex) => ({
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(worksheetOptions, pageIndex, ruledPages.length, "横线纸"),
        grid: {
          type: "line" as const,
          variant: "ruled" as const,
          cell: gridCell,
          cellWidth: gridCellWidth,
          cellHeight: gridCellHeight,
          rowGap: gridRowGap,
          rows: rowCount,
          cols: gridCols,
          x: gridX,
          y: gridY
        },
        content: pageLines.map((item, index) => {
          const lineTop = gridY + index * (isRuledAlternatePractice ? 2 : 1) * (gridCellHeight + gridRowGap);
          const lineText = typeof item === "string" ? item : item.text;

          return {
            text: lineText,
            pinyin: "",
            x: isRuledAlternatePractice ? gridX + 4 : gridX,
            y: lineTop,
            repeat: 1 + ruledTraceCount,
            style: contentStyle,
            align: isRuledAlternatePractice ? ("left" as const) : ("center" as const),
            preserveSpace: isRuledAlternatePractice,
            ...(typeof item === "string"
              ? {}
              : {
                  clipHeight: gridCellHeight,
                  clipId: `ruled-line-${pageIndex}-${index}`,
                  clipWidth: contentWidth,
                  clipX: gridX,
                  clipY: lineTop,
                  fitWidth: item.fitWidth,
                  letterSpacing: item.letterSpacing
                }),
            ...ruledTextSettings
          };
        }),
        style: baseStyle
      }))
    );
  }

  const charPages = chunkArray(chars, itemsPerPage);
  const genericExampleCounts = exampleCountsForMode(
    practiceLineMode,
    Math.min(repeat, Math.max(0, gridCols - 1))
  );
  const genericTraceCount = genericExampleCounts.traceExampleCount;

  return renderLayoutFromPages(
    charPages.map((pageChars, pageIndex) => {
      const pageOffset = pageIndex * itemsPerPage;
      const content = pageChars.map((char, index) => {
        const exampleRowIndex = isEssayRowPractice ? index : isAlternatePractice ? Math.floor(index / gridCols) : index;
        const colIndex = isAlternatePractice ? index % gridCols : 0;
        const essayTraceCount = isEssayRowPractice ? Math.min(repeat, Math.max(0, gridCols - 1)) : 0;
        const essayTextSettings =
          isEssayPaper
            ? {
                darkExampleCount: 1,
                traceExampleCount: isEssayAlternatePractice ? 0 : essayTraceCount,
                textOffsetY: bottomAnchoredTextOffsetY(
                  gridCellHeight,
                  Math.min(fontSize, gridCellHeight * essayMaxFontSizeRatio),
                  contentOffsetY
                ),
                maxFontSize: gridCellHeight * essayMaxFontSizeRatio
              }
            : {};

        return {
          text: char,
          pinyin: contentStyle === "hybrid" && !isCalligraphyPractice ? pinyinItems[pageOffset + index] ?? "" : "",
          x: gridX + colIndex * gridCellWidth,
          y: gridY + exampleRowIndex * (isAlternatePractice ? 2 : 1) * (gridCellHeight + gridRowGap),
          repeat: isEssayRowPractice ? 1 + essayTraceCount : isAlternatePractice ? 1 : 1 + genericTraceCount,
          style: contentStyle,
          textOffsetY: contentOffsetY,
          ...genericExampleCounts,
          ...(isCalligraphyPractice
            ? {
                baselineOffsetRatio: calligraphyMiddleBaselineOffsetRatio,
                verticalAlign: "middle" as const
              }
            : isHuiPractice
              ? {
                  baselineOffsetRatio: huiMiddleBaselineOffsetRatio,
                  verticalAlign: "middle" as const
                }
            : {}),
          ...essayTextSettings
        };
      });

      return {
        page: pageInfo,
        watermark,
        worksheet: createWorksheet(
          worksheetOptions,
          pageIndex,
          charPages.length,
          isEssayPaper ? "作文纸" : "一年级生字练习"
        ),
        grid: {
          type: isEssayPaper ? "fang" : gridType,
          ...(isCalligraphyPractice ? { variant: "calligraphy" as const } : {}),
          cell: gridCell,
          cellWidth: gridCellWidth,
          cellHeight: gridCellHeight,
          rowGap: gridRowGap,
          rows: rowCount,
          cols: gridCols,
          x: gridX,
          y: gridY
        },
        content,
        style: {
          ...baseStyle
        }
      };
    })
  );
}

function buildPreviewSvgs(layout: CopybookRenderLayout) {
  return layoutPages(layout).map((pageLayout) => buildPreviewPageSvg(pageLayout));
}

function splitSvgDocuments(svgXml: string) {
  const pages = svgXml.match(/<svg[\s\S]*?<\/svg>/g)?.filter(Boolean) ?? [];

  return pages.length > 0 ? pages : svgXml ? [svgXml] : [];
}

function buildPreviewPageSvg(layout: CopybookLayout) {
  const { page: pageInfo, worksheet, grid } = layout;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageInfo.width}" height="${pageInfo.height}" viewBox="0 0 ${pageInfo.width} ${pageInfo.height}">`,
    "<title>字帖预览</title>",
    renderFontFace(layout),
    `<rect x="0" y="0" width="${pageInfo.width}" height="${pageInfo.height}" fill="#FFFFFF"/>`,
    renderWatermark(layout),
    renderWorksheet(layout),
    renderNameLabelSheet(layout),
    grid.visible === false
      ? '<g data-layer="grid"></g>'
      : `<g data-layer="grid" data-width="${grid.cols * grid.cellWidth}" data-height="${gridHeight(grid)}">${renderGrid(layout)}</g>`,
    renderStrokePracticeRows(layout),
    `<g data-layer="pinyin">${layout.content.map((item) => renderPinyin(layout, item)).join("")}</g>`,
    `<g data-layer="stroke-guide">${layout.content.map((item) => renderGuideText(layout, item)).join("")}</g>`,
    `<g data-layer="content-text">${layout.content.map((item) => renderContentText(layout, item)).join("")}</g>`,
    "</svg>"
  ].join("");

  function renderWorksheet(current: CopybookLayout) {
    const fieldsY = Math.max(current.page.margin + 30, current.grid.y - 34);
    const footerY = Math.min(current.page.height - 34, current.grid.y + gridHeight(current.grid) + 42);
    const visibleFields = worksheetFields(worksheet);

    return [
      '<g data-role="worksheet">',
      worksheet.showTitle
        ? renderWorksheetTitle(current, worksheet)
        : "",
      visibleFields.length > 0 ? renderWorksheetFields(current, visibleFields, fieldsY) : "",
      worksheet.showFooter !== false
        ? renderWorksheetFooter(current, worksheet, footerY)
        : "",
      worksheet.pageNumber?.visible ? renderWorksheetPageNumber(current, worksheet.pageNumber) : "",
      "</g>"
    ].join("");
  }
}

function renderNameLabelSheet(layout: CopybookLayout) {
  const sheet = layout.nameLabelSheet;

  if (!sheet) {
    return '<g data-layer="name-labels"></g>';
  }

  const labels: string[] = [];

  for (let row = 0; row < sheet.rows; row += 1) {
    for (let column = 0; column < sheet.columns; column += 1) {
      const slotIndex = row * sheet.columns + column;
      const label = sheet.labels[slotIndex % sheet.labels.length];
      const x = sheet.x + column * (sheet.labelWidth + sheet.horizontalGap);
      const y = sheet.y + row * (sheet.labelHeight + sheet.verticalGap);

      labels.push(renderNameLabel(layout, sheet, label.lines, x, y, slotIndex));
    }
  }

  return `<g data-layer="name-labels">${labels.join("")}</g>`;
}

function renderNameLabel(
  layout: CopybookLayout,
  sheet: NameLabelSheetLayout,
  lines: string[],
  x: number,
  y: number,
  slotIndex: number
) {
  const clipId = `name-label-clip-${slotIndex}`;
  const borderClearance = sheet.border.visible
    ? sheet.border.style === "double"
      ? sheet.border.innerInset + sheet.border.innerWidth
      : sheet.border.width / 2
    : 0;
  const contentInsetX = Math.max(sheet.horizontalPadding ?? sheet.padding, borderClearance + 3);
  const contentInsetY = Math.max(sheet.padding, borderClearance + 3);
  const contentX = x + contentInsetX;
  const contentY = y + contentInsetY;
  const contentWidth = Math.max(1, sheet.labelWidth - contentInsetX * 2);
  const contentHeight = Math.max(1, sheet.labelHeight - contentInsetY * 2);
  const preparedLines = lines.map((line) => prepareNameLabelLine(line, sheet.textLayout));
  const lineHeightRatio = sheet.lineHeight ?? 1.5;
  const labelFontSize = fittedNameLabelFontSize(
    layout.style.fontSize,
    preparedLines,
    contentWidth,
    contentHeight,
    lineHeightRatio
  );
  const lineHeight = labelFontSize * lineHeightRatio;
  const textBlockHeight = labelFontSize + Math.max(0, preparedLines.length - 1) * lineHeight;
  // The glyph box is modeled as 0.82em above and 0.18em below the baseline.
  const firstBaseline = contentY + Math.max(0, (contentHeight - textBlockHeight) / 2) + labelFontSize * 0.82;
  const nodes = [
    `<g data-role="name-label" data-label-index="${slotIndex}" data-line-height="${fixed(lineHeightRatio)}">`,
    `<defs><clipPath id="${clipId}"><rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(sheet.labelWidth)}" height="${fixed(sheet.labelHeight)}" rx="${fixed(sheet.border.radius)}"/></clipPath></defs>`
  ];

  if (sheet.backgroundImage.src) {
    nodes.push(
      `<image data-role="name-label-background" href="${escapeXml(sheet.backgroundImage.src)}" xlink:href="${escapeXml(sheet.backgroundImage.src)}" x="${fixed(x)}" y="${fixed(y)}" width="${fixed(sheet.labelWidth)}" height="${fixed(sheet.labelHeight)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    );
  }

  nodes.push(`<g clip-path="url(#${clipId})">`);
  preparedLines.forEach((line, index) => {
    nodes.push(
      renderNameLabelLine(
        layout,
        sheet,
        line,
        contentX,
        contentWidth,
        firstBaseline + index * lineHeight,
        labelFontSize
      )
    );
  });
  nodes.push("</g>", renderNameLabelBorder(sheet, x, y), "</g>");

  return nodes.join("");
}

interface PreparedNameLabelLine {
  raw: string;
  field: string;
  value: string;
  hasField: boolean;
}

function prepareNameLabelLine(line: string, textLayout: NameLabelTextLayout): PreparedNameLabelLine {
  if (textLayout === "center") {
    return { raw: line.trim(), field: "", value: line.trim(), hasField: false };
  }

  const fieldLine = splitNameLabelFieldLine(line);

  return { raw: line.trim(), ...fieldLine };
}

function renderNameLabelLine(
  layout: CopybookLayout,
  sheet: NameLabelSheetLayout,
  line: PreparedNameLabelLine,
  x: number,
  width: number,
  baseline: number,
  labelFontSize: number
) {
  const underlineY = baseline + labelFontSize * 0.18;
  const family = contentFontFamily(layout, line.raw);
  const fill = layout.style.textColor;

  if (line.hasField) {
    const fieldWidth = Math.min(
      width * 0.4,
      Math.max(labelFontSize * 2.7, estimateNameLabelTextWidth(line.field, labelFontSize) + labelFontSize * 0.35)
    );
    const valueX = x + fieldWidth;
    const valueWidth = Math.max(1, width - fieldWidth);
    const encodedField = encodeTextForFont(line.field, layout.style.fontEncoding);
    const encodedValue = encodeTextForFont(line.value, layout.style.fontEncoding);

    return [
      `<text data-role="name-label-field" x="${fixed(x)}" y="${fixed(baseline)}" font-size="${fixed(labelFontSize)}" font-family="${family}" fill="${fill}" text-anchor="start">${escapeXml(encodedField)}</text>`,
      sheet.showUnderline
        ? `<line data-role="name-label-underline" x1="${fixed(valueX)}" y1="${fixed(underlineY)}" x2="${fixed(x + width)}" y2="${fixed(underlineY)}" stroke="${fill}" stroke-width="0.65"/>`
        : "",
      `<text x="${fixed(valueX + valueWidth / 2)}" y="${fixed(baseline)}" font-size="${fixed(labelFontSize)}" font-family="${family}" fill="${fill}" text-anchor="middle">${escapeXml(encodedValue)}</text>`
    ].join("");
  }

  const encodedValue = encodeTextForFont(line.value, layout.style.fontEncoding);

  return [
    sheet.showUnderline
      ? `<line data-role="name-label-underline" x1="${fixed(x)}" y1="${fixed(underlineY)}" x2="${fixed(x + width)}" y2="${fixed(underlineY)}" stroke="${fill}" stroke-width="0.65"/>`
      : "",
    `<text x="${fixed(x + width / 2)}" y="${fixed(baseline)}" font-size="${fixed(labelFontSize)}" font-family="${family}" fill="${fill}" text-anchor="middle">${escapeXml(encodedValue)}</text>`
  ].join("");
}

function renderNameLabelBorder(sheet: NameLabelSheetLayout, x: number, y: number) {
  if (!sheet.border.visible) {
    return "";
  }

  const outerInset = sheet.border.width / 2;
  const nodes = [
    `<rect x="${fixed(x + outerInset)}" y="${fixed(y + outerInset)}" width="${fixed(sheet.labelWidth - outerInset * 2)}" height="${fixed(sheet.labelHeight - outerInset * 2)}" rx="${fixed(Math.max(0, sheet.border.radius - outerInset))}" fill="none" stroke="${sheet.border.color}" stroke-width="${fixed(sheet.border.width)}"/>`
  ];

  if (sheet.border.style === "double") {
    const inset = sheet.border.innerInset;

    nodes.push(
      `<rect x="${fixed(x + inset)}" y="${fixed(y + inset)}" width="${fixed(sheet.labelWidth - inset * 2)}" height="${fixed(sheet.labelHeight - inset * 2)}" rx="${fixed(Math.max(0, sheet.border.innerRadius - sheet.border.innerWidth / 2))}" fill="none" stroke="${sheet.border.innerColor}" stroke-width="${fixed(sheet.border.innerWidth)}"/>`
    );
  }

  return nodes.join("");
}

function fittedNameLabelFontSize(
  requestedSize: number,
  lines: PreparedNameLabelLine[],
  width: number,
  height: number,
  lineHeightRatio: number
) {
  const heightLimit = height / Math.max(1, 1 + Math.max(0, lines.length - 1) * lineHeightRatio);
  const widthLimit = lines.reduce((current, line) => {
    const estimatedAtOnePoint = line.hasField
      ? Math.max(estimateNameLabelTextWidth(line.field, 1) / 0.4, estimateNameLabelTextWidth(line.value, 1) / 0.6)
      : estimateNameLabelTextWidth(line.value, 1);

    return Math.min(current, estimatedAtOnePoint > 0 ? width / estimatedAtOnePoint : requestedSize);
  }, requestedSize);

  return Math.max(6, Math.min(requestedSize, heightLimit, widthLimit));
}

function estimateNameLabelTextWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) {
      return width + fontSize * 0.34;
    }

    return width + fontSize * ((character.codePointAt(0) ?? 0) <= 0xff ? 0.62 : 1);
  }, 0);
}

function renderWatermark(layout: CopybookLayout) {
  const watermark = layout.watermark;

  if (!watermark || (!watermark.text.visible && !watermark.image.visible)) {
    return "";
  }

  const opacity = fixed(clampNumber(watermark.gray, 10, 90) / 100);
  const positions = watermarkPositionsForPage(layout.page, watermark.position);
  const hasText = watermark.text.visible && Boolean(watermark.text.value);
  const hasImage = watermark.image.visible && Boolean(watermark.image.src);
  const imageHeight = clampNumber(watermark.image.height, 40, 180);
  const imageWidth = imageHeight * 1.75;
  const textFontSize = clampNumber(watermark.text.fontSize, 14, 60);
  const imageYOffset = hasText && hasImage ? -(textFontSize * 0.5) : 0;
  const textYOffset = hasText && hasImage ? imageHeight / 2 + textFontSize * 0.72 : 0;
  const encodedText = encodeTextForFont(
    watermark.text.value,
    watermark.text.font === "copybook" ? layout.style.fontEncoding : undefined
  );

  return [
    '<g data-role="watermark" pointer-events="none">',
    positions
      .map((position) => {
        const parts = [`<g transform="translate(${fixed(position.x)} ${fixed(position.y)}) rotate(${fixed(position.rotate)})">`];

        if (hasImage) {
          parts.push(
            `<image href="${escapeXml(watermark.image.src)}" xlink:href="${escapeXml(watermark.image.src)}" x="${fixed(-imageWidth / 2)}" y="${fixed(-imageHeight / 2 + imageYOffset)}" width="${fixed(imageWidth)}" height="${fixed(imageHeight)}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`
          );
        }

        if (hasText) {
          parts.push(
            `<text x="0" y="${fixed(textFontSize * 0.32 + textYOffset)}" font-size="${fixed(textFontSize)}" font-family="${worksheetTitleFontFamily(layout, watermark.text.font, encodedText)}" fill="#000000" fill-opacity="${opacity}" text-anchor="middle">${escapeXml(encodedText)}</text>`
          );
        }

        parts.push("</g>");

        return parts.join("");
      })
      .join(""),
    "</g>"
  ].join("");
}

function watermarkPositionsForPage(page: CopybookLayout["page"], position: WatermarkPosition) {
  if (position === "center") {
    return [
      {
        rotate: 0,
        x: page.width / 2,
        y: page.height / 2
      }
    ];
  }

  const rotate = position === "spread-top-right" ? -28 : 28;
  const positions: Array<{ x: number; y: number; rotate: number }> = [];
  const stepX = 220;
  const stepY = 165;

  for (let row = 0, y = -60; y <= page.height + 80; row += 1, y += stepY) {
    const rowOffset = row % 2 === 0 ? 0 : stepX / 2;

    for (let x = -80 - rowOffset; x <= page.width + 120; x += stepX) {
      positions.push({
        rotate,
        x,
        y
      });
    }
  }

  return positions;
}

function renderWorksheetFooter(layout: CopybookLayout, worksheet: CopybookLayout["worksheet"], y: number) {
  const footerStyle = worksheet.footerStyle ?? {
    color: layout.style.textColor,
    font: "kaiti" as WorksheetTitleFont,
    fontSize: 11
  };
  const encodedFooter = worksheet.footer;

  return `<text x="${fixed(layout.page.width / 2)}" y="${fixed(y)}" font-size="${fixed(footerStyle.fontSize)}" font-family="${sourceHanSerifFontFamily}" fill="${footerStyle.color}" text-anchor="middle" letter-spacing="2">- ${escapeXml(encodedFooter)} -</text>`;
}

function renderWorksheetTitle(layout: CopybookLayout, worksheet: CopybookLayout["worksheet"]) {
  const titleStyle = worksheet.titleStyle ?? {
    color: layout.style.textColor,
    font: "kaiti" as WorksheetTitleFont,
    fontSize: 16
  };
  const y = layout.page.margin + Math.max(titleStyle.fontSize, 16);
  const encodedTitle = encodeTextForFont(worksheet.title, titleStyle.font === "copybook" ? layout.style.fontEncoding : undefined);

  return `<text x="${fixed(layout.page.width / 2)}" y="${fixed(y)}" font-size="${fixed(titleStyle.fontSize)}" font-family="${worksheetTitleFontFamily(layout, titleStyle.font, encodedTitle)}" fill="${titleStyle.color}" text-anchor="middle" letter-spacing="3">${escapeXml(encodedTitle)}</text>`;
}

function worksheetTitleFontFamily(layout: CopybookLayout, titleFont: WorksheetTitleFont, text = "") {
  if (titleFont === "copybook") {
    return contentFontFamily(layout, text);
  }

  if (titleFont === "songti") {
    return "Songti SC, Source Han Serif, serif";
  }

  if (titleFont === "heiti") {
    return "PingFang SC, Heiti SC, Microsoft YaHei, SimHei, Noto Sans CJK SC, sans-serif";
  }

  return "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";
}

function worksheetFields(worksheet: CopybookLayout["worksheet"]) {
  const fieldSource = worksheet.studentFields;
  const fallbackVisible = worksheet.showStudentFields;
  const fields = [
    {
      label: "学校",
      lineKind: "school" as const,
      value: fieldSource?.school.value ?? "",
      visible: fieldSource?.school.visible ?? fallbackVisible
    },
    {
      label: "班级",
      lineKind: "className" as const,
      value: fieldSource?.className.value ?? "",
      visible: fieldSource?.className.visible ?? fallbackVisible
    },
    {
      label: "姓名",
      lineKind: "name" as const,
      value: fieldSource?.name.value ?? "",
      visible: fieldSource?.name.visible ?? fallbackVisible
    },
    {
      label: "学号",
      lineKind: "studentNumber" as const,
      value: fieldSource?.studentNumber.value ?? "",
      visible: fieldSource?.studentNumber.visible ?? fallbackVisible
    }
  ];

  return fields.filter((field) => field.visible);
}

function renderWorksheetFields(
  layout: CopybookLayout,
  fields: Array<{ label: string; lineKind: WorksheetFieldLineKind; value: string }>,
  y: number
) {
  const bodyX = layout.grid.x;
  const bodyWidth = layout.grid.cols * layout.grid.cellWidth;
  const minGap = 10;
  const fieldLayouts = fields.map((field) => ({
    ...field,
    labelWidth: worksheetLabelWidth(field.label),
    lineWidth: worksheetLineWidth(field)
  }));
  const fixedWidth = fieldLayouts.reduce((sum, field) => sum + field.labelWidth + field.lineWidth, 0);
  const gapCount = Math.max(0, fieldLayouts.length - 1);
  const minGapTotal = gapCount * minGap;
  const lineWidthSum = fieldLayouts.reduce((sum, field) => sum + field.lineWidth, 0);
  const fittedLayouts =
    gapCount > 0 && fixedWidth + minGapTotal > bodyWidth && lineWidthSum > 0
      ? fieldLayouts.map((field) => ({
          ...field,
          lineWidth: Math.max(8, field.lineWidth * Math.max(0.4, (bodyWidth - minGapTotal - (fixedWidth - lineWidthSum)) / lineWidthSum))
        }))
      : fieldLayouts;
  const fittedFixedWidth = fittedLayouts.reduce((sum, field) => sum + field.labelWidth + field.lineWidth, 0);
  const gap = gapCount > 0 ? Math.max(minGap, (bodyWidth - fittedFixedWidth) / gapCount) : 0;
  let cursorX = bodyX;

  return fittedLayouts
    .map((field) => {
      const labelX = cursorX;
      const lineX = labelX + field.labelWidth;
      const lineWidth = field.lineWidth;

      cursorX = lineX + lineWidth + gap;

      return [
        `<text x="${fixed(labelX)}" y="${fixed(y)}" font-size="10" font-family="${sourceHanSerifFontFamily}" fill="#1F2937" xml:space="preserve">${escapeXml(worksheetFieldLabelText(field.label))}</text>`,
        `<line x1="${fixed(lineX)}" y1="${fixed(y + 5)}" x2="${fixed(lineX + lineWidth)}" y2="${fixed(y + 5)}" stroke="#9CA3AF" stroke-width="0.55"/>`,
        field.value
          ? `<text x="${fixed(lineX + 2)}" y="${fixed(y)}" font-size="10" font-family="${sourceHanSerifFontFamily}" fill="#1F2937">${escapeXml(field.value)}</text>`
          : ""
      ].join("");
    })
    .join("");
}

function worksheetLabelWidth(label: string) {
  return estimateWorksheetTextWidth(worksheetFieldLabelText(label));
}

function worksheetFieldLabelText(label: string) {
  return `${label}: `;
}

type WorksheetFieldLineKind = "school" | "className" | "name" | "studentNumber";

function worksheetLineWidth(field: { lineKind: WorksheetFieldLineKind; value: string }) {
  if (field.value) {
    return Math.max(8, estimateWorksheetTextWidth(field.value) + 6);
  }

  return worksheetDefaultLineWidth(field.lineKind);
}

function worksheetDefaultLineWidth(lineKind: WorksheetFieldLineKind) {
  if (lineKind === "school") {
    return estimateWorksheetTextWidth("学校学校学校学校学校");
  }

  if (lineKind === "className") {
    return estimateWorksheetTextWidth("班级班级");
  }

  if (lineKind === "name") {
    return estimateWorksheetTextWidth("姓名姓名姓名");
  }

  return estimateWorksheetTextWidth("00");
}

function estimateWorksheetTextWidth(value: string) {
  return Array.from(value).reduce((sum, char) => {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) {
      return sum + 10;
    }

    if (/\d/u.test(char)) {
      return sum + 6;
    }

    if (/[A-Za-z]/u.test(char)) {
      return sum + 6.5;
    }

    return sum + 5;
  }, 0);
}

function renderWorksheetPageNumber(
  layout: CopybookLayout,
  pageNumber: NonNullable<CopybookLayout["worksheet"]["pageNumber"]>
) {
  const y = layout.page.height - 18;
  const x = pageNumber.position === "bottom-right" ? layout.page.width - layout.page.margin : layout.page.width / 2;
  const anchor = pageNumber.position === "bottom-right" ? "end" : "middle";

  return `<text x="${fixed(x)}" y="${fixed(y)}" font-size="9" font-family="${sourceHanSerifFontFamily}" fill="#64748B" text-anchor="${anchor}">${escapeXml(pageNumber.text)}</text>`;
}

function renderStrokePracticeRows(layout: CopybookLayout) {
  const rows = layout.strokePracticeRows ?? [];

  if (rows.length === 0) {
    return '<g data-layer="stroke-practice"></g>';
  }

  return `<g data-layer="stroke-practice">${rows.map((row) => renderStrokePracticeRow(layout, row)).join("")}</g>`;
}

function renderStrokePracticeRow(layout: CopybookLayout, row: StrokePracticeRowLayout) {
  const glyph = resolveStrokeGlyph(layout, row);
  const { x, y, width, header, practice, style } = row;
  const practiceY = y + header.height;
  const strokeCount = row.strokeCount ?? glyph?.strokes.length ?? 0;

  if (row.blank) {
    return [
      '<g data-role="stroke-practice-row" data-blank="true">',
      renderStrokePracticeCells(layout, "", practice, x, y, style),
      "</g>"
    ].join("");
  }

  return [
    `<g data-role="stroke-practice-row" data-char="${escapeXml(row.char)}">`,
    `<g data-role="stroke-practice-header">`,
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(width)}" height="${fixed(header.height)}" fill="${header.background}" stroke="${header.borderColor}" stroke-width="1.2"/>`,
    "</g>",
    renderStrokeMetaInfo(layout, row, strokeCount),
    glyph ? renderStrokeStepStrip(glyph, row, style.traceFill, style.darkFill) : "",
    renderStrokePracticeCells(layout, row.char, practice, x, practiceY, style),
    "</g>"
  ].join("");
}

function renderStrokeMetaInfo(layout: CopybookLayout, row: StrokePracticeRowLayout, strokeCount: number) {
  const { x, y, header, practice } = row;
  const metaLineHeight = header.wrapStrokeStrip ? header.height - strokeStepWrapLineHeight : header.height;
  const cy = y + Math.max(0, metaLineHeight) / 2 + 4;
  const labelSize = strokeMetaLabelFontSize;
  const valueSize = strokeMetaValueFontSize;
  const cellSize = practice.cellSize;
  const pinyinLabelX = x + 8;
  const pinyinValueX = x + 38;
  const radicalLabelX = x + cellSize * 2 + 8;
  const radicalValueX = x + cellSize * 2 + 34;
  const strokeLabelX = x + cellSize * 3 + 8;
  const strokeValueX = x + cellSize * 3 + 34;
  const pinyinText = row.pinyin || "-";
  const isPolyphonic = row.pinyinOptions.length > 1;
  const highlightPinyin = isPolyphonic && !row.pinyinSelected;
  const maxPinyinBoxWidth = Math.max(valueSize * 1.6, cellSize * 2 - 42);
  const pinyinBoxWidth = Math.min(maxPinyinBoxWidth, Math.max(valueSize * 2.1, pinyinText.length * valueSize * 0.54 + 12));
  const pinyinBoxHeight = valueSize + 6;
  const pinyinAttrs = isPolyphonic
    ? ` data-role="stroke-pinyin-picker" data-key="${escapeXml(row.pinyinKey)}" data-char="${escapeXml(row.char)}" data-options="${escapeXml(row.pinyinOptions.join("|"))}" data-selected="${row.pinyinSelected ? "true" : "false"}" cursor="pointer"`
    : "";

  return [
    '<g data-role="stroke-practice-meta">',
    `<text x="${fixed(pinyinLabelX)}" y="${fixed(cy)}" font-size="${fixed(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">拼音</text>`,
    `<g${pinyinAttrs}>`,
    highlightPinyin
      ? `<rect x="${fixed(pinyinValueX - 6)}" y="${fixed(cy - valueSize - 3)}" width="${fixed(pinyinBoxWidth)}" height="${fixed(pinyinBoxHeight)}" rx="3" fill="#FFF3B0" stroke="#FDE047" stroke-width="0.6"/>`
      : "",
    `<text x="${fixed(pinyinValueX)}" y="${fixed(cy)}" font-size="${fixed(valueSize)}" font-family="${pinyinFontFamily(layout)}" fill="#111827">${escapeXml(pinyinText)}</text>`,
    "</g>",
    `<text x="${fixed(radicalLabelX)}" y="${fixed(cy)}" font-size="${fixed(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">部首</text>`,
    `<text x="${fixed(radicalValueX)}" y="${fixed(cy)}" font-size="${fixed(valueSize)}" font-family="${sourceHanSerifFontFamily}" fill="#111827">${escapeXml(row.radical || "-")}</text>`,
    `<text x="${fixed(strokeLabelX)}" y="${fixed(cy)}" font-size="${fixed(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">笔画</text>`,
    `<text x="${fixed(strokeValueX)}" y="${fixed(cy)}" font-size="${fixed(valueSize)}" font-family="${sourceHanSerifFontFamily}" fill="#111827">${escapeXml(String(strokeCount))}</text>`,
    "</g>"
  ].join("");
}

function renderStrokeStepStrip(
  glyph: StrokeGlyph,
  row: StrokePracticeRowLayout,
  completedFill: string,
  activeFill: string
) {
  const strokeCount = glyph.strokes.length;
  const { x, y, width, header } = row;

  if (strokeCount === 0 || width <= 0 || header.height <= 0) {
    return "";
  }

  const wrapStrokeStrip =
    header.wrapStrokeStrip === true ||
    shouldWrapStrokeStepStrip({
      rowWidth: width,
      metaWidth: header.metaWidth,
      strokeCount
    });
  const lineTop = wrapStrokeStrip ? y + Math.max(0, header.height - strokeStepWrapLineHeight) : y;
  const lineHeight = wrapStrokeStrip ? Math.min(strokeStepWrapLineHeight, header.height) : header.height;
  const labelX = wrapStrokeStrip ? x + strokeStepPaddingX : x + header.metaWidth + strokeStepPaddingX;
  const labelY = lineTop + lineHeight / 2 + 3.5;
  const startX = labelX + strokeStepLabelWidth + strokeStepLabelGap;
  const startY = lineTop + (lineHeight - strokeStepSize) / 2;

  return [
    '<g data-role="stroke-step-strip">',
    `<text x="${fixed(labelX)}" y="${fixed(labelY)}" font-size="${fixed(strokeMetaLabelFontSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">笔顺</text>`,
    Array.from({ length: strokeCount }, (_, index) =>
      renderMmhGlyph({
        glyph,
        x: startX + index * (strokeStepSize + strokeStepGap),
        y: startY,
        size: strokeStepSize,
        uptoStroke: index + 1,
        activeStrokeIndex: index,
        completedFill,
        activeFill
      })
    ).join(""),
    "</g>"
  ].join("");
}

function renderStrokePracticeCells(
  layout: CopybookLayout,
  char: string,
  practice: StrokePracticeRowLayout["practice"],
  x: number,
  y: number,
  style: StrokePracticeRowLayout["style"]
) {
  const parts: string[] = [];

  for (let index = 0; index < practice.cellCount; index += 1) {
    const cellX = x + index * practice.cellSize;

    parts.push(renderStrokeTianziCell(cellX, y, practice.cellSize, style.borderColor, style.guideLineColor));

    if (!char) {
      continue;
    }

    if (index < practice.darkExampleCount) {
      parts.push(
        renderPracticeTextGlyph({
          char,
          fill: style.darkFill,
          layout,
          opacity: 1,
          size: practice.cellSize,
          textOffsetY: practice.textOffsetY ?? 0,
          x: cellX,
          y
        })
      );
      continue;
    }

    if (index < practice.darkExampleCount + practice.traceExampleCount) {
      parts.push(
        renderPracticeTextGlyph({
          char,
          fill: style.traceFill,
          layout,
          opacity: 0.75,
          size: practice.cellSize,
          textOffsetY: practice.textOffsetY ?? 0,
          x: cellX,
          y
        })
      );
    }
  }

  return `<g data-role="stroke-practice-cells">${parts.join("")}</g>`;
}

function renderPracticeTextGlyph({
  char,
  fill,
  layout,
  opacity,
  size,
  textOffsetY,
  x,
  y
}: {
  char: string;
  fill: string;
  layout: CopybookLayout;
  opacity: number;
  size: number;
  textOffsetY: number;
  x: number;
  y: number;
}) {
  const fontSize = Math.min(size * 0.84, layout.style.fontSize);
  const textX = x + size / 2;
  const textY = y + size / 2 + fontSize * 0.36 + textOffsetY;
  const opacityAttr = opacity >= 1 ? "" : ` fill-opacity="${fixed(opacity)}"`;
  const encodedChar = encodeTextForFont(char, layout.style.fontEncoding);

  return `<text x="${fixed(textX)}" y="${fixed(textY)}" font-size="${fixed(fontSize)}" font-family="${contentFontFamily(layout, encodedChar)}" fill="${fill}"${opacityAttr} text-anchor="middle">${escapeXml(encodedChar)}</text>`;
}

function renderStrokeTianziCell(x: number, y: number, size: number, borderColor: string, guideLineColor: string) {
  const midX = x + size / 2;
  const midY = y + size / 2;

  return [
    '<g data-role="tianzi-cell">',
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(size)}" height="${fixed(size)}" fill="none" stroke="${borderColor}" stroke-width="0.95"/>`,
    `<line x1="${fixed(midX)}" y1="${fixed(y)}" x2="${fixed(midX)}" y2="${fixed(y + size)}" stroke="${guideLineColor}" stroke-width="0.55" stroke-dasharray="2 2.8"/>`,
    `<line x1="${fixed(x)}" y1="${fixed(midY)}" x2="${fixed(x + size)}" y2="${fixed(midY)}" stroke="${guideLineColor}" stroke-width="0.55" stroke-dasharray="2 2.8"/>`,
    "</g>"
  ].join("");
}

function renderMmhGlyph({
  activeFill,
  activeStrokeIndex = -1,
  completedFill,
  glyph,
  opacity = 1,
  size,
  uptoStroke = glyph.strokes.length,
  x,
  y
}: {
  glyph: StrokeGlyph;
  x: number;
  y: number;
  size: number;
  uptoStroke?: number;
  activeStrokeIndex?: number;
  completedFill: string;
  activeFill: string;
  opacity?: number;
}) {
  const scale = size / 1024;
  const opacityAttr = opacity >= 1 ? "" : ` fill-opacity="${fixed(opacity)}"`;
  const paths = glyph.strokes
    .slice(0, Math.max(0, Math.min(glyph.strokes.length, uptoStroke)))
    .map((path, index) => {
      const fill = index === activeStrokeIndex ? activeFill : completedFill;

      return `<path d="${escapeXml(path)}" fill="${fill}"${opacityAttr}/>`;
    })
    .join("");

  return `<g transform="translate(${fixed(x)} ${fixed(y)}) scale(${fixed(scale)})"><g transform="scale(1, -1) translate(0, -900)">${paths}</g></g>`;
}

function resolveStrokeGlyph(layout: CopybookLayout, row: StrokePracticeRowLayout) {
  const glyphs = layout.strokeGlyphs ?? {};

  return glyphs[row.strokeRef] ?? glyphs[row.char] ?? null;
}

function renderGrid(layout: CopybookLayout) {
  if (layout.grid.variant === "ruled") {
    return renderRuledGrid(layout);
  }

  if (layout.grid.variant === "eight-line") {
    return renderEightLineGrid(layout);
  }

  const cells: string[] = [];

  for (let row = 0; row < layout.grid.rows; row += 1) {
    for (let col = 0; col < layout.grid.cols; col += 1) {
      cells.push(renderCell(layout, layout.grid.x + col * layout.grid.cellWidth, layout.grid.y + row * rowStep(layout.grid)));
    }
  }

  return cells.join("");
}

function renderEightLineGrid(layout: CopybookLayout) {
  const { grid, style } = layout;
  const width = grid.cols * grid.cellWidth;
  const height = grid.rows * grid.cellHeight;
  const lines = [
    `<rect x="${fixed(grid.x)}" y="${fixed(grid.y)}" width="${fixed(width)}" height="${fixed(height)}" fill="none" stroke="${style.strokeColor}" stroke-width="1.4"/>`,
  ];

  for (let column = 1; column < grid.cols; column += 1) {
    const x = grid.x + column * grid.cellWidth;
    lines.push(
      `<line x1="${fixed(x)}" y1="${fixed(grid.y)}" x2="${fixed(x)}" y2="${fixed(grid.y + height)}" stroke="${style.strokeColor}" stroke-width="0.7"/>`,
    );
  }

  return lines.join("");
}

function renderRuledGrid(layout: CopybookLayout) {
  const { grid, style } = layout;
  const width = grid.cols * grid.cellWidth;
  const lines: string[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.y + row * rowStep(grid) + grid.cellHeight;

    lines.push(
      `<line x1="${fixed(grid.x)}" y1="${fixed(y)}" x2="${fixed(grid.x + width)}" y2="${fixed(y)}" stroke="${style.strokeColor}" stroke-width="0.8"/>`
    );
  }

  return lines.join("");
}

function renderCell(layout: CopybookLayout, x: number, y: number) {
  const { grid, style } = layout;
  const rect = `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(grid.cellWidth)}" height="${fixed(grid.cellHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`;

  if (grid.variant === "calligraphy") {
    return renderCalligraphyCell(layout, x, y);
  }

  if (grid.variant === "pinyin-tian") {
    return renderPinyinTianCell(layout, x, y);
  }

  if (grid.type === "fang") {
    return rect;
  }

  if (grid.type === "line") {
    return [
      rect,
      `<line x1="${fixed(x)}" y1="${fixed(y + grid.cellHeight * pinyinMiddleTopRatio)}" x2="${fixed(x + grid.cellWidth)}" y2="${fixed(y + grid.cellHeight * pinyinMiddleTopRatio)}" stroke="${style.guideColor}" stroke-width="0.5" stroke-dasharray="1.2 2"/>`,
      `<line x1="${fixed(x)}" y1="${fixed(y + grid.cellHeight * pinyinMiddleBottomRatio)}" x2="${fixed(x + grid.cellWidth)}" y2="${fixed(y + grid.cellHeight * pinyinMiddleBottomRatio)}" stroke="${style.guideColor}" stroke-width="0.5" stroke-dasharray="1.2 2"/>`
    ].join("");
  }

  if (grid.type === "hui") {
    return renderHuiCell(layout, x, y);
  }

  if (grid.type === "rizhi") {
    return [
      rect,
      `<line x1="${fixed(x)}" y1="${fixed(y + grid.cellHeight / 2)}" x2="${fixed(x + grid.cellWidth)}" y2="${fixed(y + grid.cellHeight / 2)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
    ].join("");
  }

  return [
    rect,
    `<line x1="${fixed(x)}" y1="${fixed(y + grid.cellHeight / 2)}" x2="${fixed(x + grid.cellWidth)}" y2="${fixed(y + grid.cellHeight / 2)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`,
    `<line x1="${fixed(x + grid.cellWidth / 2)}" y1="${fixed(y)}" x2="${fixed(x + grid.cellWidth / 2)}" y2="${fixed(y + grid.cellHeight)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
  ].join("");
}

function renderCalligraphyCell(layout: CopybookLayout, x: number, y: number) {
  const { grid, style } = layout;
  const width = grid.cellWidth;
  const height = grid.cellHeight;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const guideStroke = `stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="2 3"`;

  return [
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(width)}" height="${fixed(height)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.95"/>`,
    `<line x1="${fixed(x)}" y1="${fixed(midY)}" x2="${fixed(x + width)}" y2="${fixed(midY)}" ${guideStroke}/>`,
    `<line x1="${fixed(midX)}" y1="${fixed(y)}" x2="${fixed(midX)}" y2="${fixed(y + height)}" ${guideStroke}/>`,
    `<line x1="${fixed(x)}" y1="${fixed(y)}" x2="${fixed(x + width)}" y2="${fixed(y + height)}" ${guideStroke}/>`,
    `<line x1="${fixed(x + width)}" y1="${fixed(y)}" x2="${fixed(x)}" y2="${fixed(y + height)}" ${guideStroke}/>`
  ].join("");
}

function renderPinyinTianCell(layout: CopybookLayout, x: number, y: number) {
  const { grid, style } = layout;
  const width = grid.cellWidth;
  const pinyinHeight = Math.max(12, grid.cellHeight - grid.cell);
  const charY = y + pinyinHeight;
  const charHeight = grid.cell;
  const midX = x + width / 2;
  const midY = charY + charHeight / 2;
  const pinyinLineStroke = `stroke="${style.guideColor}" stroke-width="0.45" stroke-dasharray="1.2 2"`;

  return [
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(width)}" height="${fixed(pinyinHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`,
    `<line x1="${fixed(x)}" y1="${fixed(y + pinyinHeight * 0.34)}" x2="${fixed(x + width)}" y2="${fixed(y + pinyinHeight * 0.34)}" ${pinyinLineStroke}/>`,
    `<line x1="${fixed(x)}" y1="${fixed(y + pinyinHeight * 0.66)}" x2="${fixed(x + width)}" y2="${fixed(y + pinyinHeight * 0.66)}" ${pinyinLineStroke}/>`,
    `<rect x="${fixed(x)}" y="${fixed(charY)}" width="${fixed(width)}" height="${fixed(charHeight)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.72"/>`,
    `<line x1="${fixed(x)}" y1="${fixed(midY)}" x2="${fixed(x + width)}" y2="${fixed(midY)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`,
    `<line x1="${fixed(midX)}" y1="${fixed(charY)}" x2="${fixed(midX)}" y2="${fixed(charY + charHeight)}" stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.4 2"/>`
  ].join("");
}

function renderHuiCell(layout: CopybookLayout, x: number, y: number) {
  const { grid, style } = layout;
  const width = grid.cellWidth;
  const height = grid.cellHeight;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const insetX = width * 0.24;
  const insetY = height * 0.24;
  const guideStroke = `stroke="${style.guideColor}" stroke-width="0.55" stroke-dasharray="1.5 2"`;

  return [
    `<rect x="${fixed(x)}" y="${fixed(y)}" width="${fixed(width)}" height="${fixed(height)}" fill="none" stroke="${style.strokeColor}" stroke-width="0.82"/>`,
    `<line x1="${fixed(midX)}" y1="${fixed(y)}" x2="${fixed(midX)}" y2="${fixed(y + height)}" ${guideStroke}/>`,
    `<line x1="${fixed(x)}" y1="${fixed(midY)}" x2="${fixed(x + width)}" y2="${fixed(midY)}" ${guideStroke}/>`,
    `<rect x="${fixed(x + insetX)}" y="${fixed(y + insetY)}" width="${fixed(width - insetX * 2)}" height="${fixed(height - insetY * 2)}" fill="none" ${guideStroke}/>`,
    `<line x1="${fixed(x)}" y1="${fixed(y)}" x2="${fixed(midX)}" y2="${fixed(midY)}" ${guideStroke}/>`,
    `<line x1="${fixed(x + width)}" y1="${fixed(y)}" x2="${fixed(midX)}" y2="${fixed(midY)}" ${guideStroke}/>`,
    `<line x1="${fixed(x)}" y1="${fixed(y + height)}" x2="${fixed(midX)}" y2="${fixed(midY)}" ${guideStroke}/>`,
    `<line x1="${fixed(x + width)}" y1="${fixed(y + height)}" x2="${fixed(midX)}" y2="${fixed(midY)}" ${guideStroke}/>`
  ].join("");
}

function renderPinyin(layout: CopybookLayout, item: CopybookLayout["content"][number]) {
  if (!item.pinyin || layout.grid.variant === "calligraphy") {
    return "";
  }

  const fontSize = layout.style.pinyinFontSize;
  const x = item.pinyinX ?? item.x + layout.grid.cellWidth / 2;
  const y = item.pinyinY ?? Math.max(8, item.y - Math.max(7, fontSize * 0.6));
  const isPolyphonic = (item.pinyinOptions?.length ?? 0) > 1;
  const highlightPinyin = isPolyphonic && !item.pinyinSelected;
  const pinyinTextWidth = Math.max(fontSize * 2, item.pinyin.length * fontSize * 0.54 + 9);
  const pinyinBoxHeight = fontSize + 4;
  const pinyinAttrs = isPolyphonic
    ? ` data-role="stroke-pinyin-picker" data-key="${escapeXml(item.pinyinKey ?? "")}" data-char="${escapeXml(item.pinyinChar ?? item.text)}" data-options="${escapeXml(item.pinyinOptions?.join("|") ?? "")}" data-selected="${item.pinyinSelected ? "true" : "false"}" cursor="pointer"`
    : "";

  return [
    `<g${pinyinAttrs}>`,
    highlightPinyin
      ? `<rect x="${fixed(x - pinyinTextWidth / 2)}" y="${fixed(y - fontSize - 2)}" width="${fixed(pinyinTextWidth)}" height="${fixed(pinyinBoxHeight)}" rx="3" fill="#FFF3B0" stroke="#FDE047" stroke-width="0.55"/>`
      : "",
    `<text x="${fixed(x)}" y="${fixed(y)}" font-size="${fixed(fontSize)}" font-family="${pinyinFontFamily(layout)}" fill="${layout.style.textColor}" text-anchor="middle">${escapeXml(item.pinyin)}</text>`,
    "</g>"
  ].join("");
}

function renderGuideText(layout: CopybookLayout, item: CopybookLayout["content"][number]) {
  if (item.darkExampleCount !== undefined || item.traceExampleCount !== undefined) {
    const darkCount = Math.max(0, item.darkExampleCount ?? 0);
    const traceCount = Math.max(0, item.traceExampleCount ?? 0);
    const slots = Array.from({ length: traceCount }, (_, index) => darkCount + index);

    return slots.map((slot) => renderText(layout, item, slot, layout.style.traceColor ?? layout.style.textColor, "1")).join("");
  }

  const slots = item.style === "copy" ? [0] : Array.from({ length: item.repeat }, (_, index) => index);

  return slots.map((slot) => renderText(layout, item, slot, layout.style.traceColor ?? layout.style.textColor, "0.32")).join("");
}

function renderContentText(layout: CopybookLayout, item: CopybookLayout["content"][number]) {
  if (item.darkExampleCount !== undefined || item.traceExampleCount !== undefined) {
    const darkCount = Math.max(0, item.darkExampleCount ?? 0);
    const slots = Array.from({ length: darkCount }, (_, index) => index);

    return slots.map((slot) => renderText(layout, item, slot, layout.style.textColor, "0.95")).join("");
  }

  const slots =
    item.style === "hybrid"
      ? [0]
      : item.style === "copy"
        ? []
        : Array.from({ length: item.repeat }, (_, index) => index);

  return slots.map((slot) => renderText(layout, item, slot, layout.style.textColor, "0.95")).join("");
}

function renderText(
  layout: CopybookLayout,
  item: CopybookLayout["content"][number],
  slot: number,
  fill: string,
  opacity: string
) {
  const align = item.align === "left" ? "start" : "middle";
  const x =
    (item.align === "left"
      ? item.x + slot * layout.grid.cellWidth
      : item.x + slot * layout.grid.cellWidth + layout.grid.cellWidth / 2) + (item.textOffsetX ?? 0);
  const isPinyinPractice = isPinyinPracticeLayout(layout);
  const baseFontSize = isPinyinPractice ? pinyinPracticeFontSize(layout.grid.cellHeight) : layout.style.fontSize;
  const fontSize = item.maxFontSize === undefined ? baseFontSize : Math.min(baseFontSize, item.maxFontSize);
  const contentCellHeight = item.contentCellHeight ?? layout.grid.cellHeight;
  const y =
    (item.verticalAlign === "middle"
      ? item.y + contentCellHeight / 2
      : isPinyinPractice
        ? item.y + layout.grid.cellHeight * pinyinMiddleBottomRatio
        : item.y + contentCellHeight * 2 / 3) +
    (item.textOffsetY ?? 0);
  const baselineOffsetRatio = item.baselineOffsetRatio ?? verticalMiddleBaselineOffsetRatio;
  const dyAttr = item.verticalAlign === "middle" ? ` dy="${fixed(fontSize * baselineOffsetRatio)}"` : "";
  const preserveSpaceAttr = item.preserveSpace ? ' xml:space="preserve"' : "";
  const letterSpacingAttr = item.letterSpacing ? ` letter-spacing="${fixed(item.letterSpacing)}"` : "";
  const encodedText = encodeTextForFont(item.text, layout.style.fontEncoding);
  const fontFamily = isPinyinPractice && layout.style.font !== "custom" ? "Inter, Arial, sans-serif" : contentFontFamily(layout, encodedText);
  const textNode = `<text x="${fixed(x)}" y="${fixed(y)}"${dyAttr}${preserveSpaceAttr}${letterSpacingAttr} font-size="${fixed(fontSize)}" font-family="${fontFamily}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${align}">${escapeXml(encodedText)}</text>`;

  if (
    item.clipX !== undefined &&
    item.clipY !== undefined &&
    item.clipWidth !== undefined &&
    item.clipHeight !== undefined
  ) {
    const clipId = svgSafeId(`${item.clipId ?? "text-clip"}-${slot}-${fill}-${opacity}`);
    const clipX = item.clipX + slot * layout.grid.cellWidth;

    return [
      `<clipPath id="${clipId}"><rect x="${fixed(clipX)}" y="${fixed(item.clipY)}" width="${fixed(item.clipWidth)}" height="${fixed(item.clipHeight)}"/></clipPath>`,
      `<g clip-path="url(#${clipId})">${textNode}</g>`
    ].join("");
  }

  return textNode;
}

function renderFontFace(layout: CopybookLayout) {
  const rules: string[] = [];
  const fontUrl = layout.style.customFontPreviewUrl ?? layout.style.customFontUrl;
  const fallbackFontUrl = layout.style.customFontFallbackPreviewUrl ?? layout.style.customFontFallbackUrl;
  const pinyinFontUrl = layout.style.pinyinFontPreviewUrl ?? layout.style.pinyinFontUrl;

  if (layout.style.font === "custom" && layout.style.customFontFamily && fontUrl) {
    rules.push(
      `@font-face{font-family:'${escapeCssString(layout.style.customFontFamily)}';src:url('${escapeCssUrl(fontUrl)}');font-display:swap;}`
    );
  }

  if (layout.style.customFontFallbackFamily && fallbackFontUrl) {
    rules.push(
      `@font-face{font-family:'${escapeCssString(layout.style.customFontFallbackFamily)}';src:url('${escapeCssUrl(fallbackFontUrl)}');font-display:swap;}`
    );
  }

  if (layout.style.pinyinFontFamily && pinyinFontUrl) {
    rules.push(
      `@font-face{font-family:'${escapeCssString(layout.style.pinyinFontFamily)}';src:url('${escapeCssUrl(pinyinFontUrl)}');font-display:swap;}`
    );
  }

  if (rules.length === 0) {
    return "";
  }

  return ["<defs>", "<style>", ...rules, "</style>", "</defs>"].join("");
}

function contentFontFamily(layout: CopybookLayout, text = "") {
  const kaiFallback = "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";

  if (layout.style.font === "custom" && layout.style.customFontFamily) {
    const customFamily = `'${escapeXml(layout.style.customFontFamily)}'`;
    const fallbackFamily = layout.style.customFontFallbackFamily ? `'${escapeXml(layout.style.customFontFallbackFamily)}'` : "";

    if (layout.style.fontEncoding === "cns-pua" || layout.style.fontEncoding === "cns-ext-b") {
      const useCustomFont = layout.style.fontEncoding === "cns-pua" ? containsCnsPua(text) : containsCnsSupplement(text);
      const familyStack = useCustomFont
        ? [customFamily, fallbackFamily, kaiFallback]
        : fallbackFamily
          ? [fallbackFamily, customFamily, kaiFallback]
          : [kaiFallback];

      return familyStack.filter(Boolean).join(", ");
    }

    return `${customFamily}, ${kaiFallback}`;
  }

  if (layout.style.font === "source-han-serif") {
    return "Source Han Serif, Songti SC, serif";
  }

  if (layout.style.font === "serif") {
    return "serif";
  }

  return kaiFallback;
}

function pinyinFontFamily(layout: CopybookLayout) {
  const family = layout.style.pinyinFontFamily ?? pinyinDedicatedFontName;

  return `${escapeXml(family)}, Quicksand, Inter, Arial, sans-serif`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeCssString(value: string) {
  return escapeXml(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function escapeCssUrl(value: string) {
  return escapeXml(value).replaceAll("\\", "\\\\").replaceAll("'", "%27");
}

function fixed(value: number) {
  return Number(value.toFixed(3));
}

function svgSafeId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return `zitie-${hash.toString(36)}`;
}

function clampPreviewZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Number(Math.min(previewZoomMax, Math.max(previewZoomMin, value)).toFixed(3));
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function formatCopybookRecordTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
}

function copybookRecordPdfUrl(record: CopybookRecord, download = false) {
  const baseUrl = `/api/copybooks/${encodeURIComponent(record.id)}/pdf`;

  return download ? `${baseUrl}?download=1` : baseUrl;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("文件读取失败"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function requestPublicFonts() {
  const response = await fetch("/api/fonts", {
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<PublicCopybookFont[]>;

  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "字体列表加载失败");
  }

  return payload.data;
}

function fontNameFromFilename(filename: string) {
  const name = filename.replace(/\.(ttf|otf|ttc|woff2?)$/i, "").replace(/[-_]+/g, " ").trim();

  return name || "我的字体";
}

function isAllowedFontUpload(file: File) {
  return /\.(ttf|otf|ttc|woff2?)$/i.test(file.name);
}

function isUserUploadedFontOption(font: FontPickerOption, userUploadedFontIdSet: Set<string>) {
  return font.type === "custom" && (font.font.ownerType === "USER" || userUploadedFontIdSet.has(font.id));
}

function resolveFontPickerInitialFilter(
  selectedFontId: string,
  fonts: FontPickerOption[],
  userUploadedFontIds: string[]
): FontPickerFilter {
  const selectedFont = fonts.find((font) => font.id === selectedFontId);

  if (!selectedFont) {
    return "chinese";
  }

  if (isUserUploadedFontOption(selectedFont, new Set(userUploadedFontIds))) {
    return "mine";
  }

  if (isChineseFontOption(selectedFont)) {
    return "chinese";
  }

  if (isEnglishFontOption(selectedFont)) {
    return "english";
  }

  return "chinese";
}

function readStoredFontIds(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];

    return Array.isArray(parsed) ? uniqueFontIds(parsed.filter((item): item is string => typeof item === "string")) : [];
  } catch {
    return [];
  }
}

function writeStoredFontIds(key: string, ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(uniqueFontIds(ids)));
}

function uniqueFontIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function fontPreviewFamily(font: FontPickerOption) {
  const kaiFallback = "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";

  if (font.type === "custom") {
    const fontSearchText = [font.font.name, font.font.filename, font.font.originalName].join(" ");

    if (isCnsPuaFontName(fontSearchText) || isCnsExtBFontName(fontSearchText)) {
      return `${kaiFallback}, '${escapeCssFamilyForHtml(font.font.name)}'`;
    }

    return `'${escapeCssFamilyForHtml(font.font.name)}', ${kaiFallback}`;
  }

  if (font.font === "source-han-serif") {
    return "Source Han Serif, Songti SC, serif";
  }

  if (font.font === "serif") {
    return "serif";
  }

  return kaiFallback;
}

function isChineseFontOption(font: FontPickerOption) {
  if (font.type === "built-in") {
    return true;
  }

  return font.font.suitableTemplates.some((template) =>
    ["shengzi", "pinyin-tian", "essay", "calligraphy", "huizi", "line", "eight-line"].includes(template)
  );
}

function isEnglishFontOption(font: FontPickerOption) {
  if (font.type === "built-in") {
    return false;
  }

  return font.font.suitableTemplates.some((template) => ["english", "pinyin"].includes(template));
}

function fontFaceCssForHtml(fonts: PublicCopybookFont[], previewUrls: Record<string, string>) {
  return fonts
    .map((font) => {
      const family = escapeCssFamilyForHtml(font.name);
      const url = escapeCssUrlForHtml(fontUrlForBrowser(font, previewUrls));

      return `@font-face{font-family:'${family}';src:url('${url}');font-display:swap;}`;
    })
    .join("\n");
}

function escapeCssFamilyForHtml(value: string) {
  return value.replace(/[\n\r\f]/g, " ").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function escapeCssUrlForHtml(value: string) {
  return value.replace(/[\n\r\f]/g, "").replaceAll("\\", "\\\\").replaceAll("'", "%27").replaceAll(")", "%29");
}

function resolveSelectedFont(
  fontId: string,
  customFonts: PublicCopybookFont[],
  previewUrls: Record<string, string>
): SelectedFontConfig {
  const builtIn = builtInFontOptions.find((font) => font.id === fontId);

  if (builtIn) {
    return {
      font: builtIn.font
    };
  }

  const customFont = customFonts.find((font) => font.id === fontId);

  if (!customFont) {
    return {
      font: "kaiti"
    };
  }
  const fontSearchText = [customFont.name, customFont.filename, customFont.originalName].join(" ");
  const fontEncoding: CopybookFontEncoding = isCnsPuaFontName(fontSearchText)
    ? "cns-pua"
    : isCnsExtBFontName(fontSearchText)
      ? "cns-ext-b"
      : "unicode";
  const fallbackFont =
    fontEncoding === "cns-pua" || fontEncoding === "cns-ext-b"
      ? (customFonts.find(
          (font) =>
            font.id !== customFont.id && isCnsBaseFontName([font.name, font.filename, font.originalName].join(" "))
        ) ??
        customFonts.find((font) => isCnsUnicodeFallbackFont(font, customFont.id)))
      : undefined;

  return {
    font: "custom",
    customFontFamily: customFont.name,
    customFontUrl: fontUrlForPreview(customFont),
    customFontPreviewUrl: fontUrlForBrowser(customFont, previewUrls),
    customFontFallbackFamily: fallbackFont?.name,
    customFontFallbackUrl: fallbackFont ? fontUrlForPreview(fallbackFont) : undefined,
    customFontFallbackPreviewUrl: fallbackFont ? fontUrlForBrowser(fallbackFont, previewUrls) : undefined,
    fontEncoding
  };
}

function isCnsUnicodeFallbackFont(font: PublicCopybookFont, selectedFontId: string) {
  if (font.id === selectedFontId) {
    return false;
  }

  const fontSearchText = [font.name, font.filename, font.originalName].join(" ");

  if (isCnsPuaFontName(fontSearchText) || isCnsExtBFontName(fontSearchText)) {
    return false;
  }

  return font.suitableTemplates.some((template) =>
    ["shengzi", "pinyin-tian", "essay", "calligraphy", "huizi", "line", "eight-line", "name-label"].includes(template)
  );
}

function fontUrlForBrowser(font: PublicCopybookFont, previewUrls: Record<string, string>) {
  return previewUrls[fontPreviewUrlKey(font)] ?? appendFontUrlVersion(fontUrlForPreview(font), font.updatedAt);
}

function fontUrlForPreview(font: PublicCopybookFont) {
  try {
    const parsed = new URL(font.url);
    const filename = parsed.pathname.split("/").filter(Boolean).at(-1);

    return filename ? `/api/fonts/files/${encodeURIComponent(filename)}` : font.url;
  } catch {
    const filename = font.url.split("/").filter(Boolean).at(-1);

    return filename ? `/api/fonts/files/${encodeURIComponent(filename)}` : font.url;
  }
}

function fontPreviewUrlKey(font: PublicCopybookFont) {
  return `${font.id}:${font.updatedAt}`;
}

function appendFontUrlVersion(url: string, updatedAt: string) {
  if (!updatedAt || url.startsWith("blob:")) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
}

function hasRenderableContent(layout: CopybookRenderLayout) {
  return layoutPages(layout).some(
    (page) =>
      page.content.length > 0 ||
      (page.strokePracticeRows?.length ?? 0) > 0 ||
      Boolean(page.nameLabelSheet?.labels.length) ||
      isRuledPaperLayout(page)
  );
}

function isRuledPaperLayout(page: CopybookLayout) {
  return page.grid.visible !== false && page.grid.variant === "ruled" && page.grid.rows > 0;
}

function layoutPages(layout: CopybookRenderLayout) {
  return "pages" in layout ? layout.pages : [layout];
}

function firstLayoutPage(layout: CopybookRenderLayout) {
  return layoutPages(layout)[0] ?? emptyLayoutPage();
}

function renderLayoutFromPages(pages: CopybookLayout[]): CopybookRenderLayout {
  if (pages.length <= 1) {
    return pages[0] ?? emptyLayoutPage();
  }

  return {
    pages
  };
}

function emptyLayoutPage(): CopybookLayout {
  const pageInfo = paperSizes.A4;

  return {
    page: pageInfo,
    worksheet: {
      title: "一年级生字练习",
      footer: "好好写字  天天向上",
      showStudentFields: true,
      showTitle: false,
      titleStyle: {
        color: copybookThemes["green-red"].textColor,
        font: "kaiti",
        fontSize: 16
      },
      showFooter: true,
      footerStyle: {
        color: copybookThemes["green-red"].textColor,
        font: "kaiti",
        fontSize: 11
      },
      studentFields: {
        school: {
          value: "",
          visible: true
        },
        className: {
          value: "",
          visible: true
        },
        name: {
          value: "",
          visible: true
        },
        studentNumber: {
          value: "",
          visible: true
        }
      },
      pageNumber: {
        position: "bottom-center",
        text: "第 1 页 / 共 1 页",
        visible: false
      }
    },
    grid: {
      type: "tianzi",
      cell,
      cellWidth: cell,
      cellHeight: cell,
      rowGap: 0,
      rows: 1,
      cols,
      x: pageInfo.margin,
      y: 170
    },
    content: [],
    style: {
      strokeColor: copybookThemes["green-red"].strokeColor,
      guideColor: copybookThemes["green-red"].guideColor,
      textColor: copybookThemes["green-red"].textColor,
      traceColor: traceFillForTextColor(copybookThemes["green-red"].textColor),
      font: "kaiti",
      fontSize: 24,
      pinyinFontSize: 10
    }
  };
}

function chunkArray<TItem>(items: TItem[], size: number) {
  const safeSize = Math.max(1, size);
  const chunks: TItem[][] = [];

  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }

  return chunks.length > 0 ? chunks : [[]];
}

function shouldWrapStrokeStepStrip({
  rowWidth,
  metaWidth,
  strokeCount
}: {
  rowWidth: number;
  metaWidth: number;
  strokeCount: number;
}) {
  if (strokeCount <= 0) {
    return false;
  }

  const sameLineAvailableWidth = Math.max(0, rowWidth - metaWidth - strokeStepPaddingX * 2);
  const stepStripWidth = strokeCount * strokeStepSize + Math.max(0, strokeCount - 1) * strokeStepGap;
  const requiredWidth = strokeStepLabelWidth + strokeStepLabelGap + stepStripWidth;

  return strokeCount > strokeStepWrapThreshold || requiredWidth > sameLineAvailableWidth;
}

function uniqueHanziChars(value: string) {
  return Array.from(new Set(Array.from(value).filter((char) => /^[\u3400-\u9FFF]$/u.test(char))));
}

function uniquePinyinOptions(options: string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean))).slice(0, 12);
}

function traceFillForTextColor(textColor: string) {
  return textColor.toLowerCase() === "#ef1d28" ? "#FFB6BD" : "#B8BEC8";
}

function rowStep(grid: CopybookLayout["grid"]) {
  return grid.cellHeight + grid.rowGap;
}

function gridHeight(grid: CopybookLayout["grid"]) {
  return grid.rows * grid.cellHeight + Math.max(0, grid.rows - 1) * grid.rowGap;
}

function isPinyinPracticeLayout(layout: CopybookLayout) {
  return layout.grid.type === "line" && layout.grid.cols === pinyinCols && Math.abs(layout.grid.cellWidth - pinyinCellWidth) < 0.1;
}

function pinyinPracticeFontSize(cellHeightValue: number) {
  return ((pinyinMiddleBottomRatio - pinyinMiddleTopRatio) * cellHeightValue) / pinyinXHeightRatio;
}

function normalizePinyinInput(value: string, strictLastToken = false) {
  const cleaned = cleanPinyinCharacters(value);
  const hasTrailingSpace = /\s$/.test(cleaned);
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  const validTokens = tokens.filter((token, index) => {
    const isDraft = isLastDraftToken(index, tokens.length, hasTrailingSpace);

    return isDraft && !strictLastToken ? isPinyinDraftToken(token) : isPinyinToken(token);
  });

  return `${validTokens.join(" ")}${hasTrailingSpace && validTokens.length > 0 ? " " : ""}`;
}

function normalizeHanziInput(value: string) {
  return Array.from(value)
    .filter((char) => /^[\u3400-\u9FFF]$/u.test(char))
    .join("");
}

function tokenizePinyin(value: string) {
  return cleanPinyinCharacters(value).split(/\s+/).filter(isPinyinToken);
}

function tokenizePracticeItems({
  isEightLineTemplate,
  isEnglishTemplate,
  isHanziOnlyTemplate,
  isPinyinPractice,
  mode,
  text
}: {
  isEightLineTemplate: boolean;
  isEnglishTemplate: boolean;
  isHanziOnlyTemplate: boolean;
  isPinyinPractice: boolean;
  mode: PracticeLineMode;
  text: string;
}) {
  if (isPinyinPractice) {
    return tokenizePinyin(text);
  }

  if (isEightLineTemplate) {
    return tokenizeEightLineInput(text);
  }

  if (!isEnglishTemplate) {
    if (isHanziOnlyTemplate) {
      return Array.from(text).filter((char) => /^[\u3400-\u9FFF]$/u.test(char));
    }

    return Array.from(text.replace(/\s+/g, ""));
  }

  if (mode === "letter") {
    return Array.from(text).filter((char) => /[A-Za-z]/.test(char));
  }

  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
}

function tokenizeEssayAlternateRows(value: string, cols: number) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const rows: string[][] = [];

  lines.forEach((line, lineIndex) => {
    const cells = tokenizeEssayAlternateLine(line);

    if (cells.length === 0) {
      if (lineIndex < lines.length - 1) {
        rows.push([]);
      }

      return;
    }

    for (let index = 0; index < cells.length; index += cols) {
      rows.push(cells.slice(index, index + cols));
    }
  });

  return rows;
}

function tokenizeEssayAlternateLine(line: string) {
  const cells: string[] = [];
  let halfSpaceCount = 0;

  const pushHalfSpaceCells = () => {
    const blankCellCount = Math.floor(halfSpaceCount / 3);

    for (let index = 0; index < blankCellCount; index += 1) {
      cells.push(" ");
    }

    halfSpaceCount = 0;
  };

  for (const char of Array.from(line)) {
    if (char === " ") {
      halfSpaceCount += 1;
      continue;
    }

    if (char === "　") {
      pushHalfSpaceCells();
      cells.push(" ");
      continue;
    }

    pushHalfSpaceCells();

    if (!/\s/u.test(char)) {
      cells.push(char);
    }
  }

  pushHalfSpaceCells();

  return cells;
}

function wrapEnglishWords(words: string[], maxWidth: number, fontSizeValue: number) {
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (currentLine && estimateEnglishTextWidth(nextLine, fontSizeValue) > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function wrapEnglishTextLines(value: string, maxWidth: number, fontSizeValue: number) {
  const sourceLines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = sourceLines.flatMap((line) => wrapEnglishWords(line.split(/\s+/).filter(Boolean), maxWidth, fontSizeValue));

  return lines.length > 0 ? lines : [];
}

function estimateEnglishTextWidth(value: string, fontSizeValue: number) {
  return Array.from(value).reduce((width, char) => {
    if (char === " ") {
      return width + fontSizeValue * 0.34;
    }

    if (/[ilI.,'’]/.test(char)) {
      return width + fontSizeValue * 0.28;
    }

    if (/[mwMW]/.test(char)) {
      return width + fontSizeValue * 0.7;
    }

    return width + fontSizeValue * 0.5;
  }, 0);
}

function cleanPinyinCharacters(value: string) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜêÊńňǹḿ'’ -]/gu, "")
    .replace(/\s{2,}/g, " ");
}

function isLastDraftToken(index: number, length: number, hasTrailingSpace: boolean) {
  return index === length - 1 && !hasTrailingSpace;
}

function isPinyinToken(token: string) {
  const parts = toPlainPinyin(token).split(/['’-]+/).filter(Boolean);

  return parts.length > 0 && parts.every((part) => pinyinSyllablePattern.test(part) || /^(m|n|ng)$/.test(part));
}

function isPinyinDraftToken(token: string) {
  const parts = toPlainPinyin(token).split(/['’-]+/).filter(Boolean);

  return parts.length > 0 && parts.every((part) => pinyinSyllablePrefixes.has(part));
}

function toPlainPinyin(value: string) {
  return Array.from(value.toLowerCase())
    .map((char) => pinyinToneMap[char] ?? char)
    .join("");
}

function clampNumber(value: number | string, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

const pinyinSyllablePattern =
  /^(?:zh|ch|sh|[bpmfdtnlgkhjqxzcsryw])?(?:a|o|e|ai|ei|ao|ou|an|en|ang|eng|er|i|ia|ie|iao|iu|ian|in|iang|ing|iong|u|ua|uo|uai|ui|uan|un|uang|ong|ue|v|ve)$/;

const pinyinSyllablePrefixes = new Set(
  ["", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s", "y", "w"]
    .flatMap((initial) =>
      ["a", "o", "e", "ai", "ei", "ao", "ou", "an", "en", "ang", "eng", "er", "i", "ia", "ie", "iao", "iu", "ian", "in", "iang", "ing", "iong", "u", "ua", "uo", "uai", "ui", "uan", "un", "uang", "ong", "ue", "v", "ve"].map(
        (final) => `${initial}${final}`
      )
    )
    .concat(["m", "n", "ng"])
    .flatMap((syllable) => Array.from({ length: syllable.length }, (_, index) => syllable.slice(0, index + 1)))
);

const pinyinToneMap: Record<string, string> = {
  ā: "a",
  á: "a",
  ǎ: "a",
  à: "a",
  ē: "e",
  é: "e",
  ě: "e",
  è: "e",
  ê: "e",
  ī: "i",
  í: "i",
  ǐ: "i",
  ì: "i",
  ō: "o",
  ó: "o",
  ǒ: "o",
  ò: "o",
  ū: "u",
  ú: "u",
  ǔ: "u",
  ù: "u",
  ǖ: "v",
  ǘ: "v",
  ǚ: "v",
  ǜ: "v",
  ü: "v",
  ń: "n",
  ň: "n",
  ǹ: "n",
  ḿ: "m"
};
