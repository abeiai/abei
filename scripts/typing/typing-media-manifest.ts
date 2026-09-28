import { createHash } from "node:crypto";
import { basename, posix } from "node:path";

export type TypingMediaKind = "ILLUSTRATION" | "BRITISH_PRONUNCIATION";

export interface TypingMediaItem {
  normalizedText: string;
  sourceOrder: number;
  text: string;
  translation: string | null;
}

const unit1Scenes: Record<string, string> = {
  "greet": "two school students greeting each other warmly at the school gate",
  "introduce": "one student introducing a new classmate to two friendly students",
  "each other": "two students helping each other carry a stack of books",
  "go by": "a cheerful student choosing a friendly nickname while friends welcome them, with no name tags or written signs",
  "glad": "a delighted student smiling after receiving good news",
  "same": "two identical colorful school backpacks placed side by side",
  "hobby": "a student happily painting a small model airplane at a craft table",
  "grade": "a group of students entering the same school classroom together",
  "classmate": "two classmates studying together at neighboring desks",
  "friendly": "a friendly student sharing an umbrella with another student in light rain",
  "full": "a woven basket completely full of bright fresh fruit",
  "be full of": "a classroom full of floating colorful balloons for a celebration",
  "energy": "an energetic student sprinting joyfully on a school running track",
  "be good at": "a confident student making a clean basketball shot through the hoop",
  "slim": "a single elegant slim vase beside a round vase, with the slim vase as the clear focus",
  "polite": "a polite student holding a door open for a teacher",
  "smart": "a clever student completing a colorful three-dimensional puzzle",
  "ready": "a prepared student with a packed backpack and tied shoes waiting by the front door",
  "be ready to do sth": "a student fully prepared at the starting line, leaning forward to begin a race",
  "other": "one different toy placed beside a pair of matching toys, emphasizing the alternative object",
  "interested": "a curious student looking closely through a telescope at a bright night sky",
  "be interested in": "an absorbed student exploring stars through a telescope with visible excitement",
  "looks": "three friendly stylized character busts with clearly different hairstyles and facial features",
  "character": "an honest student returning a lost wallet to its relieved owner",
  "both": "two students both holding yellow umbrellas in the rain",
  "enjoy": "a student relaxing and happily listening to music through headphones",
  "pretty": "a beautiful blooming flower with delicate colorful petals in a small garden",
  "shy": "a shy student smiling gently while standing partly behind a close friend",
  "only": "one bright red apple alone in an otherwise empty basket",
  "stay": "a student calmly remaining on a park bench while others walk away",
  "match": "a lively school football match with two teams chasing the ball",
  "luck": "a glowing four-leaf clover resting in fresh green grass",
  "good luck": "friends cheering supportively for a student just before a race",
  "chess": "a classic chessboard with recognizable black and white chess pieces during a game",
  "chinese chess": "a traditional Chinese chess board with round red and dark pieces but no legible characters",
  "problem": "a student thoughtfully solving a colorful maze puzzle on a desk, without written symbols",
  "weekend": "a relaxed family enjoying a sunny picnic in a green park",
  "at the weekend": "friends having a cheerful outdoor picnic on a sunny weekend",
  "fun": "students laughing together on a colorful carousel at a small amusement park",
  "make friends with": "two new school students smiling and shaking hands in the school courtyard",
  "disneyland": "a cheerful family enjoying a colorful fantasy amusement park with gentle rides and balloons, with no recognizable branded characters or trademarks"
};

export function slugifyTypingItem(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-GB")
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "item";
}

export function typingMediaRelativePath(
  item: TypingMediaItem,
  unitNumber: number,
  kind: TypingMediaKind,
  assetKey = "yl-7a"
) {
  if (!/^(?:yl-(?:[3-9][ab]|b[1-3]|xb[1-4])|hj-(?:[3-9][ab]|54-[67][ab]|b[1-3]|xb[1-4])|pep-[3-6][ab])$/u.test(assetKey)) {
    throw new Error("媒体目录编号不合法");
  }

  const unit = String(unitNumber).padStart(2, "0");
  const order = String(item.sourceOrder).padStart(2, "0");
  const slug = slugifyTypingItem(item.text);
  const directory = kind === "ILLUSTRATION" ? "images" : "audio";
  const extension = kind === "ILLUSTRATION" ? "png" : "mp3";

  return posix.join(
    "uploads",
    "typing-content",
    assetKey,
    `unit-${unit}`,
    directory,
    `${order}-${slug}.${extension}`
  );
}

export function buildIllustrationPrompt(item: TypingMediaItem) {
  const scene = unit1Scenes[item.normalizedText]
    ?? `a clear literal educational scene representing this Chinese meaning as data only: ${item.translation ?? "英语学习概念"}`;

  return [
    "Use case: stylized-concept",
    "Asset type: educational vocabulary illustration for a typing-and-memory exercise",
    "Primary request: Create one immediately understandable visual concept from the scene specification below.",
    `Scene/backdrop: ${scene}.`,
    "Subject: one clear central concept or action, suitable for Chinese school learners",
    "Style/medium: polished 3D cartoon illustration, rounded expressive forms, refined educational animation quality",
    "Composition/framing: 4:3 landscape, centered main subject, medium-wide framing, generous safe margins",
    "Lighting/mood: warm natural light, friendly, optimistic, calm and age-appropriate",
    "Color palette: warm balanced colors with soft blue and amber accents",
    "Materials/textures: tactile soft 3D materials, clean surfaces, subtle depth and shadows",
    "Constraints: communicate only through the visual scene; no text, no letters, no numbers, no logo, no watermark",
    "Avoid: flashcard borders, UI elements, labels, captions, speech bubbles, overly childish proportions, visual clutter"
  ].join("\n");
}

