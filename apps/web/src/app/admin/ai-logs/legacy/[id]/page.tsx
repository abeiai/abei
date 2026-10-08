import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/auth-actions";
import { getLegacyAiLog } from "@/lib/legacy-ai-logs-api";
import { LegacyLogDetail } from "@/components/admin/legacy-log-detail";

export const dynamic = "force-dynamic";

export default async function LegacyAiLogDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ sessionPage?: string | string[] }>;
}) {
  await getCurrentAdmin();
  const { id } = await params, query = searchParams ? await searchParams : {};
  try {
    if (Array.isArray(query.sessionPage)) throw new Error("会话页码不能重复");
    const log = await getLegacyAiLog(id, query.sessionPage);
    return <AdminShell active="/admin/ai-logs" title="旧版日志详情" forceTitle>
      <div className="flex flex-col gap-6"><Button asChild variant="outline" className="w-fit"><Link href="/admin/ai-logs?source=LEGACY">返回旧版日志</Link></Button><LegacyLogDetail log={log} /></div>
    </AdminShell>;
  } catch (error) {
    return <AdminShell active="/admin/ai-logs" title="旧版日志详情" forceTitle><Card><CardHeader><CardTitle>日志暂不可用</CardTitle></CardHeader><CardContent><p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "日志加载失败，请稍后重试"}</p><Button asChild className="mt-4" variant="outline"><Link href="/admin/ai-logs?source=LEGACY">返回旧版日志</Link></Button></CardContent></Card></AdminShell>;
  }
}
