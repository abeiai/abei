import type { SeniorTypingWordlistCorrections } from "./senior-typing-wordlist.js";

export type YilinSeniorTypingBookKey = "b1" | "b2" | "b3" | "xb1" | "xb2" | "xb3" | "xb4";

export const yilinSeniorTypingCorrections: Record<
  YilinSeniorTypingBookKey,
  SeniorTypingWordlistCorrections
> = {
  b1: {
    textReplacements: [
      { sourceOrder: 14, text: "make a difference", unitNumber: 1 },
      { sourceOrder: 15, text: "make the most of", unitNumber: 1 },
      { sourceOrder: 11, text: "shoot up", unitNumber: 2 },
      { sourceOrder: 4, text: "out of one's sight", unitNumber: 3 },
      { sourceOrder: 15, text: "at a loss", unitNumber: 3 },
      { sourceOrder: 33, text: "eat away at", unitNumber: 3 },
      { sourceOrder: 37, text: "in person", unitNumber: 3 },
      { sourceOrder: 54, text: "end up", unitNumber: 4 },
      { sourceOrder: 59, text: "show off", unitNumber: 4 }
    ]
  },
  b2: {
    textReplacements: [
      { sourceOrder: 22, text: "tai chi", unitNumber: 2 },
      { sourceOrder: 13, text: "anything but", unitNumber: 3 },
      { sourceOrder: 6, text: "in store (for sb)", unitNumber: 4 }
    ]
  },
  b3: {
    textReplacements: [
      { sourceOrder: 58, text: "spring to mind", unitNumber: 1 },
      { sourceOrder: 51, text: "be glued to sth", unitNumber: 3 },
      { sourceOrder: 55, text: "shoot past", unitNumber: 3 }
    ]
  },
  xb1: {
    append: [{
      items: [{ sourcePage: 2, text: "combination", translation: "结合体，联合体；联合，混合" }],
      unitNumber: 1
    }],
    removals: [{ sourceOrder: 78, unitNumber: 4 }],
    textReplacements: [
      { sourceOrder: 17, text: "cry out for", unitNumber: 1 },
      { sourceOrder: 43, text: "all walks of life", unitNumber: 3 },
      { sourceOrder: 68, text: "in one's own right", unitNumber: 3 },
      { sourceOrder: 10, text: "dig up", unitNumber: 4 }
    ]
  },
  xb2: {
    append: [{
      items: [{ sourcePage: 11, text: "boost", translation: "使增长，使兴旺；增长，提高；帮助，激励" }],
      unitNumber: 1
    }],
    removals: [
      { sourceOrder: 88, unitNumber: 1 },
      { sourceOrder: 105, unitNumber: 1 },
      { sourceOrder: 122, unitNumber: 3 },
      { sourceOrder: 126, unitNumber: 3 },
      { sourceOrder: 128, unitNumber: 3 },
      { sourceOrder: 131, unitNumber: 3 },
      { sourceOrder: 142, unitNumber: 3 }
    ],
    textReplacements: [
      { sourceOrder: 46, text: "mount up", unitNumber: 1 },
      { sourceOrder: 56, text: "spring up", unitNumber: 1 },
      { sourceOrder: 9, text: "motto", unitNumber: 2 },
      { sourceOrder: 43, text: "walk on air", unitNumber: 2 }
    ]
  },
  xb3: {
    textReplacements: [
      { sourceOrder: 11, text: "apart from", unitNumber: 1 }
    ]
  },
  xb4: {
    append: [{
      items: [{ sourcePage: 8, text: "wrap", translation: "包，裹；用……包裹" }],
      unitNumber: 1
    }],
    removals: [
      { sourceOrder: 67, unitNumber: 4 },
      { sourceOrder: 80, unitNumber: 4 },
      { sourceOrder: 95, unitNumber: 4 }
    ],
    textReplacements: [
      { sourceOrder: 9, text: "scarf pin", unitNumber: 1 },
      { sourceOrder: 18, text: "arm in arm", unitNumber: 1 }
    ]
  }
};
