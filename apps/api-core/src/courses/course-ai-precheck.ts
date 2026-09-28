export type CourseAiPrecheckFinding = {
  category: string;
  location: string;
  reason: string;
  evidence: string;
};

export type CourseAiPrecheckResult = {
  verdict: "PASS" | "REJECT";
  summary: string;
  reasons: CourseAiPrecheckFinding[];
};

export type CourseAiPrecheckPayload = {
  resourceName: string;
  resourceType: "COURSE_REVISION" | "MATERIAL_CHANGE";
  coverUrl: string | null;
  basicInfo: {
    title: string;
    summary: string;
    tags: string[];
    materialType: string | null;
    itemCount: number;
  };
  textSections: Array<{
    path: string;
    text: string;
  }>;
};

const skippedTextKeys = /(?:^|_)(?:id|url|hash|objectkey|storagekey)$/iu;
const maxFindingCount = 100;

export function buildCourseAiPrecheckPayload(input: {
  scope: "COURSE_REVISION" | "MATERIAL_CHANGE";
  afterSnapshot: unknown;
}): CourseAiPrecheckPayload {
  const snapshot = recordValue(input.afterSnapshot) ?? {};
  const title = stringValue(snapshot.name) ?? stringValue(snapshot.title) ?? "未命名资源";
  const summary = stringValue(snapshot.summary) ?? "";
  const tags = stringArray(snapshot.tags);
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const materialType = stringValue(snapshot.type)
    ?? stringValue(recordValue(items[0])?.materialType)
    ?? null;
  const coverUrl = stringValue(snapshot.coverUrl);
  const textSections: CourseAiPrecheckPayload["textSections"] = [];

  collectTextSections(snapshot, "resource", textSections);

  return {
    resourceName: title,
    resourceType: input.scope,
    coverUrl,
    basicInfo: {
      title,
      summary,
      tags,
      materialType,
      itemCount: items.length
    },
    textSections
  };
}

export function chunkCourseAiPrecheckText(
  sections: CourseAiPrecheckPayload["textSections"],
  maxCharacters = 24_000
) {
  if (sections.length === 0) {
    return [[]] as Array<CourseAiPrecheckPayload["textSections"]>;
  }

  const chunks: Array<CourseAiPrecheckPayload["textSections"]> = [];
  let current: CourseAiPrecheckPayload["textSections"] = [];
  let currentLength = 0;

  for (const section of sections) {
    const fragments = splitLongText(section.text, Math.max(1_000, maxCharacters - section.path.length - 20));

    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = {
        path: fragments.length === 1 ? section.path : `${section.path}（第 ${index + 1}/${fragments.length} 段）`,
        text: fragments[index]!
      };
      const length = fragment.path.length + fragment.text.length + 8;

      if (current.length > 0 && currentLength + length > maxCharacters) {
        chunks.push(current);
        current = [];
        currentLength = 0;
      }

      current.push(fragment);
      currentLength += length;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function parseCourseAiPrecheckResult(value: string): CourseAiPrecheckResult {
  const normalized = value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const objectStart = normalized.indexOf("{");
  const objectEnd = normalized.lastIndexOf("}");

  if (objectStart < 0 || objectEnd <= objectStart) {
    throw new Error("AI 预审未返回结构化结果");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized.slice(objectStart, objectEnd + 1));
  } catch {
    throw new Error("AI 预审未返回有效的结构化结果");
  }

  const record = recordValue(parsed);
  if (!record) {
    throw new Error("AI 预审未返回有效的结构化结果");
  }
  const verdict = record?.verdict;

  if (verdict !== "PASS" && verdict !== "REJECT") {
    throw new Error("AI 预审结构化结果缺少有效结论");
  }

  const reasons = Array.isArray(record.reasons)
    ? record.reasons.slice(0, maxFindingCount).flatMap((item) => {
        const finding = recordValue(item);
        const reason = stringValue(finding?.reason);

        if (!reason) {
          return [];
        }

        return [{
          category: stringValue(finding?.category) ?? "内容合规",
          location: stringValue(finding?.location) ?? "资源内容",
          reason,
          evidence: stringValue(finding?.evidence) ?? ""
        }];
      })
    : [];

  if (verdict === "REJECT" && reasons.length === 0) {
    throw new Error("AI 预审不通过但未给出理由");
  }

  return {
    verdict,
    summary: stringValue(record.summary) ?? (verdict === "PASS" ? "本批内容预审通过" : "本批内容预审不通过"),
    reasons
  };
}

export function combineCourseAiPrecheckResults(
  results: CourseAiPrecheckResult[]
): CourseAiPrecheckResult {
  const rejected = results.some((result) => result.verdict === "REJECT");
  const summaries = results.map((result) => result.summary.trim()).filter(Boolean);

  return {
    verdict: rejected ? "REJECT" : "PASS",
    summary: summaries.join("；") || (rejected ? "资源预审不通过" : "资源预审通过"),
    reasons: results.flatMap((result) => result.reasons).slice(0, maxFindingCount)
  };
}

function collectTextSections(
  value: unknown,
  path: string,
  output: CourseAiPrecheckPayload["textSections"]
) {
  if (typeof value === "string") {
    const text = value.trim();

    if (text) {
      output.push({ path, text });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextSections(item, `${path}[${index}]`, output));
    return;
  }

  const record = recordValue(value);

  if (!record) {
    return;
  }

  for (const [key, item] of Object.entries(record)) {
    if (skippedTextKeys.test(key) || /(?:Id|Url|Hash|ObjectKey|StorageKey)$/u.test(key)) {
      continue;
    }

    collectTextSections(item, `${path}.${key}`, output);
  }
}

function splitLongText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return [value];
  }

  const fragments: string[] = [];

  for (let offset = 0; offset < value.length; offset += maxLength) {
    fragments.push(value.slice(offset, offset + maxLength));
  }

  return fragments;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
    : [];
}
