import { pictureBookPageAspectRatio } from "./picture-book-ratio.js";
import { normalizePictureBookAudience, pictureBookAudienceGuide, pictureBookHealthyContentRules } from "./picture-book-audience.js";

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
  referenceName?: string;
  legacyImageUrl?: string;
  legacyStyle?: string;
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

export function preservesPictureBookOriginalText(brief: string, messages: PictureBookMessage[]): boolean {
  let preserve = false;
  const choice = /(?<cancel>(?:不用|不必|不要|无需|不需要|不再|取消)(?:保持|保留)原(?:文|诗)|(?:允许|可以|请)(?:改写|改编)原文|(?:改写|改编)(?:成|为)口语)|(?<preserve>(?:保持|保留)原(?:文|诗)|原(?:文|诗)不变|原文诵读|一字不改|逐字保留|不要(?:改写|改动|修改)原(?:文|诗))/g;
  for (const text of [brief, ...messages.filter(item => item.role === "user").map(item => item.content)]) {
    const source = suppliedPictureBookOriginalText([text]);
    const requirements = source ? text.replace(source, "") : text;
    for (const match of requirements.matchAll(choice)) preserve = Boolean(match.groups?.preserve);
  }
  return preserve;
}

function suppliedPictureBookOriginalText(sourceInputs: string[]): string | undefined {
  return sourceInputs.map(text => text.match(/(?:【原文】\s*|(?:^|\n)原文[：:]\s*)([\s\S]*?)(?=\n(?:【(?:创作要求|制作要求|要求)】|(?:创作要求|制作要求|要求)[：:])|$)/)?.[1]?.trim()).filter((text): text is string => Boolean(text)).at(-1)?.replace(/^```\w*\s*/, "").replace(/\s*```$/, "");
}

export function storyTaskText(chunks: string[], storedOutput: string | null, requireComplete: boolean): string {
  const streamed = chunks.join("").trim();
  return streamed || (requireComplete ? "" : storedOutput?.trim() ?? "");
}

