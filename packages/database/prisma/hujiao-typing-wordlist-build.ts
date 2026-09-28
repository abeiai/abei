import type { HujiaoTypingLibraryConfig, HujiaoTypingBookKey } from "./hujiao-typing-library-config.js";
import {
  parseHujiaoAlphabeticalPageWordlist,
  parseHujiaoPageWordlist,
  parseHujiaoPrimaryDirectWordlist,
  parseHujiaoPrimaryIndexedWordlist,
  parseHujiaoSeniorWordlist,
  reassignHujiaoWordlistByPage
} from "./hujiao-typing-wordlist.js";
import {
  normalizeTypingAnswer,
  type ParsedTypingWordlist,
  type ParsedTypingWordlistItem,
  type ParsedTypingWordlistUnit
} from "./typing-wordlist-parser.js";

export function buildHujiaoTypingWordlist(
  markdown: string,
  config: HujiaoTypingLibraryConfig
) {
  const unitCount = config.expectedUnitCounts.length;
  const parsed = config.parserKind === "PRIMARY_DIRECT"
    ? parseHujiaoPrimaryDirectWordlist(markdown, unitCount)
    : config.parserKind === "PRIMARY_INDEXED"
      ? parseHujiaoPrimaryIndexedWordlist(markdown, unitCount)
      : config.parserKind === "ALPHABETICAL_PAGE"
        ? parseHujiaoAlphabeticalPageWordlist(markdown, config.unitStartPages)
        : config.parserKind === "UNIT_PAGE"
          ? reassignHujiaoWordlistByPage(
            parseHujiaoPageWordlist(markdown, unitCount),
            config.unitStartPages
          )
          : parseHujiaoSeniorWordlist(markdown, unitCount);

  return applyHujiaoBookCorrections(config.key, parsed);
}

export function applyHujiaoBookCorrections(
  key: HujiaoTypingBookKey,
  parsed: ParsedTypingWordlist
): ParsedTypingWordlist {
  const units = structuredClone(parsed.units);
  if (key === "3a") {
    correctGrade3A(units);
  }
  if (key === "6a") {
    const item = units[1]?.items.find((entry) => entry.text.startsWith("6A_SOE_wordlist.indd"));
    if (!item) {
      throw new Error("沪教版六年级上册词表修正项已失配：Everyone had a good time.");
    }
    correctItem(item, "Everyone had a good time.", "大家玩得都很开心。");
  }
  if (key === "54-7b") {
    mergeFiveFourGrade7BCopyNoun(units);
  }
  if (key === "b2") {
    mergeSeniorDefinitionContinuation(units[0], "check out", "to find out if");
  }
  if (key === "b3") {
    removeSeniorCorruptedDuplicate(units[1], "VIttel");
  }
  if (key === "xb1") {
    splitSeniorWeatherForecastAndRelayRace(units[1]);
  }
  if (key === "xb4") {
    mergeSeniorDefinitionContinuation(units[2], "fetch", "to go to where somebody");
  }
  applyCommonOcrCorrections(units);
  refreshUnits(units);
  return { sourceHash: parsed.sourceHash, units };
}

