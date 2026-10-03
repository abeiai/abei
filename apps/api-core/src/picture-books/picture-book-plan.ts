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
    return {
      position: index + 1,
      caption,
      imagePrompt,
      narration: caption,
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
  aspectRatio: string;
  theme?: string;
  plot?: string;
  pageCount: number;
  characters: PictureBookCharacter[];
  messages: PictureBookMessage[];
}) {
  const dialogue = input.messages.slice(-16).map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n");
  const characters = input.characters.length
    ? input.characters.map((item) => `${item.name}：${item.description}`).join("；")
    : "无指定角色；可以根据故事自然安排角色，并保持外观一致";
  return [
    "【角色与任务】你是资深儿童绘本编剧、分镜师与生图提示词架构师。把原始需求和沟通记录转化为适龄、情节完整、可逐页独立绘制的绘本分镜。",
    "【创作依据】依据当前参数与对话中用户最新确认的要求创作；助手提出但用户未确认的建议只作备选。保留用户指定的角色、情节与结局；缺少非关键细节时合理补全。页数、画面比例采用当前设置，适合人群未指定时由需求判断。",
    "【要素解析】先在内部明确主题、情感基调、角色外貌与性格、固定场景和关键道具。已指定的角色外貌保持原样；为反复出场的新角色确定毛色或发型、体型、服装及标志颜色。固定场景的空间关系，以及关键道具的形状、颜色、数量和归属保持连贯；新增、转移、增减或位置变化须在情节中合理衔接。",
    "【角色一致性】每个出场角色在每一页的 imagePrompt 中都必须完整复用同一段核心外貌描述，包含毛色或发型、体型特征、服装及标志颜色，禁止省略成只有名字、代词或“同前页”；即使连续出场也逐页写全。提示词开头先写本页出场角色的名称与固定外貌，再写本页动作和情绪；未出场角色不加入画面。",
    `【情节节奏】必须恰好 ${input.pageCount} 页正文，封面由系统另行创建，不计入 pages。按起承转合安排相遇或目标、发展与尝试、困难或转折、解决与情感收束；依页数合理分配，短篇也要完整。每页有一个明确叙事重点，通过动作、发现或情绪变化推进故事；相邻页有因果衔接，不重复同一场面。`,
    "【配文】caption 使用孩子能理解的简体中文，一页一至三句，篇幅与词汇符合目标年龄，有节奏感、适度留白、适合朗读，避免大段说教。画面与配文对应，画面承载可见细节，配文补充故事或情感。narration 必须与 caption 完全相同，包括标点，不扩写或改写。",
    "【逐页画面】imagePrompt 必须使用简体中文，按主体外貌与动作、情绪神态、场景环境与景深、关键道具、镜头构图与视觉焦点、光影与氛围组织一段完整描述。每页明确实际出场角色，只复用这些角色的核心外貌；用名称和特征指明人物，避免只有代词或“同上一页”。每页可独立生图，准确描述物品的归属、位置、动作方向与角色之间的关系。",
    "【镜头语言】根据叙事重点变化全景、中景、近景与特写，适当使用俯拍或低角度；通过远近、视线、前中后景和留白表现情绪与重点，避免整本都是中景平视。依据画面比例布置主体及环境，不把一页描述为多格漫画或多个时间点。",
    "【参考图画风】画风统一来自生图时提供的第一张风格参考图；imagePrompt 只描述本页内容与视觉表达，不写画风名称、绘画媒介或替换画风的指令。后续参考图用于角色外貌；参考图中的示意人物、动物及场景不自动加入故事。禁止输出英文生图提示词、模型参数或 --ar 等命令，也不要要求图内绘制配文、标题、水印或边框。",
    "【输出约定】严格输出一个有效 JSON 对象，全部文本值使用简体中文，不要 Markdown、代码块或说明文字。顶层仅有 title、theme、audience、plot、pages；title 为绘本标题，theme 一句话概括主题和情感基调，audience 为适合人群，plot 概括完整起承转合并交代主要角色、固定场景与关键道具。",
    "pages 按正文顺序排列，每项只有 caption、imagePrompt、narration；视觉要素清单和镜头信息融入 imagePrompt，不新增角色档案、场景、道具、页标题、英文提示词、序号、图片或音频地址字段。字数上限：title 100，theme 240，audience 100，plot 4000，caption 500，imagePrompt 2000；narration 与 caption 相同。",
    '{"title":"绘本标题","theme":"主题与情感基调","audience":"适合人群","plot":"完整情节与主要要素","pages":[{"caption":"本页配文","imagePrompt":"本页中文画面描述","narration":"本页配文"}]}（仅示范字段；实际 pages 必须包含全部正文页。）',
    "【输出前自检】检查页数与字段完整、情节闭合、角色外貌与场景道具连贯、镜头有变化、配文适龄且对应画面、每页提示词可独立生图、讲解文稿逐字等于配文。逐人逐页核对固定外貌是否写全，补齐遗漏的毛色、服装和颜色；道具数量与归属变化逐页核对。仅输出检查后的 JSON。",
    "【创作输入】",
    `最初需求：${input.brief}`,
    `适合人群：${input.audience || "由需求判断"}`,
    `画面比例：${input.aspectRatio}`,
    `已有主题：${input.theme || "从需求和讨论中提取"}`,
    `已有情节：${input.plot || "从需求和讨论中提取"}`,
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
