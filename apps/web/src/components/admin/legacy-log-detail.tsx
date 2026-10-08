import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LegacyAiLogDetail } from "@/lib/legacy-ai-logs-api";
import { LegacyLogAsset } from "./legacy-log-asset";

const kinds = { CHAT: "对话", IMAGE: "图片", AUDIO: "语音", VIDEO: "视频" };
const statuses = { WAITING: "等待中", RUNNING: "处理中", SUCCEEDED: "成功", FAILED: "失败", UNKNOWN: "未知" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "未记录";
function TextPanel({ title, text }: { title: string; text: string | null }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{text || "未记录"}</pre></CardContent></Card>;
}

export function LegacyLogDetail({ log }: { log: LegacyAiLogDetail }) {
  const values = [
    ["用户", log.user ? `${log.user.nickname} / ${log.user.email}` : `归属待核验${log.sourceUserId ? ` · 旧用户 ${log.sourceUserId}` : ""}`],
    ["旧记录 ID", `${log.sourceTable} / ${log.sourcePk}`], ["应用", log.application], ["模型 / 版本", [log.modelName, log.versionName].filter(Boolean).join(" / ")],
    ["请求时间", date(log.requestedAt)], ["响应时间", date(log.respondedAt)], ["音色", log.voiceName], ["远端任务 ID", log.sourceTaskId],
    ["输入 / 输出 tokens", `${log.inputTokens ?? "未知"} / ${log.outputTokens ?? "未知"}`], ["总 tokens", log.totalTokens == null ? "未知" : String(log.totalTokens)],
    ["文本长度", log.textLength == null ? "未知" : String(log.textLength)], ["原始时长", log.durationRaw == null ? "未知" : `${log.durationRaw}${log.durationUnit ? ` ${log.durationUnit}` : "（单位未核验）"}`],
  ];
  return <>
    <Card><CardHeader className="flex flex-wrap items-center gap-2"><CardTitle>{kinds[log.kind]}日志</CardTitle><Badge variant="outline">{statuses[log.status]}</Badge>{!log.usageVerified ? <Badge variant="muted">用量口径未核验</Badge> : null}</CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{values.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value || "未记录"}</dd></div>)}</dl></CardContent></Card>
    {log.errorMessage ? <TextPanel title="错误信息" text={log.errorMessage} /> : null}
    {log.systemPrompt ? <TextPanel title="系统提示词" text={log.systemPrompt} /> : null}
    <div className="grid gap-6 xl:grid-cols-2"><TextPanel title="输入内容" text={log.inputText} /><TextPanel title="输出内容" text={log.outputText} /></div>
    {log.parameters != null ? <TextPanel title="业务参数" text={JSON.stringify(log.parameters, null, 2)} /> : null}
    {log.assets.length ? <Card><CardHeader><CardTitle>关联素材</CardTitle></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{log.assets.map(asset => <div key={asset.id} className="rounded-xl border p-4">
      <p className="mb-3 break-words text-sm font-medium">{asset.filename || asset.fieldPath}</p>
      <LegacyLogAsset logId={log.id} asset={asset} />
    </div>)}</div></CardContent></Card> : null}
    {log.sessions.map(session => <Card key={session.id}><CardHeader className="flex flex-wrap items-center justify-between gap-4"><CardTitle>{session.title || "关联会话"}</CardTitle><div className="flex items-center gap-2">
      {session.page > 1 ? <Button asChild size="sm" variant="outline"><Link href={`/admin/ai-logs/legacy/${encodeURIComponent(log.id)}?sessionPage=${session.page - 1}`}>上一页</Link></Button> : null}
      <span className="text-xs text-muted-foreground">第 {session.page} 页 · {session.total} 条</span>
      {session.page * session.pageSize < session.total ? <Button asChild size="sm" variant="outline"><Link href={`/admin/ai-logs/legacy/${encodeURIComponent(log.id)}?sessionPage=${session.page + 1}`}>下一页</Link></Button> : null}
    </div></CardHeader><CardContent>{session.systemPrompt ? <details className="mb-4 rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">会话系统提示词</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{session.systemPrompt}</pre></details> : null}<ol className="space-y-4">{session.items.map(item => <li key={item.position} className="rounded-xl border p-4">
      <p className="mb-2 text-xs text-muted-foreground">第 {item.position + 1} 条</p>{item.log ? <>
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{item.log.inputText || "未记录输入"}</p><p className="mt-3 whitespace-pre-wrap break-words border-t pt-3 text-sm leading-7">{item.log.outputText || "未记录输出"}</p>
        <Link className="mt-3 inline-block text-sm font-medium hover:underline" href={`/admin/ai-logs/legacy/${encodeURIComponent(item.log.id)}`}>查看完整记录</Link>
      </> : <p className="text-sm text-muted-foreground">关联消息缺失或归属待核验</p>}
    </li>)}</ol></CardContent></Card>)}
  </>;
}