const commonTextCorrections = new Map<string, string>([
  ["(be) fullof", "(be) full of"],
  ["(be) dying to(do sth.)", "(be) dying to (do sth.)"],
  ["a.m.(AmE A.M.)abbr:", "a.m. (AmE A.M.)"],
  ["(be)happywith", "(be) happy with"],
  ["abour-saving", "labour-saving"],
  ["accordingto", "according to"],
  ["and so on.....*", "and so on"],
  ["animated 'enimeitid/ adj.", "animated"],
  ["both..and...", "both...and..."],
  ["byheart", "by heart"],
  ["challenge...o...", "challenge...to..."],
  ["can'twait to (do sth.)", "can't wait to (do sth.)"],
  ["charity 'tfaerəti/ n.", "charity"],
  ["cheer..up", "cheer...up"],
  ["disagreewith", "disagree with"],
  ["deprive ..of", "deprive ...of"],
  ["drive sb.mad", "drive sb. mad"],
  ["esential", "essential"],
  ["eventualy", "eventually"],
  ["Fine,thanks.", "Fine, thanks."],
  ["fill ...w.ith.....", "fill...with..."],
  ["fix...on", "fix...on..."],
  ["from...to.....", "from...to..."],
  ["grey(AmE gray)", "grey (AmE gray)"],
  ["get alongwith", "get along with"],
  ["hang on(informal)", "hang on"],
  ["Ican'twait!", "I can't wait!"],
  ["intellgent", "intelligent"],
  ["introduce...to...", "introduce...to..."],
  ["Isee.", "I see."],
  ["ICT n. (= information and communications technology)", "ICT"],
  ["lead(somebody) to", "lead (somebody) to"],
  ["keep sb.from (doing) sth.", "keep sb. from (doing) sth."],
  ["leave...behind", "leave...behind..."],
  ["makeadifference", "make a difference"],
  ["make a good impression on..", "make a good impression on..."],
  ["impose ...onto try", "impose ...on"],
  ["in the shape of ....", "in the shape of..."],
  ["miror", "mirror"],
  ["onsumer", "consumer"],
  ["payattention to", "pay attention to"],
  ["playlist 'pleilist/n.", "playlist"],
  ["plentyof", "plenty of"],
  ["playa joke on sb.", "play a joke on sb."],
  ["praise...for....", "praise...for..."],
  ["provide..with..", "provide...with..."],
  ["pull...out", "pull...out..."],
  ["put ...asideto ignore or forget", "put ...aside"],
  ["remind sb.about sth.", "remind sb. about sth."],
  ["send ..to prison", "send...to prison"],
  ["setoff", "set off"],
  ["show...around...", "show...around..."],
  ["specialeffects", "special effects"],
  ["stareat", "stare at"],
  ["sO", "so"],
  ["T-shirtT", "T-shirt"],
  ["talentshow", "talent show"],
  ["take ..for granted", "take ...for granted"],
  ["there(is,are)", "there (is, are)"],
  ["thousandsof", "thousands of"],
  ["trick sb.into doing sth.", "trick sb. into doing sth."],
  ["turn sth.over", "turn sth. over"],
  ["treasurehunt", "treasure hunt"],
  ["voluntarywork", "voluntary work"],
  ["wash...face", "wash...face"],
  ["weatherforecast", "weather forecast"],
  ["whata pity", "what a pity"],
  ["p.m.(AmE P.M.)abbr:", "p.m. (AmE P.M.)"],
  ["western 'westən/ adj.", "western"],
  ["well offhaving", "well off"],
  ["be keen onto like", "be keen on"],
  ["be ashamed ofto feel shame or embarrassment about", "be ashamed of"],
  ["on behalf ofas", "on behalf of"],
  ["Chinese knota decorative handicraft that began as", "Chinese knot"],
  ["in case because of", "in case"],
  ["a variety ofdifferent kinds of", "a variety of"],
  ["prime ministerthe most important minister and leader of", "prime minister"],
  ["junk food food thatis quick and easy", "junk food"],
  ["vending machinea machine from which you can buy drinks,etc.by putting money in", "vending machine"],
  ["pay regard", "pay regard to"],
  ["traffic accidentan event in which", "traffic accident"],
  ["domestic chorea regular task connected with", "domestic chore"],
  ["be attractive tohave features or qualities that make", "be attractive to"],
  ["be likely tobe probable or expected", "be likely to"],
  ["Social media websites and software programmes", "social media"],
  ["ice sheeta layer of ice that covers", "ice sheet"],
  ["polar beara white bear that lives near", "polar bear"],
  ["apart fromexcept for", "apart from"],
  ["due", "due to"],
  ["in charge ofhaving control over somebody", "in charge of"],
  ["silicon chipa", "silicon chip"],
  ["mother tongue one's first language", "mother tongue"],
  ["cell phone (American English)a mobile phone", "cell phone (American English)"],
  ["in additionused", "in addition"],
  ["appeal toto attract or interest", "appeal to"],
  ["stewed beefa dish in which beef is slowly cooked in liquid,which results in", "stewed beef"],
  ["soy saucea thin dark brown sauce that is made from soya beans and has", "soy sauce"],
  ["steamed buna flour dish that is cooked by hot steam", "steamed bun"],
  ["in spite ofif you say that", "in spite of"],
  ["gap yeara year that", "gap year"],
  ["soak up take in or absorb", "soak up"],
  ["brand newcompletely new", "brand new"],
  ["pots of money a", "pots of money"],
  ["palm treea straight tree with", "palm tree"],
  ["crystal clearcompletely clear and bright", "crystal clear"],
  ["in conclusionfinally", "in conclusion"],
  ["traffic jam too many vehicles in one place so that it is impossible", "traffic jam"],
  ["arts and crafts some handmade pieces with decorative and practical purposes", "arts and crafts"],
  ["detective storya story whose plot involves", "detective story"],
  ["fond ofhaving", "fond of"],
  ["turn downto reject or refuse", "turn down"],
  ["macaroni and cheesemacaroni prepared in", "macaroni and cheese"],
  ["at randomwithout deciding in advance what is going", "at random"],
  ["get rid ofto throw away;", "get rid of"],
  ["cope withto deal successfullywith", "cope with"],
  ["in vainunsuccessful; of no value", "in vain"],
  ["shelf lifethe length of time that food,etc.can be kept before it is too old", "shelf life"],
  ["bucket list alist of things that you want", "bucket list"],
  ["the elderlypeople who are old", "the elderly"],
  ["wipe outto destroy or remove", "wipe out"],
  ["marine ecosystemsystem of living organisms in", "marine ecosystem"],
  ["belief bi'li:f", "belief"],
  ["Crash kraef", "crash"],
  ["Soundtrack", "soundtrack"],
  ["Concentration", "concentration"],
  ["Commercialize", "commercialize"],
  ["Scent", "scent"],
  ["taste budpart of", "taste bud"],
  ["log into perform", "log in"],
  ["Scene", "scene"],
  ["Comment", "comment"],
  ["Continent", "continent"],
  ["Company", "company"],
  ["Confirm", "confirm"],
  ["Context", "context"],
  ["Sort", "sort"],
  ["Scared", "scared"],
  ["Scholarship", "scholarship"],
  ["Constitution", "constitution"],
  ["Sculptor", "sculptor"],
  ["Criticism", "criticism"],
  ["Compete", "compete"],
  ["Sorrow", "sorrow"],
  ["Stability", "stability"],
  ["Socialist", "socialist"],
  ["Strait", "strait"],
  ["Circuit", "circuit"],
  ["Seed", "seed"],
  ["Solid", "solid"],
  ["Committed", "committed"],
  ["Stretch", "stretch"],
  ["Concept", "concept"],
  ["Sour", "sour"],
  ["Curriculum", "curriculum"],
  ["Conflict", "conflict"],
  ["Criterion", "criterion"],
  ["Soldier", "soldier"],
  ["Confucianism", "confucianism"],
  ["Soul", "soul"],
  ["fade away (of", "fade away"],
  ["Wwell-respected", "well-respected"]
]);

