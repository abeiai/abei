import { createHash } from "node:crypto";

import sharp from "sharp";

import type {
  VoiceClassification,
  VoiceClassificationInput
} from "./voice-library-classification.js";

export const voiceAvatarVersion = "v6";

export type VoiceVisualArchetype =
  | "neutral"
  | "academic"
  | "international"
  | "playful"
  | "authoritative"
  | "gentle"
  | "broadcaster"
  | "storyteller";

export interface VoiceAvatarSpec {
  accessory: string;
  background: string;
  backgroundMotif: string;
  demographic: string;
  distinctiveFeature: string;
  eyebrowShape: string;
  eyewear: string;
  eyeShape: string;
  faceShape: string;
  facialHair: string;
  hairColor: string;
  hairStyle: string;
  lighting: string;
  mouthShape: string;
  noseShape: string;
  palette: string;
  pose: string;
  regionalAppearance: string;
  signature: string;
  expression: string;
  version: typeof voiceAvatarVersion;
  visualArchetype: VoiceVisualArchetype;
  visualIdentityKey: string;
  wardrobe: string;
}

const faceShapes = [
  "compact oval face with a narrow chin",
  "broad oval face with full cheeks",
  "soft round face with a short chin",
  "long oval face with high cheekbones",
  "angular diamond face with a pointed chin",
  "square face with a firm jaw",
  "heart-shaped face with a wide forehead",
  "pear-shaped face with a strong lower jaw",
  "slender rectangular face",
  "short rectangular face with pronounced cheekbones",
  "tapered triangular face",
  "balanced oval face with prominent cheekbones",
  "wide round face with a gentle jawline",
  "narrow diamond face",
  "high-forehead oval face",
  "low-forehead square face",
  "asymmetrical oval face with one higher cheekbone",
  "small heart-shaped face",
  "broad trapezoid face",
  "lean oblong face",
  "youthful round face with apple cheeks",
  "sculpted oval face with a defined jaw",
  "delicate triangular face",
  "strong hexagonal face"
] as const;

const eyeShapes = [
  "large almond eyes",
  "narrow almond eyes",
  "round bright eyes",
  "deep-set focused eyes",
  "slightly hooded eyes",
  "upturned cat-like eyes",
  "downturned gentle eyes",
  "wide-set oval eyes",
  "close-set sharp eyes",
  "monolid eyes with a calm gaze",
  "double-lid eyes with a lively gaze",
  "small crescent-shaped smiling eyes",
  "prominent lower eyelids",
  "long horizontal eyes",
  "short rounded eyes",
  "asymmetrical expressive eyes",
  "high-arched upper eyelids",
  "soft sleepy eyes",
  "intense narrow eyes",
  "curious wide eyes"
] as const;

const eyebrowShapes = [
  "straight fine eyebrows",
  "thick straight eyebrows",
  "high arched eyebrows",
  "soft curved eyebrows",
  "short bold eyebrows",
  "long tapered eyebrows",
  "slightly uneven expressive eyebrows",
  "low-set serious eyebrows",
  "feathered natural eyebrows",
  "sharp angled eyebrows",
  "rounded youthful eyebrows",
  "subtle thin eyebrows",
  "wide-spaced brows",
  "close-set brows",
  "one eyebrow subtly raised",
  "gently downward-sloping brows"
] as const;

const noseShapes = [
  "small button nose",
  "straight narrow nose",
  "broad rounded nose",
  "short upturned nose",
  "long refined nose",
  "slightly aquiline nose",
  "low bridge with a rounded tip",
  "high bridge with a defined tip",
  "compact triangular nose",
  "soft wide nose",
  "slender nose with a subtle curve",
  "prominent straight nose",
  "small flat nose",
  "short angular nose",
  "balanced medium-width nose"
] as const;

