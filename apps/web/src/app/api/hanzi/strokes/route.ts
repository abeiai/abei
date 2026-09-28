export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface HanziWriterGlyph {
  strokes: string[];
  medians?: unknown[];
}

interface HanziDictionaryEntry {
  character: string;
  pinyin: string[];
  radical: string;
}

interface HanziStrokeItem {
  character: string;
  pinyin: string[];
  radical: string;
  strokeCount: number;
  strokes: string[];
  medians: unknown[];
}

const hanziWriterDataBaseUrl = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1";
const makemehanziDictionaryUrl = "https://cdn.jsdelivr.net/gh/skishore/makemeahanzi@master/dictionary.txt";
const glyphCache = new Map<string, HanziWriterGlyph | null>();
let dictionaryCache: Promise<Map<string, HanziDictionaryEntry>> | null = null;

const commonMeta: Record<string, Pick<HanziDictionaryEntry, "pinyin" | "radical">> = {
  天: { pinyin: ["tiān"], radical: "大" },
  地: { pinyin: ["dì"], radical: "土" },
  人: { pinyin: ["rén"], radical: "人" },
  你: { pinyin: ["nǐ"], radical: "亻" },
  我: { pinyin: ["wǒ"], radical: "戈" },
  他: { pinyin: ["tā"], radical: "亻" },
  字: { pinyin: ["zì"], radical: "子" },
  帖: { pinyin: ["tiē"], radical: "巾" },
  好: { pinyin: ["hǎo"], radical: "女" },
  中: { pinyin: ["zhōng"], radical: "丨" },
  国: { pinyin: ["guó"], radical: "囗" },
  春: { pinyin: ["chūn"], radical: "日" },
  夏: { pinyin: ["xià"], radical: "夂" },
  秋: { pinyin: ["qiū"], radical: "禾" },
  冬: { pinyin: ["dōng"], radical: "夂" }
};

const polyphonicPinyin: Record<string, string[]> = {
  长: ["cháng", "zhǎng"],
  行: ["xíng", "háng"],
  重: ["zhòng", "chóng"],
  乐: ["lè", "yuè"],
  好: ["hǎo", "hào"],
  难: ["nán", "nàn"],
  还: ["hái", "huán"],
  地: ["dì", "de"],
  的: ["de", "dí", "dì"],
  得: ["dé", "děi", "de"],
  了: ["le", "liǎo"],
  着: ["zhe", "zháo", "zhuó"],
  都: ["dōu", "dū"],
  中: ["zhōng", "zhòng"],
  为: ["wéi", "wèi"],
  少: ["shǎo", "shào"],
  只: ["zhī", "zhǐ"],
  发: ["fā", "fà"],
  觉: ["jué", "jiào"],
  角: ["jiǎo", "jué"],
  干: ["gān", "gàn"],
  教: ["jiāo", "jiào"],
  数: ["shù", "shǔ"],
  传: ["chuán", "zhuàn"],
  空: ["kōng", "kòng"],
  降: ["jiàng", "xiáng"],
  便: ["biàn", "pián"],
  处: ["chǔ", "chù"],
  看: ["kàn", "kān"],
  当: ["dāng", "dàng"],
  会: ["huì", "kuài"],
  正: ["zhèng", "zhēng"],
  朝: ["cháo", "zhāo"],
  量: ["liàng", "liáng"],
  藏: ["cáng", "zàng"],
  种: ["zhǒng", "zhòng"],
  亲: ["qīn", "qìng"],
  省: ["shěng", "xǐng"],
  曾: ["céng", "zēng"],
  似: ["sì", "shì"],
  参: ["cān", "shēn"],
  单: ["dān", "shàn", "chán"],
  折: ["zhé", "shé"],
  露: ["lù", "lòu"]
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chars = uniqueHanziChars(url.searchParams.get("chars") ?? "").slice(0, 40);

  if (chars.length === 0) {
    return Response.json({
      code: 0,
      message: "成功",
      data: {
        items: {}
      }
    });
  }

  const entries = await Promise.all(chars.map((char) => loadHanziStrokeItem(char)));

  return Response.json({
    code: 0,
    message: "成功",
    data: {
      items: Object.fromEntries(entries.map((entry) => [entry.character, entry]))
    }
  });
}

async function loadHanziStrokeItem(char: string): Promise<HanziStrokeItem> {
  const [glyph, dictionary] = await Promise.all([loadGlyph(char), loadDictionary()]);
  const dictMeta = dictionary.get(char);
  const fallbackMeta = commonMeta[char];
  const pinyin = polyphonicPinyin[char] ?? fallbackMeta?.pinyin ?? dictMeta?.pinyin ?? [];
  const radical = fallbackMeta?.radical ?? dictMeta?.radical ?? "";
  const strokes = glyph?.strokes ?? [];

  return {
    character: char,
    pinyin,
    radical,
    strokeCount: strokes.length,
    strokes,
    medians: glyph?.medians ?? []
  };
}

async function loadGlyph(char: string) {
  if (glyphCache.has(char)) {
    return glyphCache.get(char) ?? null;
  }

  try {
    const response = await fetch(`${hanziWriterDataBaseUrl}/${encodeURIComponent(char)}.json`, {
      cache: "force-cache"
    });

    if (!response.ok) {
      glyphCache.set(char, null);
      return null;
    }

    const payload = (await response.json()) as { strokes?: unknown; medians?: unknown };
    const strokes = Array.isArray(payload.strokes)
      ? payload.strokes.filter((stroke): stroke is string => typeof stroke === "string")
      : [];
    const medians = Array.isArray(payload.medians) ? payload.medians : [];
    const glyph = strokes.length > 0 ? { strokes, medians } : null;

    glyphCache.set(char, glyph);
    return glyph;
  } catch {
    glyphCache.set(char, null);
    return null;
  }
}

function loadDictionary() {
  dictionaryCache ??= fetch(makemehanziDictionaryUrl, {
    cache: "force-cache"
  })
    .then((response) => (response.ok ? response.text() : ""))
    .then(parseDictionary)
    .catch(() => new Map<string, HanziDictionaryEntry>());

  return dictionaryCache;
}

function parseDictionary(text: string) {
  const result = new Map<string, HanziDictionaryEntry>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const character = typeof entry.character === "string" ? entry.character : "";

      if (!isHanziChar(character)) {
        continue;
      }

      result.set(character, {
        character,
        pinyin: Array.isArray(entry.pinyin)
          ? entry.pinyin.filter((item): item is string => typeof item === "string")
          : [],
        radical: typeof entry.radical === "string" ? entry.radical : ""
      });
    } catch {
      continue;
    }
  }

  return result;
}

function uniqueHanziChars(value: string) {
  return Array.from(new Set(Array.from(value).filter(isHanziChar)));
}

function isHanziChar(value: string) {
  return /^[\u3400-\u9FFF]$/u.test(value);
}