const commonRawTextCorrections = new Map<string, string>([
  ["in the distance far away", "in the distance"],
  ["to somebody's creditmaking", "to somebody's credit"],
  ["in a nutshell using", "in a nutshell"],
  ["in the midst ofin the middle", "in the midst of"]
]);

function mergeFiveFourGrade7BCopyNoun(units: ParsedTypingWordlistUnit[]) {
  const unit = units[3];
  const strayIndex = unit?.items.findIndex((item) => (
    item.text === "n" && item.translation?.includes("一本")
  )) ?? -1;
  const copy = strayIndex > 0 ? unit?.items[strayIndex - 1] : null;
  if (!unit || strayIndex < 0 || copy?.text !== "copy") {
    throw new Error("沪教版五四学制七年级下册词表修正项已失配：copy 名词释义");
  }
  const stray = unit.items[strayIndex]!;
  const nounTranslation = (stray.translation ?? "")
    .replace(/^[（(]/u, "")
    .replace(/[）)]$/u, "");
  copy.translation = `${copy.translation}；n.(${nounTranslation}`;
  copy.sourceRaw = `${copy.sourceRaw}；${stray.sourceRaw}`;
  unit.items.splice(strayIndex, 1);
}

function mergeSeniorDefinitionContinuation(
  unit: ParsedTypingWordlistUnit | undefined,
  targetText: string,
  continuationText: string
) {
  const continuationIndex = unit?.items.findIndex((item) => item.text === continuationText) ?? -1;
  const target = continuationIndex > 0 ? unit?.items[continuationIndex - 1] : null;
  if (!unit || continuationIndex < 0 || target?.text !== targetText) {
    throw new Error(`沪教版高中词表修正项已失配：${targetText} 补充释义`);
  }
  const continuation = unit.items[continuationIndex]!;
  target.translation = [target.translation, continuation.translation].filter(Boolean).join("；");
  target.sourceRaw = `${target.sourceRaw ?? target.text}；${continuation.sourceRaw ?? continuation.text}`;
  unit.items.splice(continuationIndex, 1);
}

