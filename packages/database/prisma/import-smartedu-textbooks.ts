import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  getPrismaClient,
  type Prisma,
  type TextbookEducationType,
  type TextbookVolume
} from "../src/index.js";
import { normalizeSmartEduTextbookGrade } from "./textbook-grade-normalization.js";
import { smartEduTextbookSourceUrl } from "./textbook-source-url.js";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const smartEduBaseUrl = "https://bdcs-file-2.ykt.cbern.com.cn/zxx_secondary";
const dataVersionUrl = `${smartEduBaseUrl}/ndrs/resources/tch_material/version/data_version.json`;
const electronicTextbookTagName = "电子教材";
const genericPublisherName = "智慧中小学";

interface SmartEduDataVersion {
  module: string;
  module_version: number;
  urls: string;
}

interface SmartEduTag {
  tag_id: string;
  tag_name: string;
  tag_dimension_id: string;
}

interface SmartEduProvider {
  name?: string;
}

interface SmartEduResource {
  id: string;
  title?: string;
  global_title?: Record<string, string>;
  global_label?: Record<string, string[]>;
  custom_properties?: {
    thumbnails?: string[];
    preview?: Record<string, string>;
  };
  provider_list?: SmartEduProvider[];
  tag_list?: SmartEduTag[];
}

async function main() {
  const prisma = getPrismaClient();
  const resources = await fetchSmartEduTextbooks();
  const textbooks = resources.map(toTextbookCreateInput);

  await prisma.learningMaterialTextbook.deleteMany();

  for (const batch of chunk(textbooks, 500)) {
    await prisma.learningMaterialTextbook.createMany({
      data: batch
    });
  }

  const counts = await prisma.learningMaterialTextbook.groupBy({
    by: ["educationType"],
    _count: {
      id: true
    }
  });

  console.log(`已清空教材测试数据，并导入 SmartEdu 教材 ${textbooks.length} 条。`);
  counts
    .sort((left, right) => left.educationType.localeCompare(right.educationType))
    .forEach((item) => {
      console.log(`${item.educationType}: ${item._count.id}`);
    });

  await prisma.$disconnect();
}

async function fetchSmartEduTextbooks() {
  const version = await fetchJson<SmartEduDataVersion>(dataVersionUrl);
  const urls = version.urls
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (!urls.length) {
    throw new Error("SmartEdu 教材分片地址为空。");
  }

  const parts = await Promise.all(urls.map((url) => fetchJson<SmartEduResource[]>(url)));
  const resources = parts.flat();
  const visibleResources = resources.filter(isVisibleTextbookResource);

  console.log(
    `SmartEdu 原始资源 ${resources.length} 条，页面可筛选教材 ${visibleResources.length} 条。`
  );

  return visibleResources;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "xueleai-textbook-import/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`读取 SmartEdu 数据失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function isVisibleTextbookResource(resource: SmartEduResource) {
  const tags = resource.tag_list ?? [];

  return (
    tags.some((tag) => tag.tag_name === electronicTextbookTagName) &&
    tags.some((tag) => tag.tag_dimension_id === "zxxxd")
  );
}

function toTextbookCreateInput(
  resource: SmartEduResource,
  index: number
): Prisma.LearningMaterialTextbookCreateManyInput {
  const tags = resource.tag_list ?? [];
  const titleInfo = normalizeTextbookTitle(resource.title ?? resource.global_title?.["zh-CN"] ?? "未命名教材");
  const volumeTag = findTag(tags, "zxxcc");
  const educationType = toEducationType(tags);

  return {
    slug: toSlug(resource.id),
    title: titleInfo.title,
    educationType,
    subject: findTag(tags, "zxxxk") ?? "未标注学科",
    version: findTag(tags, "zxxbb") ?? "未标注版本",
    grade: normalizeSmartEduTextbookGrade({
      educationType,
      gradeTag: findTag(tags, "zxxnj"),
      title: titleInfo.title,
      volumeTag
    }),
    volume: toVolume(volumeTag, titleInfo.title),
    curriculumStandardYear: titleInfo.curriculumStandardYear ?? null,
    editionYear: null,
    publisher: toPublisher(resource),
    coverUrl: toCoverUrl(resource),
    sourceUrl: smartEduTextbookSourceUrl(resource.id),
    pdfUrl: null,
    pdfObjectKey: null,
    mdUrl: null,
    mdObjectKey: null,
    sortOrder: index + 1
  };
}