const mouthShapes = [
  "small bow-shaped mouth",
  "wide expressive mouth",
  "full lips with a soft cupid's bow",
  "thin precise lips",
  "slightly asymmetric smile",
  "compact neutral mouth",
  "broad friendly smile",
  "subtle closed-lip smile",
  "small open cheerful smile",
  "firm serious mouth",
  "rounded youthful lips",
  "long curved smile",
  "defined upper lip and fuller lower lip",
  "full upper lip and narrow lower lip",
  "gentle half-smile"
] as const;

const distinctiveFeatures = [
  "a tiny beauty mark below the left eye",
  "a tiny beauty mark beside the right side of the mouth",
  "light freckles across the nose",
  "a single dimple on the left cheek",
  "a single dimple on the right cheek",
  "two shallow smile dimples",
  "a subtle cleft chin",
  "a faint eyebrow notch on the left",
  "a faint eyebrow notch on the right",
  "a small pale scar through the left eyebrow",
  "a small pale scar near the right temple",
  "slightly pointed ears",
  "one ear slightly more visible than the other",
  "pronounced lower eyelashes",
  "a soft blush concentrated on the cheekbones",
  "subtle laugh lines",
  "a defined philtrum",
  "one small front tooth visible in the smile",
  "a slightly off-center hairline",
  "a distinctive widow's peak",
  "a few loose baby hairs around the forehead",
  "a small mole high on the right cheek",
  "a small mole near the left jawline",
  "a subtle under-eye crease"
] as const;

const eyewearStyles = [
  "no eyewear",
  "thin round silver glasses",
  "bold rectangular black glasses",
  "slender gold half-rim glasses",
  "small oval tortoiseshell glasses",
  "transparent square glasses",
  "navy blue round glasses",
  "red cat-eye glasses",
  "frameless rectangular glasses",
  "brown browline glasses",
  "small circular academic glasses",
  "wide translucent glasses"
] as const;

const academicEyewear = eyewearStyles.filter((value) => value !== "no eyewear");
const generalEyewear = [
  "no eyewear",
  "no eyewear",
  "no eyewear",
  "no eyewear",
  "no eyewear",
  "thin round silver glasses",
  "bold rectangular black glasses",
  "small oval tortoiseshell glasses",
  "transparent square glasses",
  "navy blue round glasses",
  "frameless rectangular glasses"
] as const;

const accessories = [
  "no accessory",
  "a single silver ear stud",
  "a single gold ear stud",
  "small jade drop earrings",
  "small pearl earrings",
  "a slim navy headband",
  "a burgundy ribbon hair tie",
  "a teal geometric hair clip",
  "a tiny yellow star hair pin",
  "a narrow patterned neck scarf",
  "a simple leather cord necklace",
  "a small enamel brooch on the collar",
  "a subtle in-ear studio monitor",
  "a pencil tucked behind one ear",
  "a silver tie pin",
  "a soft fabric bow at the collar",
  "a dark green beret",
  "a knitted mustard beanie",
  "a slim red ribbon in the hair",
  "a tiny crescent-shaped earring"
] as const;

const wardrobes = [
  "a crisp white shirt with a cobalt collar",
  "a teal cardigan over a cream shirt",
  "a charcoal blazer over a pale blue shirt",
  "a warm red hoodie with simple drawstrings",
  "a mustard knit sweater with a white collar",
  "a navy broadcaster jacket",
  "a forest-green field shirt",
  "a plum turtleneck",
  "a sky-blue denim overshirt",
  "a coral blouse with a modest collar",
  "a dark brown academic coat",
  "a light gray suit jacket",
  "a turquoise sports jacket",
  "a burgundy vest over a striped shirt",
  "a violet cardigan with a rounded neckline",
  "an orange zip jacket",
  "a black mandarin-collar shirt",
  "a pale yellow pullover",
  "a royal-blue sailor-collar top",
  "a moss-green utility jacket",
  "a rose-pink knit top",
  "a deep indigo shirt",
  "a cream cable-knit sweater",
  "a maroon suit jacket",
  "a mint-green blouse",
  "a slate-gray high-collar coat",
  "a bright cyan sweatshirt",
  "a dark teal vest",
  "a brick-red flannel shirt",
  "a lavender mock-neck sweater",
  "a camel blazer with a patterned pocket square",
  "a white teacher's blouse with navy piping"
] as const;