export function normalizeOutline(output: string, pageCount: number, selectedAudience?: string, preserveOriginalText = false, sourceInputs: string[] = []): PictureBookOutline {
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
  const audience = selectedAudience === undefined ? requiredString(value.audience, "适合人群", 100) : normalizePictureBookAudience(selectedAudience);
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
  if (preserveOriginalText) {
    const suppliedText = suppliedPictureBookOriginalText(sourceInputs);
    const originalText = suppliedText ?? requiredString(value.originalText, "原文", pageCount * 500);
    const compact = (text: string) => text.replace(/\s/g, "");
    if (compact(pages.map(page => page.caption).join("")) !== compact(originalText)) throw new Error(suppliedText ? "分镜配文未完整保留原文，与用户提供的原文不一致，请重新生成" : "分镜配文未完整保留原文，请重新生成");
  }
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
  isSpread?: boolean;
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
  const preserveOriginalText = preservesPictureBookOriginalText(input.brief, input.messages);
  const suppliedOriginalText = suppliedPictureBookOriginalText([input.brief, ...input.messages.filter(item => item.role === "user").map(item => item.content)]);
  return [
    "【角色与任务】你是资深儿童绘本编剧、分镜师与生图提示词架构师。把原始需求和沟通记录转化为适龄、情节完整、可逐页独立绘制的绘本分镜。",
    "【创作依据】依据当前参数与对话中用户最新确认的要求创作；助手提出但用户未确认的建议只作备选。在适龄与健康要求内保留用户指定的角色、情节与结局；缺少非关键细节时合理补全。页数、画面比例和适合人群采用当前设置。",
    pictureBookAudienceGuide(input.audience, preserveOriginalText),
    pictureBookHealthyContentRules,
    "【要素解析】先在内部明确主题、情感基调、角色外貌与性格、固定场景和关键道具。已指定的角色外貌保持原样；为反复出场的新角色确定毛色或发型、体型、服装及标志颜色。固定场景的空间关系，以及关键道具的形状、颜色、数量和归属保持连贯；新增、转移、增减或位置变化须在情节中合理衔接。",
    "【角色一致性】每个出场角色在每一页的 imagePrompt 中都必须完整复用同一段核心外貌描述，包含毛色或发型、体型特征、服装及标志颜色，禁止省略成只有名字、代词或“同前页”；即使连续出场也逐页写全。提示词开头先写本页出场角色的名称与固定外貌，再写本页动作和情绪；未出场角色不加入画面。",
    `【情节节奏】必须恰好 ${input.pageCount} 页正文，封面由系统另行创建，不计入 pages。按起承转合安排相遇或目标、发展与尝试、困难或转折、解决与情感收束；依页数合理分配，短篇也要完整。婴幼儿优先遵循适龄要求，用简单感知、重复动作和安全收束组织节奏，不强行制造危机。每页有一个明确叙事重点，通过动作、发现或情绪变化推进故事；相邻页有因果衔接，不重复同一场面。`,
    preserveOriginalText ? "【原文配文】caption 按原文顺序分页，原样复制字词、标点和语言，不改写、不遗漏、不补写解释或过渡句。narration 必须与 caption 完全相同，包括标点。仅为分页排版调整空白，不能因年龄、诗词难度、句长或情节结构修改正文；分镜与画面围绕原文组织，不给原文补造情节。封面题名沿用原作题名或用户指定标题。" : "【配文】caption 使用目标人群能理解的简体中文，句数、篇幅与词汇遵循适龄创作要求，有节奏感、适度留白、适合朗读，避免大段说教。画面与配文对应，画面承载可见细节，配文补充故事或情感。narration 必须与 caption 完全相同，包括标点，不扩写或改写。",
    "【逐页画面】imagePrompt 必须使用简体中文，按主体外貌与动作、情绪神态、场景环境与景深、关键道具、镜头构图与视觉焦点、光影与氛围组织一段完整描述。每页明确实际出场角色，只复用这些角色的核心外貌；用名称和特征指明人物，避免只有代词或“同上一页”。每页可独立生图，准确描述物品的归属、位置、动作方向与角色之间的关系。",
    "【镜头语言】根据叙事重点变化全景、中景、近景与特写，适当使用俯拍或低角度；通过远近、视线、前中后景和留白表现情绪与重点，避免整本都是中景平视。依据画面比例布置主体及环境，不把一页描述为多格漫画或多个时间点。",
    "【参考图画风】画风统一来自生图时提供的第一张风格参考图；imagePrompt 只描述本页内容与视觉表达，不写画风名称、绘画媒介或替换画风的指令。后续参考图用于角色外貌；参考图中的示意人物、动物及场景不自动加入故事。禁止输出英文生图提示词、模型参数或 --ar 等命令，也不要要求图内绘制配文、标题、水印或边框。",
    `【输出约定】严格输出一个有效 JSON 对象，${preserveOriginalText ? `原文文稿保持原来的语言，其他文本值使用简体中文；${suppliedOriginalText ? "用户已提供完整原文，只将其逐字分配到全部正文页，不要另行重复输出原文。" : "顶层另加 originalText，逐字复制完整原文正文，包含所有将被分页的文字，不截取片段、不换词，不包含用户的制作指令。"}` : "全部文本值使用简体中文。"}不要 Markdown、代码块或说明文字。顶层有 title、theme、audience、plot、pages；title 为绘本标题，theme 一句话概括主题和情感基调，audience 为适合人群，plot 概括内容并交代主要角色、固定场景与关键道具。`,
    "pages 按正文顺序排列，每项只有 caption、imagePrompt、narration；视觉要素清单和镜头信息融入 imagePrompt，不新增角色档案、场景、道具、页标题、英文提示词、序号、图片或音频地址字段。字数上限：title 100，theme 240，audience 100，plot 4000，caption 500，imagePrompt 2000；narration 与 caption 相同。",
    '{"title":"绘本标题","theme":"主题与情感基调","audience":"适合人群","plot":"完整情节与主要要素","pages":[{"caption":"本页配文","imagePrompt":"本页中文画面描述","narration":"本页配文"}]}（仅示范字段；实际 pages 必须包含全部正文页。）',
    "【输出前自检】检查页数与字段完整、情节闭合、角色外貌与场景道具连贯、镜头有变化、配文适龄且对应画面、每页提示词可独立生图、讲解文稿逐字等于配文。逐人逐页核对固定外貌是否写全，补齐遗漏的毛色、服装和颜色；道具数量与归属变化逐页核对。仅输出检查后的 JSON。",
    "【创作输入】",
    `最初需求：${input.brief}`,
    `适合人群：${normalizePictureBookAudience(input.audience)}`,
    `单页及封面比例：${input.aspectRatio}` ,
    input.isSpread ? `【跨页构图】每条正文分镜对应一张横向跨越左右两页的连续插画，正文画面比例：${pictureBookPageAspectRatio(input.aspectRatio, true)}；宽度为单页两倍、高度不变，左右自然衔接，不分格。中央装订线附近不放角色面部或关键道具。封面保持单页比例。` : `画面比例：${input.aspectRatio}`,
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

export function buildCoverImagePrompt(title: string, theme: string): string {
  return [
    `设计一本具有出版品质和鲜明设计感的儿童绘本正面封面，主题：${theme}。`,
    `【标题文字】封面必须清晰呈现当前绘本标题「${title}」，逐字准确，不遗漏、不增字、不出现错字或乱码；补充描述中的旧标题以此处标题为准。`,
    "【标题排版】使用清楚易读且富有童趣的设计字形，结合故事气质安排大小层次、字距和合理分行；标题置于上部或构图留白区，与主角形成明确的视觉主次，文字与背景有足够对比，不遮挡角色面部。",
    "【封面构图】以故事主角和最具辨识度的场景或道具为视觉中心，用有吸引力的动作、表情和前中后景营造故事感；巧妙安排呼应主题的装饰元素，引导视线从标题到主角，构图完整、疏密有致。",
    "【整体设计】标题与插画协调融合，配色统一、有明暗与色彩层次，保持适度留白；根据目标画面比例布局，标题和主体距离画面边缘至少5%，缩略图中也能辨识标题和主角。",
    "只生成完整的平面封面设计稿，不展示书脊、背面或立体书本样机；除绘本标题外不添加配文、作者署名、无关文字、标志或水印。画风沿用第1张风格参考图，角色外貌沿用对应参考图。"
  ].join("\n");
}

function createCoverPage(title: string, theme: string): PictureBookPage {
  return {
    position: 0,
    caption: title,
    imagePrompt: buildCoverImagePrompt(title, theme),
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
