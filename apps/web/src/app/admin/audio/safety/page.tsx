import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminAudioSafetySettings } from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

function yesNo(value: boolean) {
  return value ? "开启" : "关闭";
}

export default async function AdminAudioSafetyPage() {
  const settings = await getAdminAudioSafetySettings();

  return (
    <AdminShell
      active="/admin/audio/safety"
      title="语音安全"
      description="配置声音授权、审核策略和违规音色处理规则。"
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="声音复刻审核" value={yesNo(settings.cloneReviewRequired)} />
          <Metric label="声音设计审核" value={yesNo(settings.designReviewRequired)} />
          <Metric label="允许公开用户音色" value={yesNo(settings.userPublicVoiceEnabled)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>安全策略</CardTitle>
            <CardDescription>审核开关和协议文案在系统设置中维护，前台提交时会保存授权声明快照。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Info label="声音复刻审核" value={yesNo(settings.cloneReviewRequired)} />
            <Info label="声音设计审核" value={yesNo(settings.designReviewRequired)} />
            <Info label="允许公开用户音色" value={yesNo(settings.userPublicVoiceEnabled)} />
            <Info label="复刻默认可见性" value={settings.cloneDefaultVisibility} />
            <Info label="设计默认可见性" value={settings.designDefaultVisibility} />
            <div className="rounded-md border border-border p-4 md:col-span-2 xl:col-span-3">
              <p className="text-sm text-muted-foreground">语音安全提示</p>
              <p className="mt-2 text-sm leading-6">{settings.safetyNotice}</p>
              <Button asChild className="mt-4" size="sm" variant="outline">
                <Link href="/admin/settings">去系统设置调整</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审核入口</CardTitle>
            <CardDescription>音色审核、启用禁用和删除操作已统一合并到音色库。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>请在音色库中处理系统音色、平台音色和用户音色的审核、启用禁用与删除。</p>
            <Button asChild className="w-fit" variant="outline">
              <Link href="/admin/audio/voices">进入音色库</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <ShieldCheck />
        </div>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 break-all text-sm font-medium">{value}</p>
    </div>
  );
}