const formalWardrobes = wardrobes.filter((value) => /blazer|suit|shirt|coat|broadcaster|teacher/.test(value));
const playfulWardrobes = wardrobes.filter((value) => /hoodie|sweater|sports|jacket|sweatshirt|sailor/.test(value));
const gentleWardrobes = wardrobes.filter((value) => /cardigan|blouse|knit|pullover|mock-neck/.test(value));

const expressions = [
  "a calm attentive expression",
  "a confident closed-lip smile",
  "a warm encouraging smile",
  "a bright open smile",
  "a thoughtful half-smile",
  "a composed serious expression",
  "an energetic delighted expression",
  "a gentle reassuring expression",
  "a curious alert expression",
  "a witty knowing smile",
  "a dignified reserved smile",
  "a lively storytelling expression",
  "a patient teacherly expression",
  "a focused broadcaster expression",
  "a relaxed friendly expression",
  "a determined courageous expression"
] as const;

const poses = [
  "front-facing with the chin level",
  "three-quarter view facing slightly left",
  "three-quarter view facing slightly right",
  "front-facing with a subtle head tilt left",
  "front-facing with a subtle head tilt right",
  "slightly low camera angle with an upright posture",
  "slightly high camera angle with direct eye contact",
  "shoulders angled left while the face looks forward",
  "shoulders angled right while the face looks forward",
  "upright centered broadcaster posture"
] as const;

const backgrounds = [
  "vivid azure blue",
  "bright turquoise",
  "warm coral red",
  "sunny golden yellow",
  "fresh leaf green",
  "deep cobalt blue",
  "soft rose pink",
  "rich violet",
  "burnt orange",
  "mint green",
  "crimson red",
  "sky cyan",
  "plum purple",
  "lime green",
  "salmon pink",
  "indigo blue",
  "amber yellow",
  "jade green",
  "magenta",
  "powder blue",
  "terracotta",
  "seafoam green",
  "raspberry pink",
  "electric blue",
  "apricot orange",
  "orchid purple",
  "lemon yellow",
  "pine green"
] as const;

const backgroundMotifs = [
  "subtle diagonal light streaks",
  "faint radial sunburst lines",
  "small scattered geometric diamonds",
  "soft concentric circles",
  "a sparse pattern of tiny stars",
  "subtle vertical paper-like bands",
  "a few curved motion lines",
  "small rounded square accents",
  "faint classroom chalk marks without text",
  "soft sound-wave arcs without symbols",
  "a sparse confetti pattern",
  "delicate leaf silhouettes",
  "subtle halftone dots",
  "faint checkerboard geometry",
  "a restrained cloud-like abstract pattern",
  "small triangular accents",
  "a soft offset halo behind the head",
  "two broad abstract color blocks",
  "faint horizontal speed lines",
  "a few hand-painted circular brush marks"
] as const;

const palettes = [
  "blue, white, and sunflower yellow",
  "teal, coral, and cream",
  "navy, mint, and warm orange",
  "forest green, mustard, and ivory",
  "plum, rose, and pale blue",
  "cobalt, red, and soft gray",
  "burgundy, gold, and cream",
  "cyan, violet, and white",
  "jade, peach, and navy",
  "indigo, amber, and pale mint",
  "charcoal, turquoise, and coral",
  "raspberry, sky blue, and ivory"
] as const;

const lightings = [
  "clean soft frontal studio lighting",
  "warm key light from the upper left",
  "cool key light from the upper right",
  "bright even daylight-style lighting",
  "soft rim light with a balanced frontal fill",
  "warm classroom-like ambient lighting",
  "crisp broadcast-studio lighting",
  "gentle golden-hour inspired portrait lighting"
] as const;