function removeSeniorCorruptedDuplicate(
  unit: ParsedTypingWordlistUnit | undefined,
  textPrefix: string
) {
  const index = unit?.items.findIndex((item) => item.text.startsWith(textPrefix)) ?? -1;
  if (!unit || index < 0) {
    throw new Error(`沪教版高中词表修正项已失配：移除 ${textPrefix}`);
  }
  unit.items.splice(index, 1);
}

function splitSeniorWeatherForecastAndRelayRace(unit: ParsedTypingWordlistUnit | undefined) {
  const weatherIndex = unit?.items.findIndex((item) => (
    item.text === "weather forecast" && item.translation?.includes("relay race")
  )) ?? -1;
  if (!unit || weatherIndex < 0) {
    throw new Error("沪教版高中选择性必修第一册词表修正项已失配：weather forecast / relay race");
  }
  const weather = unit.items[weatherIndex]!;
  weather.translation = "天气预报";
  const relay = correctionItem("relay race", "接力赛", weather.sourcePage);
  relay.sourceRaw = weather.sourceRaw;
  unit.items.splice(weatherIndex + 1, 0, relay);
}

function applyCommonOcrCorrections(units: ParsedTypingWordlistUnit[]) {
  for (const item of units.flatMap((unit) => unit.items)) {
    const rawCorrection = [...commonRawTextCorrections.entries()]
      .find(([prefix]) => item.sourceRaw?.startsWith(prefix))?.[1];
    const corrected = rawCorrection ?? commonTextCorrections.get(item.text);
    if (corrected) {
      correctItem(item, corrected, item.translation ?? "");
    }
    if (item.text === "intelligent") {
      item.translation = "（动物、生物等）有智力的；有理解和学习能力的；有才智的；聪明的";
    }
    if (item.text === "T-shirt") {
      item.translation = "T恤衫；短袖汗衫";
    }
  }
}