function findTag(tags: SmartEduTag[], dimensionId: string) {
  return normalizeOptionalText(tags.find((tag) => tag.tag_dimension_id === dimensionId)?.tag_name);
}

function findTags(tags: SmartEduTag[], dimensionId: string) {
  return tags
    .filter((tag) => tag.tag_dimension_id === dimensionId)
    .map((tag) => tag.tag_name)
    .filter(Boolean);
}

function toEducationType(tags: SmartEduTag[]): TextbookEducationType {
  const values = findTags(tags, "zxxxd");

  if (values.includes("特殊教育")) {
    return "SPECIAL_EDUCATION";
  }

  const value = values[0]?.replace(/•/g, "·") ?? "";

  if (value === "小学（五·四学制）") {
    return "PRIMARY_FIVE_FOUR";
  }

  if (value === "初中（五·四学制）") {
    return "JUNIOR_FIVE_FOUR";
  }

  if (value === "初中") {
    return "JUNIOR";
  }

  if (value === "高中") {
    return "SENIOR";
  }

  return "PRIMARY";
}

function toVolume(volumeTag: string | undefined, title: string): TextbookVolume {
  const text = `${volumeTag ?? ""} ${title}`;

  if (/下册|第二册|第2册/.test(text)) {
    return "SECOND_VOLUME";
  }

  if (/上册|第一册|第1册/.test(text)) {
    return "FIRST_VOLUME";
  }

  return "FULL_VOLUME";
}

function toPublisher(resource: SmartEduResource) {
  const providerNames = (resource.provider_list ?? [])
    .map((provider) => normalizeOptionalText(provider.name))
    .filter((name): name is string => Boolean(name));
  const namedPublishers = providerNames.filter((name) => name !== genericPublisherName);

  if (namedPublishers.length) {
    return namedPublishers.join("/");
  }

  return parsePublisherFromLabel(resource) ?? normalizeOptionalText(providerNames.join("/"));
}

function parsePublisherFromLabel(resource: SmartEduResource) {
  const labels = resource.global_label?.["zh-CN"] ?? [];
  const label = labels.find((item) => item.includes("出版社") || item.includes("课题组"));

  if (!label) {
    return undefined;
  }

  const publisherMatch = label.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·]+(?:出版社|课题组))/);

  return normalizeOptionalText(publisherMatch?.[1]);
}

function toCoverUrl(resource: SmartEduResource) {
  const thumbnails = resource.custom_properties?.thumbnails ?? [];

  if (thumbnails[0]) {
    return thumbnails[0];
  }

  const preview = resource.custom_properties?.preview;

  if (!preview) {
    return undefined;
  }

  return (
    preview.Slide1 ??
    Object.entries(preview).sort(([left], [right]) => left.localeCompare(right))[0]?.[1]
  );
}

function toSlug(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `smartedu-${slug || "textbook"}`;
}

function normalizeOptionalText(value: string | undefined) {
  const text = normalizeText(value ?? "");

  return text || undefined;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTextbookTitle(value: string) {
  const originalTitle = normalizeText(value);
  let title = originalTitle;
  const curriculumStandardMatch = title.match(/^[（(]\s*根据\s*(\d{4})\s*年版课程标准[^）)]*[）)]\s*/);
  const curriculumStandardYear = curriculumStandardMatch?.[1];

  if (curriculumStandardMatch) {
    title = title.slice(curriculumStandardMatch[0].length).trim();
  }

  title = title
    .replace(/^义务教育教科书[·•・．\s]*/, "")
    .replace(/^[·•・．\s]+/, "")
    .trim();
  title = normalizeFiveFourTitle(title);

  return {
    curriculumStandardYear,
    title: title || originalTitle
  };
}

function normalizeFiveFourTitle(value: string) {
  const fiveFourPattern = /[（(]\s*五[·•・．.\s]*四学制\s*[）)]/g;

  if (!fiveFourPattern.test(value)) {
    return value;
  }

  const title = value
    .replace(fiveFourPattern, "")
    .replace(/^[·•・．\s]+|[·•・．\s]+$/g, "")
    .replace(/\s+/g, "");

  return `${title || value.replace(/\s+/g, "")}（五·四学制）`;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await getPrismaClient().$disconnect();
  process.exit(1);
});