export function avatarSpecForVoice(
  id: string,
  classification: VoiceClassification,
  role: Partial<VoiceClassificationInput> = {}
): VoiceAvatarSpec {
  const roleText = voiceRoleText(role);
  const digest = createHash("sha256")
    .update(`${voiceAvatarVersion}:${id}:${classification.language}:${classification.accent}:${classification.gender}:${classification.ageCategory}:${roleText}`)
    .digest();
  const visualGender = inferVisualGender(roleText) ?? classification.gender;
  const visualAge = classification.ageCategory;
  const visualArchetype = chooseVisualArchetype(classification, roleText, visualGender, digest[9]!);
  const regionalAppearance = regionalAppearanceFor(classification.language, classification.accent);
  const faceShape = pick(faceShapes, digest, 0);
  const eyeShape = pick(eyeShapes, digest, 2);
  const eyebrowShape = pick(eyebrowShapes, digest, 4);
  const noseShape = pick(noseShapes, digest, 6);
  const mouthShape = pick(mouthShapes, digest, 8);
  const distinctiveFeature = pick(distinctiveFeatures, digest, 10);
  const hairStyle = pick(hairStylesFor(visualGender, visualAge), digest, 12);
  const hairColor = pick(hairColorsFor(regionalAppearance, visualAge), digest, 14);
  const eyewear = visualArchetype === "academic"
    ? pick(academicEyewear, digest, 16)
    : pick(generalEyewear, digest, 16);
  const facialHair = pick(facialHairFor(visualGender, visualAge), digest, 18);
  const accessory = pick(accessories, digest, 20);
  const wardrobe = pick(wardrobesFor(visualArchetype), digest, 22);
  const expression = pick(expressionsFor(visualArchetype), digest, 24);
  const pose = pick(poses, digest, 26);
  const background = pick(backgrounds, digest, 28);
  const backgroundMotif = pick(backgroundMotifs, digest, 30);
  const palette = pick(palettes, digest, 1);
  const lighting = pick(lightings, digest, 3);
  const signature = digest.toString("hex").slice(0, 20);
  const visualIdentityKey = [
    regionalAppearance,
    faceShape,
    eyeShape,
    eyebrowShape,
    noseShape,
    mouthShape,
    distinctiveFeature,
    hairStyle,
    hairColor,
    eyewear,
    facialHair,
    accessory,
    wardrobe
  ].join("|");

  return {
    version: voiceAvatarVersion,
    signature,
    demographic: `${visualGender === "女声" ? "female" : "male"}-${ageKey(visualAge)}`,
    visualArchetype,
    regionalAppearance,
    faceShape,
    eyeShape,
    eyebrowShape,
    noseShape,
    mouthShape,
    distinctiveFeature,
    hairStyle,
    hairColor,
    eyewear,
    facialHair,
    accessory,
    wardrobe,
    expression,
    pose,
    background,
    backgroundMotif,
    palette,
    lighting,
    visualIdentityKey
  };
}

