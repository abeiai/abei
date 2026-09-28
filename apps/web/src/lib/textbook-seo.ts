import type { PublicTextbookFilterOption } from "@/lib/textbook-public-api";

export interface TextbookRouteFilters {
  educationType?: string;
  grade?: string;
  page?: number;
  q?: string;
  subject?: string;
  version?: string;
  volume?: string;
}

export interface TextbookRouteOptions {
  educationTypes: PublicTextbookFilterOption[];
  grades: PublicTextbookFilterOption[];
  subjects: PublicTextbookFilterOption[];
  versions: PublicTextbookFilterOption[];
  volumes: PublicTextbookFilterOption[];
}

export const textbookTypeRoutes = [
  { value: "PRIMARY", label: "小学", segment: "type-1" },
  { value: "JUNIOR", label: "初中", segment: "type-2" },
  { value: "PRIMARY_FIVE_FOUR", label: "小学五四学制", segment: "type-3" },
  { value: "JUNIOR_FIVE_FOUR", label: "初中五四学制", segment: "type-4" },
  { value: "SENIOR", label: "高中", segment: "type-5" },
  { value: "SPECIAL_EDUCATION", label: "特殊教育", segment: "type-6" }
];

export const textbookGradeRoutes = [
  { value: "一年级", segment: "grade-1" },
  { value: "二年级", segment: "grade-2" },
  { value: "三年级", segment: "grade-3" },
  { value: "四年级", segment: "grade-4" },
  { value: "五年级", segment: "grade-5" },
  { value: "六年级", segment: "grade-6" },
  { value: "七年级", segment: "grade-7" },
  { value: "八年级", segment: "grade-8" },
  { value: "九年级", segment: "grade-9" },
  { value: "高一", segment: "grade-10" },
  { value: "高二", segment: "grade-11" },
  { value: "高三", segment: "grade-12" },
  { value: "高中年级", segment: "grade-gaozhong" }
];

const subjectAliases = new Map([
  ["道德与法治", "daode-yu-fazhi"],
  ["语文", "yuwen"],
  ["数学", "shuxue"],
  ["英语", "yingyu"],
  ["艺术·音乐", "yishu-yinyue"],
  ["艺术·美术", "yishu-meishu"],
  ["艺术", "yishu"],
  ["科学", "kexue"],
  ["语文·书法练习指导", "yuwen-shufa"],
  ["体育与健康", "tiyu-yu-jiankang"],
  ["信息科技", "xinxi-keji"],
  ["物理", "wuli"],
  ["化学", "huaxue"],
  ["生物学", "shengwuxue"],
  ["历史", "lishi"],
  ["地理", "dili"],
  ["思想政治", "sixiang-zhengzhi"],
  ["音乐", "yinyue"],
  ["美术", "meishu"]
]);

const versionAliases = new Map([
  ["北京版", "beijing"],
  ["北师大版", "beishida"],
  ["重庆大学版", "chongqing-daxue"],
  ["闽教版", "minjiao"],
  ["粤教粤人版", "yuejiao-yueren"],
  ["冀教版（一年级起点）", "jijiao-yinianji-qidian"],
  ["冀教版", "jijiao"],
  ["湘少版", "xiangshao"],
  ["教科版（EEC学院）", "jiaoke-eec"],
  ["教科版（主编：龚亚夫&鲁宗干）", "jiaoke-gong-lu"],
  ["科普版", "kepu"],
  ["辽宁师大版", "liaoning-shida"],
  ["清华大学版", "qinghua"],
  ["人教版（一年级起点）（主编：吴欣）", "renjiao-yinianji-qidian"],
  ["人教版（PEP）（主编：吴欣）", "renjiao-pep"],
  ["人教版", "renjiao"],
  ["统编版", "tongbian"],
  ["鲁教湘教版", "lujiao-xiangjiao"],
  ["陕旅版", "shanlv"],
  ["沪教版", "hujiao"],
  ["川教版", "chuanjiao"],
  ["外研社版（一年级起点）（主编：陈琳）", "waiyanshe-yinianji-qidian"],
  ["外研社版（主编：陈琳）", "waiyanshe"],
  ["译林版", "yilin"],
  ["人教大同版", "renjiao-datong"],
  ["粤教沪外教版", "yuejiao-huwai"],
  ["接力社版", "jielishe"],
  ["人教A版", "renjiao-a"],
  ["特殊教育版", "teshu-jiaoyu"]
]);

export function textbookPath(filters: TextbookRouteFilters = {}) {
  const segments: string[] = [];
  const params = new URLSearchParams();
  const typeSegment = textbookTypeRoutes.find((item) => item.value === filters.educationType)?.segment;
  const gradeSegment = textbookGradeRoutes.find((item) => item.value === filters.grade)?.segment;

  if (typeSegment) {
    segments.push(typeSegment);
  }

  if (gradeSegment) {
    segments.push(gradeSegment);
  }

  if (filters.subject) {
    segments.push(textbookSubjectSegment(filters.subject));
  }

  if (filters.version) {
    segments.push(textbookVersionSegment(filters.version));
  }

  if (filters.page && filters.page > 1) {
    segments.push(`page-${filters.page}`);
  }

  if (filters.q?.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.volume?.trim()) {
    params.set("volume", filters.volume.trim());
  }

  const path = `/textbook${segments.length ? `/${segments.join("/")}` : ""}`;

  return params.size > 0 ? `${path}?${params.toString()}` : path;
}

export function textbookSubjectSegment(value: string) {
  return `subject-${subjectAliases.get(value) ?? slugifyDimension(value)}`;
}

export function textbookVersionSegment(value: string) {
  return `version-${versionAliases.get(value) ?? slugifyDimension(value)}`;
}

export function resolveTextbookRoute(segments: string[], options: TextbookRouteOptions) {
  const filters: TextbookRouteFilters = {};

  for (const segment of segments) {
    if (/^page-\d+$/.test(segment)) {
      if (filters.page) {
        return null;
      }

      filters.page = Number(segment.replace("page-", ""));
      continue;
    }

    const educationType = textbookTypeRoutes.find((item) => item.segment === segment)?.value;

    if (educationType) {
      if (filters.educationType) {
        return null;
      }

      filters.educationType = educationType;
      continue;
    }

    const grade = textbookGradeRoutes.find((item) => item.segment === segment)?.value;

    if (grade) {
      if (filters.grade) {
        return null;
      }

      filters.grade = grade;
      continue;
    }

    const subject = options.subjects.find((item) => textbookSubjectSegment(item.value) === segment)?.value;

    if (subject) {
      if (filters.subject) {
        return null;
      }

      filters.subject = subject;
      continue;
    }

    const version = options.versions.find((item) => textbookVersionSegment(item.value) === segment)?.value;

    if (version) {
      if (filters.version) {
        return null;
      }

      filters.version = version;
      continue;
    }

    return null;
  }

  return filters;
}

export function labelFor(options: PublicTextbookFilterOption[], value?: string) {
  return value ? options.find((option) => option.value === value)?.label ?? value : "";
}

export function slugifyDimension(value: string) {
  const slug = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "all";
}
