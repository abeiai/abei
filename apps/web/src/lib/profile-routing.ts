export type SelectableProfileMode = "ACCOUNT" | "LEARNER";
export type WebProfileMode = "GUEST" | "UNSELECTED" | SelectableProfileMode;

const learnerScenarioRoots = new Map<string, string>([
  ["video-guide-practice-questions", "video-guide-narration"],
  ["video-guide-narration-timeline", "video-guide-narration"],
  ["english-guided-study-practice", "english-guided-study-material"],
  ["english-guided-study-narration-nodes", "english-guided-study-material"],
  ["english-guided-study-image-extraction", "english-guided-study-material"],
  ["gushiwen-guided-study-practice", "gushiwen-guided-study-material"]
]);

const fixedScenarioHrefs = new Map<string, string>([
  ["experience-ai-chat", "/experience/chat"],
  ["experience-image-generation", "/experience/image"],
  ["experience-video-generation", "/experience/video"],
  ["article-to-speech", "/voice"],
  ["video-guide-narration", "/media-tutor"],
  ["english-guided-study-material", "/text2lesson"],
  ["gushiwen-guided-study-material", "/gushiwen"],
  ["learning-flashcards-deck", "/flashcard"],
  ["zitie", "/zitie"],
  ["daodu", "/daodu"],
  ["typing", "/typing"]
]);

const localOrigin = "https://xueleai.local";

export function normalizeSafeNextPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  if (hasControlCharacters(value) || value.includes("\\")) {
    return null;
  }

  const decodedForValidation = decodeFully(value);

  if (
    decodedForValidation === null ||
    decodedForValidation.includes("\\") ||
    hasControlCharacters(decodedForValidation)
  ) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value, localOrigin);
  } catch {
    return null;
  }

  const decodedPathname = decodeFully(url.pathname);

  if (
    url.origin !== localOrigin ||
    decodedPathname === null ||
    !decodedPathname.startsWith("/") ||
    decodedPathname.startsWith("//") ||
    decodedPathname.includes("?") ||
    decodedPathname.includes("#")
  ) {
    return null;
  }

  const canonicalPathname = new URL(decodedPathname, localOrigin).pathname;

  if (canonicalPathname === "/admin" || canonicalPathname.startsWith("/admin/")) {
    return null;
  }

  return `${canonicalPathname}${url.search}${url.hash}`;
}

export function profileContinuationPath(value: unknown) {
  const safePath = normalizeSafeNextPath(value);

  if (!safePath) {
    return null;
  }

  const pathname = new URL(safePath, localOrigin).pathname;
  return pathname === "/select-profile" || pathname.startsWith("/select-profile/")
    ? null
    : safePath;
}

export function selectorLoginContinuation(value: unknown) {
  const selectorPath = normalizeSafeNextPath(value);

  if (!selectorPath) {
    return null;
  }

  const url = new URL(selectorPath, localOrigin);

  if (url.pathname !== "/select-profile") {
    return null;
  }

  const nextValues = url.searchParams.getAll("next");
  return nextValues.length === 1 ? profileContinuationPath(nextValues[0]) : null;
}

export function profileLoginHref(next: unknown) {
  const continuation = profileContinuationPath(next);
  return continuation ? `/login?next=${encodeURIComponent(continuation)}` : "/login";
}

export function profileSelectionHref(next: unknown) {
  const safeNext = profileContinuationPath(next);
  return safeNext ? `/select-profile?next=${encodeURIComponent(safeNext)}` : "/select-profile";
}

export function selectionDestination(
  mode: SelectableProfileMode,
  next: unknown,
  authorizedEntryPaths: readonly string[]
) {
  const safeNext = profileContinuationPath(next);

  if (mode === "ACCOUNT") {
    return safeNext ?? "/dashboard";
  }

  if (!safeNext) {
    return "/learn";
  }

  if (isPublicCourseDetailPath(safeNext)) {
    return safeNext;
  }

  const authorizedPaths = new Set(
    authorizedEntryPaths
      .map((path) => profileContinuationPath(path))
      .filter((path): path is string => path !== null)
  );

  return authorizedPaths.has(safeNext) ? safeNext : "/learn";
}