export function avatarPromptForVoice(
  spec: VoiceAvatarSpec,
  role: Partial<VoiceClassificationInput> = {}
) {
  const roleName = role.name?.trim() || role.providerVoiceId?.trim() || "unnamed voice role";
  const roleTraits = [role.trait, role.description, role.scene]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("; ") || "clear, natural, approachable voice";

  return [
    "Use case: stylized-concept",
    "Asset type: one production voice-role avatar for a web voice picker",
    "Primary request: Create one entirely new, highly recognizable character portrait with GPT-Image 2. This character must have a unique face and must not reuse a face, pose, hairstyle, or character template from another avatar.",
    `Voice role: ${roleName}. Voice character: ${roleTraits}.`,
    `Identity code: VX-${spec.signature}; use it only to preserve this prompt's unique identity and do not render the code as text.`,
    `Subject: ${spec.regionalAppearance}; ${spec.demographic}; ${spec.faceShape}; ${spec.eyeShape}; ${spec.eyebrowShape}; ${spec.noseShape}; ${spec.mouthShape}; ${spec.distinctiveFeature}.`,
    `Hair and face details: ${spec.hairColor} ${spec.hairStyle}; ${spec.eyewear}; ${spec.facialHair}; ${spec.accessory}.`,
    `Wardrobe and personality: ${spec.wardrobe}; ${spec.expression}; visual archetype ${spec.visualArchetype}.`,
    "Style/medium: polished modern 2D anime-inspired portrait illustration, crisp varied linework, nuanced cel shading, expressive eyes, refined facial anatomy, premium character-design quality, not a generic avatar kit.",
    `Composition/framing: ${spec.pose}; centered shoulder-up square portrait; full head, hairstyle, ears, neck, and upper shoulders visible; direct readable silhouette; generous margin around the hair.`,
    `Scene/backdrop: ${spec.background} background with ${spec.backgroundMotif}; the background supports the identity but is not the main source of variation.`,
    `Lighting/mood: ${spec.lighting}; color palette ${spec.palette}.`,
    "Constraints: 1:1 square; generate at 1024x1024 for later downscaling to 512x512; exactly one person; use the specified non-Black regional appearance; age and gender presentation must match the specification; every listed facial and hair feature must be visibly readable; clean professional finish.",
    "Avoid: reused or near-duplicate face; same-face syndrome; stock avatar template; extra people; cropped hair; cropped chin; black or African appearance; photorealism; 3D render; chibi proportions; exaggerated childlike head on adults. No text, letters, numbers, logo, watermark, border, frame, microphone, headphones, hand gestures, or clutter."
  ].join("\n");
}

export function voiceAvatarFilename(id: string, spec: VoiceAvatarSpec) {
  const slug = id.normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "voice";
  const idHash = createHash("sha1").update(id).digest("hex").slice(0, 10);
  return `${slug}-${idHash}-${voiceAvatarVersion}-${spec.signature}`;
}

