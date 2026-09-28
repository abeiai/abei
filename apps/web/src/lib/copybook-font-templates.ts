export const copybookFontTemplateOptions = [
  {
    label: "生字练习",
    value: "shengzi"
  },
  {
    label: "拼音练习",
    value: "pinyin"
  },
  {
    label: "拼音田格",
    value: "pinyin-tian"
  },
  {
    label: "英文抄写",
    value: "english"
  },
  {
    label: "数字书写",
    value: "number"
  },
  {
    label: "作文纸",
    value: "essay"
  },
  {
    label: "书法练习",
    value: "calligraphy"
  },
  {
    label: "回字格",
    value: "huizi"
  },
  {
    label: "横线格",
    value: "line"
  },
  {
    label: "八行笺",
    value: "eight-line"
  },
  {
    label: "姓名贴",
    value: "name-label"
  }
] as const;

export type CopybookFontTemplate = (typeof copybookFontTemplateOptions)[number]["value"];

export function copybookTemplateLabel(value: string) {
  return copybookFontTemplateOptions.find((item) => item.value === value)?.label ?? value;
}