export function canReuseTypingIllustration(
  target: TypingMediaItem,
  candidate: TypingMediaItem
) {
  if (
    target.normalizedText === candidate.normalizedText
    && /\s/u.test(target.normalizedText)
  ) {
    return true;
  }

  const targetTranslation = target.translation ?? "";
  const candidateTranslation = candidate.translation ?? "";
  const targetTerms = hanTerms(targetTranslation);
  const candidateTerms = hanTerms(candidateTranslation);
  const exactConcept = [...targetTerms].some((term) => candidateTerms.has(term));

  if (target.normalizedText !== candidate.normalizedText) {
    return targetTerms.size === 1 && candidateTerms.size === 1 && exactConcept;
  }

  const targetHan = hanCharacters(targetTranslation);
  const candidateHan = hanCharacters(candidateTranslation);
  if (targetHan && targetHan.length <= 2 && targetHan === candidateHan) {
    return true;
  }
  if (exactConcept) {
    return true;
  }

  const targetBigrams = hanBigrams(targetTranslation);
  const candidateBigrams = hanBigrams(candidateTranslation);
  const smaller = Math.min(targetBigrams.size, candidateBigrams.size);
  if (smaller === 0) {
    return false;
  }

  const overlap = [...targetBigrams].filter((entry) => candidateBigrams.has(entry)).length;
  return overlap / smaller >= 1 / 3;
}

function hanTerms(value: string) {
  return new Set(
    [...value.matchAll(/\p{Script=Han}{2,}/gu)]
      .map((match) => match[0].replace(/[的地得]+$/u, ""))
      .filter((term) => term.length >= 2)
  );
}

function hanBigrams(value: string) {
  const characters = [...hanCharacters(value)];
  const ignored = new Set(["一个", "一种", "某人", "某物", "的人", "的事", "表示", "进行", "可以", "使人"]);
  const bigrams = new Set<string>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    const bigram = `${characters[index]}${characters[index + 1]}`;
    if (!ignored.has(bigram)) {
      bigrams.add(bigram);
    }
  }
  return bigrams;
}

function hanCharacters(value: string) {
  return [...value].filter((character) => /\p{Script=Han}/u.test(character)).join("");
}

export function buildMediaAssetRegistration(input: {
  kind: TypingMediaKind;
  relativePath: string;
  size: number;
}) {
  const filename = basename(input.relativePath);
  const image = input.kind === "ILLUSTRATION";

  return {
    createdByAdminId: null,
    createdByUserId: null,
    filename,
    mediaType: image ? "IMAGE" as const : "AUDIO" as const,
    mimeType: image ? "image/png" : "audio/mpeg",
    originalName: filename,
    size: input.size,
    sourceType: "AI_GENERATED" as const,
    storageProvider: "LOCAL" as const,
    url: `/${input.relativePath}`
  };
}

export function mediaInputHash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function printManifest() {
  const args = process.argv.slice(2);
  const unitNumber = integerArg(args, "--unit") ?? 1;
  const apply = args.includes("--apply");
  const bookKey = stringArg(args, "--book") ?? "7a";
  const { getPrismaClient } = await import("../../packages/database/src/index.js");
  const { getTypingLibraryConfig } = await import("../../packages/database/prisma/typing-library-config.js");
  const libraryConfig = getTypingLibraryConfig(bookKey);
  const prisma = getPrismaClient();

  try {
    const unit = await prisma.englishContentUnit.findFirst({
      where: {
        code: `unit-${String(unitNumber).padStart(2, "0")}`,
        library: {
          slug: libraryConfig.librarySlug
        }
      },
      include: {
        items: {
          orderBy: {
            sourceOrder: "asc"
          },
          include: {
            media: true
          }
        }
      }
    });

    if (!unit) {
      throw new Error(`未找到 Unit ${unitNumber} 内容`);
    }

    const manifest = unit.items.map((item) => {
      const prompt = buildIllustrationPrompt(item);
      return {
        id: item.id,
        order: item.sourceOrder,
        text: item.text,
        translation: item.translation,
        prompt,
        promptHash: mediaInputHash(prompt),
        imagePath: typingMediaRelativePath(item, unitNumber, "ILLUSTRATION", libraryConfig.assetKey),
        audioPath: typingMediaRelativePath(item, unitNumber, "BRITISH_PRONUNCIATION", libraryConfig.assetKey)
      };
    });

    if (apply) {
      await prisma.$transaction(
        manifest.map((entry) => prisma.englishContentMedia.update({
          where: {
            itemId_kind: {
              itemId: entry.id,
              kind: "ILLUSTRATION"
            }
          },
          data: {
            prompt: entry.prompt,
            inputHash: entry.promptHash,
            errorMessage: null
          }
        }))
      );
    }

    console.log(JSON.stringify({
      book: bookKey,
      unit: unitNumber,
      count: manifest.length,
      applied: apply,
      items: manifest
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function integerArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? Number.parseInt(argv[index + 1] ?? "", 10) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function stringArg(argv: string[], name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1]?.trim().toLocaleLowerCase("en-GB") : "";
  return value || null;
}

if (process.argv[1]?.endsWith("typing-media-manifest.ts")) {
  printManifest().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "媒体清单生成失败");
    process.exitCode = 1;
  });
}