export async function normalizeGeneratedVoiceAvatarJpeg(source: Buffer | Uint8Array) {
  return sharp(source)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .removeAlpha()
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

function chooseVisualArchetype(
  classification: VoiceClassification,
  roleText: string,
  gender: VoiceClassification["gender"],
  seed: number
): VoiceVisualArchetype {
  if (/教师|老师|讲师|教授|学者|导师|teacher|professor|scholar|academic|instructor/i.test(roleText)) return "academic";
  if (gender === "男声" && /低沉|磁性|厚重|沧桑|权威|霸道|沉稳|成熟|大叔|高管|总裁|严肃|硬朗|沙哑|深沉|deep|authoritative|mature|rugged|husky|executive|baritone/i.test(roleText)) return "authoritative";
  if (/儿童|童声|男童|女童|活泼|俏皮|元气|可爱|甜美|萌|阳光|欢脱|playful|cute|bright|cheerful|energetic/i.test(roleText)) return "playful";
  if (/新闻|播报|播音|主持|主播|纪录片|news|broadcast|anchor|documentary/i.test(roleText)) return "broadcaster";
  if (/故事|旁白|有声书|叙事|小说|story|narrat|audiobook/i.test(roleText)) return "storyteller";
  if (gender === "女声" && /温柔|知性|优雅|甜美|柔和|亲切|客服|闺蜜|御姐|gentle|warm|elegant|soft|sweet/i.test(roleText)) return "gentle";
  if (isWesternLanguage(classification.language) && seed % 5 !== 0) return "international";
  return "neutral";
}

function regionalAppearanceFor(language: string, accent: string) {
  const text = `${language} ${accent}`;
  if (/中文|粤语|闽南|东北|四川|台湾|日语|韩语/.test(text)) return "non-Black East Asian appearance with a light-to-medium skin tone";
  if (/泰语|越南语|印尼语|马来语/.test(text)) return "non-Black Southeast Asian appearance with a light-to-medium skin tone";
  if (/印地语|孟加拉语|泰米尔语/.test(text)) return "non-Black South Asian appearance with a light-to-medium skin tone";
  if (/阿拉伯语|土耳其语|波斯语/.test(text)) return "non-Black Middle Eastern appearance with a light-to-medium skin tone";
  if (/西班牙语|葡萄牙语|意大利语|希腊语/.test(text)) return "non-Black Southern European appearance with a light-to-medium skin tone";
  if (/英语|法语|德语|俄语|荷兰语|波兰语|罗马尼亚语|芬兰语|乌克兰语/.test(text)) return "non-Black European appearance with a light-to-medium skin tone";
  return "non-Black East Asian appearance with a light-to-medium skin tone";
}

function hairStylesFor(gender: VoiceClassification["gender"], age: VoiceClassification["ageCategory"]) {
  if (gender === "女声" && age === "儿童") return [
    "short twin pigtails with blunt bangs",
    "two long braids with loose wisps",
    "a high side ponytail with swept bangs",
    "two compact space buns",
    "a single thick side braid",
    "a bob cut with one tiny braided strand",
    "a half-up ponytail with curled ends",
    "a crown braid with short bangs",
    "low twin ponytails with center-parted bangs",
    "one high bun with a small side braid"
  ] as const;
  if (gender === "男声" && age === "儿童") return [
    "messy spiky crop",
    "soft bowl cut with uneven bangs",
    "short curly mop",
    "side-swept schoolboy cut",
    "tiny undercut with a long front tuft",
    "rounded short crop with a cowlick",
    "neat center-parted short hair",
    "shaggy layered short hair",
    "short wavy hair with one raised forelock",
    "compact crew cut with a zigzag hairline"
  ] as const;
  if (gender === "女声" && age === "老年") return [
    "a high silver bun with loose temple curls",
    "a short layered silver bob",
    "a low braided gray bun",
    "a neat white pixie cut",
    "shoulder-length silver waves",
    "a rolled vintage gray updo",
    "a soft white crown braid",
    "a short curly gray bob",
    "a low silver chignon",
    "a swept-back white bun with a side part"
  ] as const;
  if (gender === "男声" && age === "老年") return [
    "swept-back silver hair with a high hairline",
    "short white hair with a distinct side part",
    "a balding crown with tidy silver side hair",
    "wavy gray hair brushed back",
    "a close-cropped white crew cut",
    "long silver hair tied in a low knot",
    "a thin gray comb-over",
    "fluffy white hair with a widow's peak",
    "short salt-and-pepper curls",
    "a clean shaved head with silver temple stubble"
  ] as const;
  if (gender === "女声") return [
    "a sharp chin-length bob with side bangs",
    "long loose waves with a center part",
    "a high braided ponytail",
    "a sleek low bun with two face-framing strands",
    "a short asymmetrical pixie cut",
    "shoulder-length curls with curtain bangs",
    "a thick single side braid",
    "a half-up top knot with flowing hair",
    "a blunt pageboy bob",
    "two low braids with a clean center part",
    "a voluminous wavy lob",
    "a sculpted high bun",
    "a layered wolf cut",
    "a side ponytail with curled ends",
    "a braided crown over a short bob",
    "a sleek waist-length ponytail",
    "a feathered shoulder-length cut",
    "a short curly crop",
    "a low twisted chignon",
    "a straight long cut with micro-bangs"
  ] as const;
  return [
    "a neat side-parted crop",
    "a textured spiky quiff",
    "a close buzz cut with a sharp hairline",
    "a wavy medium-length curtain cut",
    "a brushed-back undercut",
    "a loose curly top with short sides",
    "a long low ponytail",
    "a compact crew cut",
    "a shaggy layered mop",
    "a shaved head with a distinct widow's peak shadow",
    "a pompadour with tapered sides",
    "a short Caesar cut",
    "a swept fringe over one eyebrow",
    "a center-parted chin-length cut",
    "a high fade with a curly forelock",
    "a slick side part with one loose strand",
    "a short angular crop",
    "shoulder-length straight hair tied half-up",
    "a rounded natural wave cut",
    "a tousled surfer-style medium cut"
  ] as const;
}

function hairColorsFor(regionalAppearance: string, age: VoiceClassification["ageCategory"]) {
  if (age === "老年") return [
    "pure white",
    "silver gray",
    "salt-and-pepper",
    "steel gray",
    "warm gray",
    "white with charcoal streaks"
  ] as const;
  if (/European/.test(regionalAppearance)) return [
    "ash blonde",
    "golden blonde",
    "copper red",
    "auburn",
    "chestnut brown",
    "dark brown",
    "strawberry blonde",
    "blue-black"
  ] as const;
  return [
    "blue-black",
    "soft black",
    "dark chestnut brown",
    "warm brown",
    "deep auburn",
    "espresso brown"
  ] as const;
}

function facialHairFor(gender: VoiceClassification["gender"], age: VoiceClassification["ageCategory"]) {
  if (gender === "女声" || age === "儿童") return ["clean-shaven"] as const;
  if (age === "青年") return [
    "clean-shaven",
    "light jaw stubble",
    "a narrow mustache",
    "a short pointed goatee",
    "a neatly trimmed chin beard"
  ] as const;
  return [
    "clean-shaven",
    "clean-shaven",
    "a full neatly trimmed beard",
    "a strong salt-and-pepper mustache",
    "a short boxed beard",
    "a thin mustache and small goatee",
    "heavy jaw stubble",
    "a long tapered chin beard",
    "a broad walrus mustache",
    "a close-cropped circle beard"
  ] as const;
}

function wardrobesFor(archetype: VoiceVisualArchetype) {
  if (["academic", "authoritative", "broadcaster"].includes(archetype)) return formalWardrobes;
  if (archetype === "playful") return playfulWardrobes;
  if (archetype === "gentle") return gentleWardrobes;
  return wardrobes;
}

function expressionsFor(archetype: VoiceVisualArchetype) {
  if (archetype === "academic") return expressions.filter((value) => /teacher|attentive|encouraging|thoughtful|patient/.test(value));
  if (archetype === "authoritative") return expressions.filter((value) => /confident|serious|dignified|determined/.test(value));
  if (archetype === "broadcaster") return expressions.filter((value) => /focused|composed|confident/.test(value));
  if (archetype === "storyteller") return expressions.filter((value) => /storytelling|witty|curious|warm/.test(value));
  if (archetype === "playful") return expressions.filter((value) => /bright|energetic|curious|delighted|lively/.test(value));
  if (archetype === "gentle") return expressions.filter((value) => /warm|gentle|reassuring|friendly/.test(value));
  return expressions;
}

function pick<T>(values: readonly T[], digest: Buffer, offset: number): T {
  const first = digest[offset % digest.length]!;
  const second = digest[(offset + 1) % digest.length]!;
  return values[((first << 8) | second) % values.length]!;
}

function voiceRoleText(role: Partial<VoiceClassificationInput>) {
  return [
    role.providerVoiceId,
    role.name,
    role.language,
    ...(role.languages ?? []),
    role.accent,
    role.gender,
    role.age,
    role.ageCategory,
    role.description,
    role.trait,
    role.scene,
    ...(role.metadataTags ?? []),
    ...Object.values(role.providerLabels ?? {})
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ").toLowerCase();
}

function inferVisualGender(roleText: string): VoiceClassification["gender"] | null {
  if (/女(?:\s|$)|女童|女孩|少女|女性|女人|女声|女士|姐姐|妹妹|奶奶|御姐|闺蜜|\bfemale\b|\bwoman\b|\bgirl\b/.test(roleText)) return "女声";
  if (/男(?:\s|$)|男童|男孩|男性|男人|男声|男士|哥哥|弟弟|爷爷|大叔|少爷|\bmale\b|\bman\b|\bboy\b/.test(roleText)) return "男声";
  return null;
}

function isWesternLanguage(language: string) {
  return new Set([
    "英语", "西班牙语", "葡萄牙语", "法语", "德语", "俄语", "意大利语",
    "土耳其语", "乌克兰语", "荷兰语", "波兰语", "罗马尼亚语", "希腊语", "芬兰语"
  ]).has(language);
}

function ageKey(age: VoiceClassification["ageCategory"]) {
  if (age === "儿童") return "child";
  if (age === "青年") return "young";
  if (age === "中年") return "middle";
  return "old";
}
