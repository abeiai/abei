import { clippedAudio } from "./clipped-audio";
import { speechstarVideo } from "./speechstar-video";
import { studioMedia } from "./studio-media";

export type Mouth = "open" | "wide" | "relaxed" | "round" | "closed" | "teeth" | "dental" | "alveolar" | "back";
export type Phoneme = {
  id: string; symbol: string; name: string; mouth: Mouth; tip: string; mistake: string;
  animationVideo?: string; generatedImage?: boolean; animation?: string; mouthImages?: string[]; audioSymbol?: string; audioNote?: string; maleAudio?: string; femaleAudio?: string; example2?: { word: string; audio: string }; example?: { word: string; audio: string }; video?: string;
};

// 图片的八行顺序；重复的清/浊辅音行以发音方式区分。
export const groups = [
  { id: "long", family: "元音", label: "长元音", detail: "5 个", symbols: ["ɑː", "ɔː", "ɜː", "iː", "uː"] },
  { id: "short", family: "元音", label: "短元音", detail: "7 个", symbols: ["ʌ", "ɒ", "ə", "ɪ", "ʊ", "e", "æ"] },
  { id: "double", family: "元音", label: "双元音", detail: "8 个", symbols: ["aɪ", "ɔɪ", "eɪ", "aʊ", "əʊ", "ɪə", "eə", "ʊə"] },
  { id: "voiced", family: "辅音", label: "浊辅音", detail: "爆破、摩擦与近音", symbols: ["b", "d", "ɡ", "v", "ð", "z", "ʒ", "r"] },
  { id: "unvoiced", family: "辅音", label: "清辅音", detail: "爆破与摩擦", symbols: ["p", "t", "k", "f", "θ", "s", "ʃ", "h"] },
  { id: "voiced-pair", family: "辅音", label: "浊辅音", detail: "破擦与组合", symbols: ["dʒ", "dz", "dr"] },
  { id: "unvoiced-pair", family: "辅音", label: "清辅音", detail: "破擦与组合", symbols: ["tʃ", "ts", "tr"] },
  { id: "sonorant", family: "辅音", label: "浊辅音", detail: "半元音、鼻音与舌边音", symbols: ["j", "w", "m", "n", "ŋ", "l"] }
] as const;

