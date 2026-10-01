export interface PictureBookPage {
  position: number;
  caption: string;
  imagePrompt: string;
  narration: string;
  imageUrl: string | null;
  imageTaskId: string | null;
  audioUrl: string | null;
  audioTaskId: string | null;
}

export interface PictureBookCharacter {
  id?: string;
  name: string;
  description: string;
  imageUrl?: string | null;
}

export interface PictureBookMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PictureBookOutline {
  title: string;
  theme: string;
  audience: string;
  plot: string;
  pages: PictureBookPage[];
}

export function storyTaskText(chunks: string[], storedOutput: string | null, requireComplete: boolean): string {
  const streamed = chunks.join("").trim();
  return streamed || (requireComplete ? "" : storedOutput?.trim() ?? "");
}

export function normalizeOutline(output: string, pageCount: number): PictureBookOutline {
  const raw = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("分镜内容不是有效 JSON");

  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("分镜内容不是有效 JSON");
  }

  if (!Array.isArray(value.pages) || value.pages.length !== pageCount) {
    throw new Error(`分镜页数必须为 ${pageCount} 页`);
  }

  const title = requiredString(value.title, "绘本标题", 100);
  const theme = requiredString(value.theme, "绘本主题", 240);
  const audience = requiredString(value.audience, "适合人群", 100);
  const plot = requiredString(value.plot, "主要情节", 4000);
  const pages = value.pages.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`第 ${index + 1} 页内容不正确`);
    const page = item as Record<string, unknown>;
    const caption = requiredString(page.caption, `第 ${index + 1} 页展示文字`, 500);
    const imagePrompt = requiredString(page.imagePrompt, `第 ${index + 1} 页画面提示词`, 2000);
    const narration = optionalString(page.narration, 1000) || caption;
    return {
      position: index + 1,
      caption,
      imagePrompt,
      narration,
      imageUrl: null,
      imageTaskId: null,
      audioUrl: null,
      audioTaskId: null
    };
  });
  return { title, theme, audience, plot, pages: [createCoverPage(title, theme), ...pages] };
}

export function updatePictureBookPage(page: PictureBookPage, patch: {
  caption?: string;
  imagePrompt?: string;
  narration?: string;
}): PictureBookPage {
  const caption = patch.caption === undefined ? page.caption : requiredString(patch.caption, "画面展示文字", 500);
  const imagePrompt = patch.imagePrompt === undefined
    ? page.imagePrompt : requiredString(patch.imagePrompt, "画面提示词", 2000);
  const narration = patch.narration === undefined
    ? (page.narration === page.caption && caption !== page.caption ? caption : page.narration)
    : requiredString(patch.narration, "讲解语音文稿", 1000);
  const imageChanged = imagePrompt !== page.imagePrompt;
  const audioChanged = narration !== page.narration;
  return {
    ...page,
    caption,
    imagePrompt,
    narration,
    imageUrl: imageChanged ? null : page.imageUrl,
    imageTaskId: imageChanged ? null : page.imageTaskId,
    audioUrl: audioChanged ? null : page.audioUrl,
    audioTaskId: audioChanged ? null : page.audioTaskId
  };
}

export function buildOutlinePrompt(input: {
  brief: string;
  audience: string;
  style: string;
  pageCount: number;
  characters: PictureBookCharacter[];
  messages: PictureBookMessage[];
}) {
  const dialogue = input.messages.slice(-16).map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n");
  const characters = input.characters.length
    ? input.characters.map((item) => `${item.name}：${item.description}`).join("；")
    : "无指定角色；可以根据故事自然安排角色，并保持外观一致";
  return [
    "你是儿童绘本策划师。根据需求与讨论生成可直接用于逐页绘制的完整分镜。",
    "严格输出一个 JSON 对象，不要 Markdown、代码块或说明文字。字段为 title、theme、audience、plot、pages。",
    "pages 每项只有 caption、imagePrompt、narration。caption 是孩子能读懂的简短画面文字；narration 可比 caption 更生动；imagePrompt 具体写出场景、角色外观、动作、构图、光线和画风，禁止把文字画进图内。",
    `必须恰好 ${input.pageCount} 页。每页推进情节，起承转合完整，避免重复场面。`,
    `最初需求：${input.brief}`,
    `适合人群：${input.audience || "由需求判断"}`,
    `图画风格：${input.style}`,
    `固定角色：${characters}`,
    `讨论记录：\n${dialogue || "无"}`
  ].join("\n\n");
}

export function createBlankPages(pageCount: number, title = "未命名绘本"): PictureBookPage[] {
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const caption = `第 ${index + 1} 页故事内容`;
    return {
      position: index + 1,
      caption,
      imagePrompt: `描述第 ${index + 1} 页的故事画面`,
      narration: caption,
      imageUrl: null,
      imageTaskId: null,
      audioUrl: null,
      audioTaskId: null
    };
  });
  return [createCoverPage(title, title), ...pages];
}

function createCoverPage(title: string, theme: string): PictureBookPage {
  return {
    position: 0,
    caption: title,
    imagePrompt: `绘本封面插画，主题：${theme}。突出故事主角与主要场景，留出标题空间，画面中不要生成文字。`,
    narration: title,
    imageUrl: null,
    imageTaskId: null,
    audioUrl: null,
    audioTaskId: null
  };
}

export function selectPictureBookVoice(
  requested: { voiceAssetId?: string; voice?: string },
  available: { defaultVoice: { voiceAssetId: string | null; systemVoiceId: string | null }; systemVoices: Array<{ providerVoiceId: string }> }
): { voiceAssetId: string } | { voice: string } | null {
  if (requested.voiceAssetId) return { voiceAssetId: requested.voiceAssetId };
  if (requested.voice) return { voice: requested.voice };
  if (available.defaultVoice.voiceAssetId) return { voiceAssetId: available.defaultVoice.voiceAssetId };
  const voice = available.defaultVoice.systemVoiceId ?? available.systemVoices[0]?.providerVoiceId;
  return voice ? { voice } : null;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > maxLength) throw new Error(`${label}过长`);
  return text;
}

function optionalString(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}
