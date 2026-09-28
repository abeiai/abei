import type { EnglishGuidedStudyReferenceMaterial } from "./english-guided-study-reference-materials.js";

const searchEndpoint = "https://hanyu.baidu.com/s";
const detailEndpoint = "https://hanyuapp.baidu.com/dictapp/swan/poemdetail";
const fetchTimeoutMs = 4_000;
const searchMaxBytes = 512_000;

interface BaiduPoemLine {
  name?: unknown;
  pinyin?: unknown;
  punc?: unknown;
  translate?: unknown;
  zhushiKvList?: unknown;
}

interface BaiduPoemData {
  author?: unknown;
  background?: unknown;
  dynasty?: unknown;
  explain?: unknown;
  means?: unknown;
  name?: unknown;
  poemLines?: unknown;
  shangxi?: unknown;
}

interface BaiduSearchPoem {
  body?: unknown;
  literature_author?: unknown;
  name?: unknown;
  sid?: unknown;
}

export async function fetchBaiduHanyuGushiwenReference(input: {
  author: string | null;
  sourceText: string;
  title: string;
  fetcher?: typeof fetch;
}): Promise<EnglishGuidedStudyReferenceMaterial | null> {
  const query = searchQuery(input.title, input.sourceText);
  if (!query) {
    return null;
  }

  const fetcher = input.fetcher ?? fetch;
  const searchUrl = new URL(searchEndpoint);
  searchUrl.searchParams.set("wd", query);
  searchUrl.searchParams.set("from", "poem");
  const searchHtml = await fetchText(fetcher, searchUrl, searchMaxBytes);
  const matched = matchedSearchPoem(searchHtml, input);
  if (!matched) {
    return null;
  }

  const sid = firstString(matched.sid);
  if (!sid || !/^[a-z0-9]{16,64}$/i.test(sid)) {
    return null;
  }

  const detailUrl = new URL(detailEndpoint);
  detailUrl.searchParams.set("sid", sid);
  detailUrl.searchParams.set("lesson_from", "xiaodu");
  const detailResponse = await fetchWithTimeout(fetcher, detailUrl);
  if (!detailResponse.ok) {
    throw new Error(`百度汉语详情请求失败：${detailResponse.status}`);
  }

  const detailPayload = await detailResponse.json() as { data?: BaiduPoemData };
  const detail = detailPayload.data;
  if (!detail || comparable(stringValue(detail.name)) !== poemTitle(matched)) {
    return null;
  }

  return {
    id: `baidu-hanyu-${sid}`,
    kind: "TEXT",
    name: `百度汉语《${stringValue(detail.name) || input.title || query}》`,
    content: referenceContent(detail, matched, sid)
  };
}

function searchQuery(title: string, sourceText: string) {
  if (title.trim()) {
    return title.trim().slice(0, 40);
  }

  const firstLine = sourceText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return firstLine.replace(/[\s，。！？；：、,.!?;:《》〈〉“”‘’]/g, "").slice(0, 16);
}