// 原创中文教学说明；采用传统英式教学音标。每行：符号|名称|口型|要领|易错提示。
const descriptions = `ɑː|低后长元音|open|下颌放低，舌身向后、舌尖保持低位，张口持续发声。|不要把后部的长音读成短促的 /ʌ/；英式 car 的词尾不另加 r。
ɔː|半低后长元音|round|双唇收圆，舌后部略抬，保持同一口型延长声音。|不要滑成 /əʊ/，也不要把嘴张得像 /ɒ/ 一样大。
ɜː|中央长元音|relaxed|嘴唇自然展开，舌身停在口腔中央，平稳延长发声。|传统英式 bird 不卷舌；不要先发“饿”再加儿化音。
iː|高前长元音|wide|嘴角展开，舌前部靠近硬腭但不接触，让声音稳定延续。|和 /ɪ/ 的区别还在舌位和紧张程度，不能只把 /ɪ/ 拉长。
uː|高后长元音|round|双唇收拢，舌后部抬高，保持气流通畅并延长声音。|单独发音时不要添加 /j/；与 /ʊ/ 相比口型更集中。
ʌ|中央短元音|open|嘴唇不收圆，下颌适度下降，在口腔中央短促发声。|不要拖成长音 /ɑː/，也不要把重读音节弱化成 /ə/。
ɒ|低后短元音|round|张口并略微圆唇，舌后部放低，短促发声后收住。|采用英式 hot 的读法；不要混入美式 /ɑː/ 或拖成 /ɔː/。
ə|中央弱元音|relaxed|下颌、嘴唇和舌身放松，以很小的力度轻轻带过。|常用于非重读音节；不要每次都发成重读的 /ɜː/。
ɪ|次高前短元音|relaxed|双唇略展而放松，舌前部抬起但低于 /iː/，快速发声。|不要绷紧嘴角读成 /iː/；ship 与 sheep 的元音不同。
ʊ|次高后短元音|round|嘴唇略圆、不过分突出，舌后部抬起后短促发声。|保持放松，不要把 book 的元音读成 food 中的 /uː/。
e|半高前短元音|wide|嘴唇自然展开，舌尖靠近下齿，舌前部抬到中间高度。|张口幅度比 /æ/ 小；不要向 /ɪ/ 滑动成 /eɪ/。
æ|次低前短元音|open|下颌放低、嘴角展开，舌尖保持在下齿附近，舌前部较低。|声音在口腔前部形成，不要后移成 /ɑː/；也不要缩口成 /e/。
aɪ|开口到前部的双元音|open|先充分张口发起始音，再抬高舌前部、缩小开口滑向 /ɪ/。|整段只占一个音节，前段清楚，后段轻短，不要停顿。
ɔɪ|圆唇到展唇的双元音|round|从后部圆唇音开始，逐渐展开嘴角，舌前部抬高滑向 /ɪ/。|不要省掉起始圆唇动作，也不要在结尾加入 /j/。
eɪ|前部合口双元音|wide|从 /e/ 的舌位开始，下颌逐渐上收，滑向更高的 /ɪ/。|不要用单一 /e/ 替代整个滑动音，也不要拆成两个音节。
aʊ|开口到圆唇的双元音|open|张口发出起始音，随后抬高舌后部，嘴唇逐渐收圆。|起点不能过小；结尾轻收，不额外加一个 /w/。
əʊ|中央到圆唇的双元音|relaxed|以中央放松口型开始，舌后部抬起，双唇逐渐收拢。|这里采用英式 /əʊ/；不要始终保持一个圆唇长音。
ɪə|前部到中央的双元音|wide|从 /ɪ/ 起音，舌身回到中央，嘴唇与下颌逐渐放松。|传统英式 ear 的结尾不另加卷舌音；起点不要过低。
eə|半开到中央的双元音|wide|以较开的前元音起音，再轻轻向中央弱元音靠拢。|与 /ɪə/ 区分起点；现代英音常用较长的单元音替代。
ʊə|圆唇到中央的双元音|round|先发轻短的 /ʊ/，随后放松圆唇动作，向中央 /ə/ 过渡。|这是传统读法；tour、sure 在现代英音中也常读 /ɔː/。
b|双唇浊爆破音|closed|闭合双唇积聚气流，迅速松开，配合声带振动。|不要加“波”的尾元音；与 /p/ 相比通常送气较弱。
d|齿龈浊爆破音|alveolar|舌尖在上齿龈形成阻塞，然后迅速放开，配合声带振动。|单独练习时不要加 /ə/；不要把舌尖伸到上下齿之间。
ɡ|软腭浊爆破音|back|舌后部贴近软腭形成阻塞，再放开并配合声带振动。|不要念字母 G 的名称 /dʒiː/；也不要额外添加尾元音。
v|唇齿浊擦音|teeth|上门齿轻碰下唇，气流通过接触处的缝隙，同时发声。|不要圆唇读成 /w/；手指触喉可帮助辨别 /f/ 与 /v/。
ð|齿间浊擦音|dental|舌尖轻触上齿或微露齿间，让气流擦过并使声带振动。|不要用 /z/ 或 /d/ 代替；舌尖不需要伸出很多。
z|齿龈浊擦音|alveolar|舌前部靠近齿龈形成窄通道，让带声的气流持续通过。|不要加尾元音；声带振动是与 /s/ 区分的重要线索。
ʒ|龈后浊擦音|alveolar|舌前部靠近齿龈后方，嘴唇略向前，持续发出带声摩擦音。|不要先完全封闭气流，否则容易变成 /dʒ/。
r|龈后近音|alveolar|舌尖靠近齿龈后方但不接触，舌身略收，气流自然通过。|这里的 r 表示英语 /ɹ/，不是颤音；舌尖不弹动。
p|双唇清爆破音|closed|双唇闭合后突然释放气流；重读音节开头通常有明显送气。|不要读成带元音的“坡”；s 后的 /p/ 送气通常减弱。
t|齿龈清爆破音|alveolar|舌尖抵住上齿龈，积聚气流后迅速松开，不主动振动声带。|不要追加“特”的尾元音；s 后的 /t/ 通常不强送气。
k|软腭清爆破音|back|舌后部抵住软腭阻断气流，再突然释放。|不要念成字母 K 的名称；词尾不额外补 /ə/。
f|唇齿清擦音|teeth|上门齿接近下唇，留出小缝，让气流持续擦过。|双唇不能完全闭合；否则容易变成 /p/。
θ|齿间清擦音|dental|舌尖轻放在齿间或上齿边缘，吹出连续气流，不主动发声。|不要收回舌尖读成 /s/，也不要用下唇代替舌尖读成 /f/。
s|齿龈清擦音|alveolar|舌前部接近上齿龈，中央留窄缝，让气流持续通过。|舌位不要过于后移成 /ʃ/；不加尾元音。
ʃ|龈后清擦音|alveolar|舌前部靠近齿龈后方，嘴唇稍突出，发连续的摩擦音。|不要像 /tʃ/ 那样先闭塞；也不要读成汉语翘舌声母。
h|声门清擦音|relaxed|口腔准备好后续元音的形状，轻轻呼气经过声门。|不要在舌后部制造强烈摩擦；不是汉语拼音 h 的直接替代。
dʒ|龈后浊破擦音|alveolar|先用舌前部形成阻塞，再缓慢释放成 /ʒ/ 式摩擦，配合发声。|闭塞和摩擦紧连，不要中间插入元音。
dz|齿龈浊辅音组合|alveolar|先完成 /d/ 的阻塞，随即转为 /z/ 的带声摩擦。|常见于复数或动词词尾；不要漏掉 /d/，也不要分成两音节。
dr|浊辅音组合|alveolar|从 /d/ 的舌位连续转到英语 /r/ 的近音舌位。|保持同一个辅音群，不读成“德儿”；它不是单独的 IPA 音素。
tʃ|龈后清破擦音|alveolar|先封闭气流，再从齿龈后方缓慢释放成摩擦音。|不要只读 /ʃ/ 而省略闭塞，也不要在两个动作之间停顿。
ts|齿龈清辅音组合|alveolar|先形成 /t/ 的阻塞，再直接释放为 /s/ 的摩擦气流。|常见于 cats 等词尾；不加元音，也不省掉第一个辅音。
tr|清辅音起始组合|alveolar|先做 /t/ 的闭塞，再连续移向英语 /r/ 的舌位。|它是辅音群；不要用汉语“戳”替代整个组合。
j|硬腭近音（半元音）|wide|舌前部接近硬腭，像极短的 /i/ 一样迅速滑向后续元音。|不是字母 J 的名称，也不是 /dʒ/；不在起点停留。
w|唇软腭近音（半元音）|round|双唇先收圆、舌后部抬起，然后迅速滑向后面的元音。|不要让上齿接触下唇变成 /v/，也不要读成独立长元音。
m|双唇鼻音|closed|闭合双唇，口腔气流被阻挡，让声音经过鼻腔。|词尾保持双唇闭合，不补一个元音，也不要变成 /n/。
n|齿龈鼻音|alveolar|舌尖贴住上齿龈，打开鼻腔通路，保持带声鼻音。|舌尖不能放低；与 /ŋ/ 的主要区别是阻塞位置。
ŋ|软腭鼻音|back|舌后部抬起贴近软腭，舌尖放低，让声音通过鼻腔。|sing 的结尾通常只有 /ŋ/，不要自行添加 /ɡ/。
l|齿龈舌边近音|alveolar|舌尖接触上齿龈，让气流从舌头两侧通过并发声。|不要把舌尖完全悬空读成 /r/；词尾的 l 舌后部常略抬高。`;

