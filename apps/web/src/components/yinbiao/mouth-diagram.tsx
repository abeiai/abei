import type { Phoneme } from "@/lib/yinbiao/catalog";

const geometry = {
  open: { rx: 47, ry: 35, label: "张口 · 舌位放低" },
  wide: { rx: 65, ry: 15, label: "嘴角展开 · 舌前部抬起" },
  relaxed: { rx: 48, ry: 19, label: "嘴唇放松 · 自然开口" },
  round: { rx: 27, ry: 30, label: "双唇收圆" },
  closed: { rx: 57, ry: 2, label: "双唇闭合" },
  teeth: { rx: 52, ry: 13, label: "上齿轻触下唇" },
  dental: { rx: 54, ry: 17, label: "舌尖轻触齿间" },
  alveolar: { rx: 49, ry: 22, label: "关注齿龈附近的舌位" },
  back: { rx: 49, ry: 25, label: "关注舌后部与软腭" }
};

export function MouthDiagram({ phoneme }: { phoneme: Phoneme }) {
  const { rx, ry, label } = geometry[phoneme.mouth];
  const labelId = `mouth-${phoneme.id}`;
  return (
    <figure className="flex h-full flex-col items-center justify-center rounded-xl bg-[#f8f5ef] p-4">
      <svg viewBox="0 0 240 160" className="h-36 w-full max-w-64" role="img" aria-labelledby={labelId}>
        <title id={labelId}>{`${phoneme.symbol} 的起始口型示意：${label}。详细舌位见发音要领。`}</title>
        <path d="M86 23 Q88 41 81 48 M154 23 Q152 41 159 48" fill="none" stroke="#d9c9bb" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="120" cy="87" rx={rx + 10} ry={ry + 10} fill="#dba5a0" />
        <ellipse cx="120" cy="87" rx={rx} ry={ry} fill="#653d3e" />
        {phoneme.mouth !== "closed" && <path d={`M${120 - rx + 9} ${87 - ry + 5} Q120 ${87 - ry + 15} ${120 + rx - 9} ${87 - ry + 5} L${120 + rx - 12} ${87 - ry + 13} Q120 ${87 - ry + 22} ${120 - rx + 12} ${87 - ry + 13} Z`} fill="#fffaf4" />}
        {phoneme.mouth === "dental" && <path d="M93 87 Q120 76 147 87 Q144 110 120 112 Q96 110 93 87" fill="#e6a7a5" />}
        {phoneme.mouth === "teeth" && <path d="M79 81 Q120 86 161 81 L157 92 Q120 97 83 92Z" fill="#fffaf4" />}
        {phoneme.mouth === "open" && <path d="M88 107 Q120 89 152 107 Q120 125 88 107" fill="#d48e8e" />}
        <path d="M93 144 Q120 153 147 144" stroke="#d9c9bb" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <figcaption className="text-center text-xs leading-6 text-muted-foreground">{label}<br />起始口型示意 · 非真人照片</figcaption>
    </figure>
  );
}