function matchedSearchPoem(
  html: string,
  input: { author: string | null; sourceText: string; title: string }
) {
  const match = html.match(
    /<textarea[^>]*id=["']j_poem-body-content-value["'][^>]*>([\s\S]*?)<\/textarea>/i
  );
  if (!match?.[1]) {
    return null;
  }

  const payload = JSON.parse(match[1]) as { ret_array?: BaiduSearchPoem[] };
  const poems = Array.isArray(payload.ret_array) ? payload.ret_array : [];
  return poems.find((poem) => poemMatchesInput(poem, input)) ?? null;
}

function poemMatchesInput(
  poem: BaiduSearchPoem,
  input: { author: string | null; sourceText: string; title: string }
) {
  const candidateTitle = poemTitle(poem);
  const expectedTitle = comparable(input.title);
  if (expectedTitle && candidateTitle !== expectedTitle) {
    return false;
  }

  const candidateAuthor = comparable(poemAuthor(poem));
  const expectedAuthor = comparable(input.author ?? "");
  if (expectedAuthor && candidateAuthor !== expectedAuthor) {
    return false;
  }

  const candidateBody = comparable(firstString(poem.body));
  const sourceText = comparable(input.sourceText);
  const textMatches = candidateBody.length >= 4
    && sourceText.length >= 4
    && (candidateBody.includes(sourceText) || sourceText.includes(candidateBody));

  return textMatches || Boolean(expectedTitle && expectedAuthor);
}

function referenceContent(detail: BaiduPoemData, searchPoem: BaiduSearchPoem, sid: string) {
  const title = stringValue(detail.name);
  const author = stringValue(detail.author) || poemAuthor(searchPoem);
  const dynasty = stringValue(detail.dynasty);
  const lines = Array.isArray(detail.poemLines)
    ? detail.poemLines.filter((line): line is BaiduPoemLine => Boolean(line && typeof line === "object"))
    : [];
  const sections = [
    `来源：百度汉语公开页面\n作品链接：https://hanyu.baidu.com/hanyu-page/poem/detail?sid=${sid}`,
    `匹配作品：${title}${author ? `；作者：${author}` : ""}${dynasty ? `；朝代：${dynasty}` : ""}`,
    linesSection(lines),
    notesSection(lines),
    section("全文译文", detail.means, 4_000),
    section("作品简介", detail.explain, 2_000),
    section("创作背景", detail.background, 3_000),
    section("赏析与心境参考", detail.shangxi, 4_000),
    section("作者介绍", authorDescription(searchPoem), 2_000)
  ];

  return sections.filter(Boolean).join("\n\n").slice(0, 24_000);
}

function linesSection(lines: BaiduPoemLine[]) {
  if (lines.length === 0) {
    return "";
  }

  const content = lines.map((line) => {
    const original = `${stringValue(line.name)}${stringValue(line.punc).trim()}`.trim();
    const pinyin = stringValue(line.pinyin);
    const translation = stringValue(line.translate);
    return [original, pinyin ? `拼音：${pinyin}` : "", translation ? `译文：${translation}` : ""]
      .filter(Boolean)
      .join("\n");
  }).join("\n");
  return `原文、拼音与逐句译文：\n${content}`;
}

function notesSection(lines: BaiduPoemLine[]) {
  const notes = lines.flatMap((line) => Array.isArray(line.zhushiKvList)
    ? line.zhushiKvList.map((note) => {
        const value = objectValue(note);
        const term = stringValue(value?.source);
        const explanation = stringValue(value?.zhushi);
        return term && explanation ? `${term}：${explanation}` : "";
      })
    : []).filter(Boolean);
  return notes.length > 0 ? `字词注释：\n${Array.from(new Set(notes)).join("\n")}` : "";
}

function section(label: string, value: unknown, maxLength: number) {
  const text = textFromValue(value).slice(0, maxLength);
  return text ? `${label}：\n${text}` : "";
}

function textFromValue(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(value)) {
    return value.map(textFromValue).filter(Boolean).join("\n");
  }
  const object = objectValue(value);
  return object ? textFromValue(object.text) : "";
}

function authorDescription(poem: BaiduSearchPoem) {
  const author = Array.isArray(poem.literature_author) ? objectValue(poem.literature_author[0]) : null;
  return firstString(author?.basic_description);
}

function poemAuthor(poem: BaiduSearchPoem) {
  const author = Array.isArray(poem.literature_author) ? objectValue(poem.literature_author[0]) : null;
  return firstString(author?.display_name) || firstString(author?.basic_name_chs);
}

function poemTitle(poem: BaiduSearchPoem) {
  const name = Array.isArray(poem.name) ? objectValue(poem.name[0]) : null;
  return comparable(stringValue(name?.["@value"]) || firstString(poem.name));
}

function comparable(value: string) {
  return value.normalize("NFKC").replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

async function fetchText(fetcher: typeof fetch, url: URL, maxBytes: number) {
  const response = await fetchWithTimeout(fetcher, url);
  if (!response.ok) {
    throw new Error(`百度汉语检索请求失败：${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("百度汉语检索响应过大");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("百度汉语检索响应过大");
  }
  return text;
}

async function fetchWithTimeout(fetcher: typeof fetch, url: URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    return await fetcher(url, {
      headers: { accept: "application/json,text/html;q=0.9" },
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function firstString(value: unknown) {
  return Array.isArray(value) ? stringValue(value[0]) : stringValue(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