const audioIds: Record<string, string> = {
  "ɑː": "long-a", "ɔː": "long-aw", "ɜː": "long-er", "iː": "long-i", "uː": "long-u",
  "ʌ": "short-uh", "ɒ": "short-o", "ə": "schwa", "ɪ": "short-i", "ʊ": "short-u", "e": "short-e", "æ": "short-ae",
  "aɪ": "diphthong-ai", "ɔɪ": "diphthong-oi", "eɪ": "diphthong-ei", "aʊ": "diphthong-au", "əʊ": "diphthong-oh", "ɪə": "diphthong-ia", "eə": "diphthong-ea", "ʊə": "diphthong-ua",
  "ɡ": "g", "ð": "voiced-th", "θ": "voiceless-th", "ʒ": "zh", "ʃ": "sh", "dʒ": "j", "tʃ": "ch", "ŋ": "ng", "j": "y"
};
// 官方通用 IPA 示范；保留源符号，不拼接双元音或人为延长录音。
const ipaSymbols = new Set("ɑ ɔ ɜ i u ʌ ɒ ə ɪ ʊ e æ b d ɡ v ð z ʒ ɹ p t k f θ s ʃ h j w m n ŋ l".split(" "));
function ipaAudio(symbol: string) {
  const audioSymbol = symbol === "r" ? "ɹ" : symbol.replace("ː", "");
  if (!ipaSymbols.has(audioSymbol)) return { audioNote: "该来源未提供此音标的完整录音。" };
  const code = audioSymbol.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
  return { audioSymbol, maleAudio: `/yinbiao/audio/JE/${code}.mp3`,
    audioNote: symbol.includes("ː") ? `原始录音为 [${audioSymbol}] 音质示范，未单独标注英语长音。`
      : symbol === "r" ? "使用英语近音 [ɹ]，不是颤音 [r]。"
      : "通用 IPA 音值示范，英语实际音值可能因口音而异。" };
}
export const phonemes: Phoneme[] = descriptions.split("\n").map((line) => {
  const [symbol, name, mouth, tip, mistake] = line.split("|");
  const id = audioIds[symbol] ?? symbol;
  return { id, symbol, name, mouth: mouth as Mouth, tip, mistake, ...ipaAudio(symbol), ...studioMedia[symbol], animationVideo: speechstarVideo[symbol], ...(["ts", "dz", "tr", "dr"].includes(symbol) ? { mouthImages: [`/yinbiao/generated/${symbol}.png`], generatedImage: true } : {}), ...clippedAudio[symbol], audioNote: clippedAudio[symbol] ? "音标与示范单词已分段播放。" : "该组合暂无独立录音。",
    ...(symbol === "ts" ? { femaleAudio: `/yinbiao/custom/${symbol}-female.wav`, audioNote: "女声截取自用户提供的 ElevenLabs 录音。" } : {}),
    ...(["tr", "dr", "dz"].includes(symbol) ? { femaleAudio: `/yinbiao/custom/${symbol}-female.mp3`, audioNote: `录音来自用户提供的 yyybabc.com /${symbol}/ 发音文件。` } : {}),
    ...(symbol === "ɪ" ? { video: "https://www.youtube.com/embed/TNFKG0yvDx4" } : {}) };
});
export const wordLengths = [3, 4, 5, 6, 7, 8] as const;
export type WordEntry = { word: string; phonetic: string; meaning: string; tokens: string[] };

// 最长优先，避免把 /eɪ/ 的结尾误算作 /ɪ/，或把 /ʃ/ 算成 /s/。
export function tokenizePhonetic(phonetic: string): string[] {
  const symbols = ["ɑː", "ɔː", "ɜː", "iː", "uː", "aɪ", "ɔɪ", "eɪ", "aʊ", "əʊ", "ɪə", "eə", "ʊə", "tʃ", "dʒ"];
  const source = phonetic.replace(/['ˈˌː:]/g, (value) => value === ":" ? "ː" : value === "ː" ? value : "").replace(/g/g, "ɡ");
  const result: string[] = [];
  for (let i = 0; i < source.length;) {
    const token = symbols.find((symbol) => source.startsWith(symbol, i)) ?? source[i];
    if (/^[a-zæɑɒɔəɜɪʊʌθðʃʒŋɡː]+$/.test(token)) result.push(token);
    i += token.length;
  }
  return result;
}
export function containsSound(tokens: string[], symbol: string) {
  if (["ts", "dz", "tr", "dr"].includes(symbol)) return tokens.some((token, index) => token === symbol[0] && tokens[index + 1] === symbol[1]);
  return tokens.includes(symbol);
}