function isPublicCourseDetailPath(value: string) {
  const pathname = new URL(value, localOrigin).pathname;

  return /^\/c\/[0-9a-f]{24}$/u.test(pathname);
}

export function normalizeLearnerScenarioRoot(slug: string) {
  return learnerScenarioRoots.get(slug) ?? slug;
}

export function learnerScenarioHref(slug: string) {
  const root = normalizeLearnerScenarioRoot(slug);
  return fixedScenarioHrefs.get(root) ?? `/tools/${encodeURIComponent(root)}`;
}

export function isInternalLearnerScenario(slug: string) {
  return learnerScenarioRoots.has(slug);
}

export function isPublicLearningSharePath(value: unknown) {
  const segments = safePathSegments(value);

  if (!segments) {
    return false;
  }

  if (
    (segments[0] === "media-tutor" || segments[0] === "text2lesson")
    && segments.length === 2
    && segments[1] !== "creator"
  ) {
    return true;
  }

  if (
    segments[0] === "flashcard"
    && segments.length >= 2
    && segments[1] !== "creator"
  ) {
    return true;
  }

  return segments[0] === "learn" && segments[1] === "flashcards" && segments.length === 3;
}

export function applicationRootForPath(value: unknown): string | null {
  if (isPublicLearningSharePath(value)) {
    return null;
  }

  const segments = safePathSegments(value);

  if (!segments) {
    return null;
  }

  if (segments[0] === "tools" && segments.length === 2) {
    const root = normalizeLearnerScenarioRoot(segments[1] ?? "");
    return fixedScenarioHrefs.has(root) ? root : null;
  }

  const pathname = `/${segments.join("/")}`;
  const exact = new Map<string, string>([
    ["/experience/chat", "experience-ai-chat"],
    ["/experience/image", "experience-image-generation"],
    ["/photo", "experience-image-generation"],
    ["/experience/video", "experience-video-generation"],
    ["/voice", "article-to-speech"]
  ]).get(pathname);

  if (exact) {
    return exact;
  }

  if (segments[0] === "media-tutor" && (segments.length === 1 || segments[1] === "creator")) {
    return "video-guide-narration";
  }
  if (segments[0] === "text2lesson" && (segments.length === 1 || segments[1] === "creator")) {
    return "english-guided-study-material";
  }
  if (segments[0] === "gushiwen" && (segments.length === 1 || segments[1] === "creator")) {
    return "gushiwen-guided-study-material";
  }
  if (segments[0] === "flashcard" && (segments.length === 1 || segments[1] === "creator")) {
    return "learning-flashcards-deck";
  }
  if (segments[0] === "zitie" && segments.length === 1) {
    return "zitie";
  }
  if (segments[0] === "daodu" && (segments.length === 1 || segments[1] === "creator")) {
    return "daodu";
  }
  if (segments[0] === "typing") {
    return "typing";
  }

  return null;
}

export function learnerEntryDecision(
  mode: WebProfileMode,
  path: unknown,
  authorizedScenarioSlugs: readonly string[]
) {
  if (mode === "GUEST" || mode === "ACCOUNT" || isPublicLearningSharePath(path)) {
    return "ALLOW" as const;
  }
  if (mode === "UNSELECTED") {
    return "SELECT" as const;
  }

  const root = applicationRootForPath(path);
  const authorizedRoots = new Set(authorizedScenarioSlugs.map(normalizeLearnerScenarioRoot));
  return root && authorizedRoots.has(root) ? ("ALLOW" as const) : ("DENY" as const);
}

function safePathSegments(value: unknown) {
  const safePath = normalizeSafeNextPath(value);

  if (!safePath) {
    return null;
  }

  const pathname = new URL(safePath, localOrigin).pathname;

  try {
    return decodeURIComponent(pathname).split("/").filter(Boolean);
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function decodeFully(value: string) {
  let decoded = value;

  for (let depth = 0; depth < 8; depth += 1) {
    let next: string;

    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }

    if (next === decoded) {
      return decoded;
    }
    decoded = next;
  }

  return null;
}