export function assertHujiaoWordlistQuality(parsed: ParsedTypingWordlist, title: string) {
  const invalid = parsed.units.flatMap((unit) => unit.items.filter((item) => (
    !item.translation
    || !/^[A-Za-z(]/u.test(item.text)
    || /\p{Script=Han}/u.test(item.text)
    || item.text.length > 80
    || !/\p{Script=Han}/u.test(item.translation)
    || /(?:_wordlist\.indd|上海教育出版社|Word list)/iu.test(item.translation)
  )).map((item) => `Unit ${unit.number} #${item.sourceOrder} ${item.text}`));
  if (invalid.length > 0) {
    throw new Error(`${title}存在未清理词条：${invalid.join("；")}`);
  }

  for (const unit of parsed.units) {
    const normalized = unit.items.map((item) => item.normalizedText);
    const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
    if (duplicates.length > 0) {
      throw new Error(`${title} Unit ${unit.number} 存在重复词条：${[...new Set(duplicates)].join("、")}`);
    }
  }
}

function correctGrade3A(units: ParsedTypingWordlistUnit[]) {
  const unit1 = units[0]!;
  const notIndex = unit1.items.findIndex((item) => item.normalizedText === "not");
  if (notIndex < 0) {
    throw new Error("沪教版三年级上册词表修正项已失配：not");
  }
  correctItem(unit1.items[notIndex]!, "not", "不；没有");
  unit1.items.splice(notIndex + 1, 0, correctionItem("I", "我", unit1.items[notIndex]!.sourcePage));
  replaceByText(units[0]!, "a(an)", "a (an)", "一；一个");
  replaceByText(units[0]!, "Fine,thank you.", "Fine, thank you.", "很好，谢谢。");

  replaceByText(units[1]!, "grandfather(grandpa)", "grandfather (grandpa)", "（外）祖父；爷爷；外公");
  replaceByText(units[1]!, "like", "like", "喜欢");
  replaceByText(units[1]!, "grandmother(grandma)", "grandmother (grandma)", "（外）祖母；奶奶；外婆");
  replaceByText(units[3]!, "child (pl.children)", "child (pl. children)", "孩子");
  replaceByText(units[3]!, "want to(do)", "want to (do)", "想做某事");

  const movedTexts = new Set([
    "noodles", "toy plane", "doll", "card", "come", "love", "meet", "box", "book", "ball", "share"
  ]);
  const moved = units[6]!.items.filter((item) => movedTexts.has(item.normalizedText));
  if (moved.length !== movedTexts.size) {
    throw new Error(`沪教版三年级上册双栏修正项已失配：期望 ${movedTexts.size}，实际 ${moved.length}`);
  }
  units[6]!.items = units[6]!.items.filter((item) => !movedTexts.has(item.normalizedText));
  units[7]!.items.unshift(...moved);
  replaceByText(units[7]!, "Whata lovely picture!", "What a lovely picture!", "多么可爱的一幅画啊！");
  replaceByText(units[7]!, "candle", "candle", "蜡烛");
}

function replaceByText(
  unit: ParsedTypingWordlistUnit,
  original: string,
  text: string,
  translation: string
) {
  const normalized = normalizeTypingAnswer(original);
  const item = unit.items.find((entry) => entry.normalizedText === normalized);
  if (!item) {
    throw new Error(`沪教版词表修正项已失配：Unit ${unit.number} ${original}`);
  }
  correctItem(item, text, translation);
}

function correctItem(item: ParsedTypingWordlistItem, text: string, translation: string) {
  item.text = text;
  item.normalizedText = normalizeTypingAnswer(text);
  item.itemType = /\s/u.test(text) ? "PHRASE" : "WORD";
  item.translation = translation;
}

function correctionItem(text: string, translation: string, sourcePage: number): ParsedTypingWordlistItem {
  return {
    britishPhonetic: null,
    isSpellingRequired: true,
    itemType: /\s/u.test(text) ? "PHRASE" : "WORD",
    normalizedText: normalizeTypingAnswer(text),
    partOfSpeech: null,
    sourceOrder: 0,
    sourcePage,
    sourceRaw: "OCR 修正：I 我",
    text,
    translation
  };
}

function refreshUnits(units: ParsedTypingWordlistUnit[]) {
  for (const unit of units) {
    unit.items = unit.items.map((item, index) => ({ ...item, sourceOrder: index + 1 }));
    const pages = unit.items.map((item) => item.sourcePage).filter((page) => page > 0);
    unit.sourcePageStart = pages.length > 0 ? Math.min(...pages) : null;
    unit.sourcePageEnd = pages.length > 0 ? Math.max(...pages) : null;
  }
}
