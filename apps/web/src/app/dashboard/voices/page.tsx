import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Mic2, MoreHorizontal } from "lucide-react";

import { VoiceDeleteForm } from "@/components/audio/voice-delete-form";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  deleteVoiceAssetAction,
  getVoiceLibrary,
  setDefaultVoiceAction,
  updateVoiceAssetAction,
  type VoiceAsset
} from "@/lib/audio-api";
import { getCurrentUser } from "@/lib/auth-actions";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { requireAccountProfile } from "@/lib/profile-api";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  await requireAccountProfile("/dashboard/voices");
  await getCurrentUser();
  const [library, publicConfigs] = await Promise.all([getVoiceLibrary(), getPublicSystemConfigs().catch(() => [])]);
  const configByKey = new Map(publicConfigs.map((config) => [config.key, config.value]));
  const safetyNotice =
    configByKey.get("audioSafetyNotice") ??
    "AI 生成语音可能被误用，请勿用于冒充他人、诈骗、侵权、虚假宣传或违法违规用途。声音复刻仅允许上传本人声音或已获得授权的声音。生成音频建议标注为 AI 生成语音。";
  const platformVoices = library.platformVoices.filter((voice) => voice.status === "READY");
  const clonedVoices = library.customVoices.filter((voice) => voice.type === "CLONED");
  const designedVoices = library.customVoices.filter((voice) => voice.type === "DESIGNED");

  return (
    <DashboardShell active="voices" continuation="/dashboard/voices">
      <section className="flex w-full flex-col gap-8 px-5 py-8">
        <Card>
          <CardContent className="pt-6 text-sm leading-6 text-muted-foreground">
            {safetyNotice}
          </CardContent>
        </Card>

        <VoiceSection title="系统音色" description="所有用户可见，可设为默认系统音色。">
          {library.systemVoices.map((voice) => (
            <SystemVoiceCard key={voice.id} voice={voice} />
          ))}
        </VoiceSection>

        <VoiceSection title="平台音色" description="平台复刻和平台设计音色由管理员维护，所有用户可用。">
          {platformVoices.length > 0 ? platformVoices.map((voice) => <PlatformVoiceCard key={voice.id} voice={voice} />) : <EmptyVoice />}
        </VoiceSection>

        <VoiceSection title="我的复刻音色" description="通过声音复刻任务创建，默认 PRIVATE。">
          {clonedVoices.length > 0 ? clonedVoices.map((voice) => <CustomVoiceCard key={voice.id} voice={voice} />) : <EmptyVoice />}
        </VoiceSection>

        <VoiceSection title="我的设计音色" description="通过声音描述生成，可用于后续文字转语音。">
          {designedVoices.length > 0 ? designedVoices.map((voice) => <CustomVoiceCard key={voice.id} voice={voice} />) : <EmptyVoice />}
        </VoiceSection>
      </section>
    </DashboardShell>
  );
}

function VoiceSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function SystemVoiceCard({ voice }: { voice: VoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
            <Mic2 />
          </div>
          <Badge variant={voice.isDefault ? "secondary" : "outline"}>
            {voice.isDefault ? "默认" : voice.statusName}
          </Badge>
        </div>
        <CardTitle>{voice.name}</CardTitle>
        <CardDescription>{voice.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {voice.providerVoiceId ? <Badge variant="outline">{voice.providerVoiceId}</Badge> : null}
          {voice.ageCategory ? <Badge variant="muted">{voice.ageCategory}</Badge> : null}
          {(voice.languages?.length ? voice.languages : voice.language ? [voice.language] : []).map((language) => (
            <Badge key={language} variant="muted">
              {language}
            </Badge>
          ))}
          <SupportBadge label="SSML" value={voice.ssmlSupported} />
          <SupportBadge label="Instruct" value={voice.instructSupported} />
          <SupportBadge label="时间戳" value={voice.timestampSupported} />
        </div>
        {voice.previewAudioUrl ? <audio className="w-full" controls src={voice.previewAudioUrl} /> : null}
        <form action={setDefaultVoiceAction}>
          <input name="systemVoiceId" type="hidden" value={voice.providerVoiceId ?? ""} />
          <Button size="sm" type="submit" variant={voice.isDefault ? "outline" : "default"}>
            <CheckCircle2 data-icon="inline-start" />
            设为默认
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SupportBadge({ label, value }: { label: string; value?: boolean }) {
  if (typeof value !== "boolean") {
    return null;
  }

  return (
    <Badge variant={value ? "secondary" : "outline"}>
      {label}
      {value ? "支持" : "不支持"}
    </Badge>
  );
}

function PlatformVoiceCard({ voice }: { voice: VoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
            <Mic2 />
          </div>
          <Badge variant={voice.isDefault ? "secondary" : "outline"}>
            {voice.isDefault ? "默认" : voice.type === "CLONED" ? "平台复刻音色" : "平台设计音色"}
          </Badge>
        </div>
        <CardTitle>{voice.name}</CardTitle>
        <CardDescription>{voice.description ?? voice.targetModel}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-xs">
          {voice.providerVoiceId ? <Badge variant="outline">{voice.providerVoiceId}</Badge> : null}
          {voice.language ? <Badge variant="muted">{voice.language}</Badge> : null}
          <Badge variant="muted">{voice.targetModel}</Badge>
        </div>
        {voice.previewAudioUrl ? <audio className="w-full" controls src={voice.previewAudioUrl} /> : null}
        <div className="flex flex-wrap gap-3">
          <form action={setDefaultVoiceAction}>
            <input name="voiceAssetId" type="hidden" value={voice.id} />
            <Button size="sm" type="submit" variant={voice.isDefault ? "outline" : "default"}>
              <CheckCircle2 data-icon="inline-start" />
              设为默认
            </Button>
          </form>
          <Button asChild size="sm" variant="outline">
            <Link href={`/voice?voice=${voice.id}`}>
              使用
              <MoreHorizontal data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomVoiceCard({ voice }: { voice: VoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
            <Mic2 />
          </div>
          <Badge variant={voice.status === "READY" ? "secondary" : voice.status === "FAILED" ? "muted" : "outline"}>
            {voice.isDefault ? "默认 · " : ""}
            {voice.statusName}
          </Badge>
        </div>
        <CardTitle>{voice.name}</CardTitle>
        <CardDescription>{voice.targetModel}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {voice.previewAudioUrl ? <audio className="w-full" controls src={voice.previewAudioUrl} /> : null}
        {voice.consent ? (
          <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">授权记录</p>
            <p className="mt-2 leading-6">{voice.consent.consentText}</p>
            <p className="mt-2">
              {voice.consent.consentTypeName} · {new Date(voice.consent.agreedAt).toLocaleString("zh-CN", { hour12: false })}
            </p>
          </div>
        ) : null}
        {voice.disabledReason ? (
          <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
            处理原因：{voice.disabledReason}
          </div>
        ) : null}
        <FieldGroup>
          <form action={updateVoiceAssetAction} className="flex flex-col gap-3">
            <input name="id" type="hidden" value={voice.id} />
            <Field>
              <FieldLabel htmlFor={`${voice.id}-name`}>重命名</FieldLabel>
              <Input id={`${voice.id}-name`} name="name" defaultValue={voice.name} maxLength={80} />
            </Field>
            <Button className="w-fit" size="sm" type="submit" variant="outline">
              保存名称
            </Button>
          </form>
        </FieldGroup>
        <div className="flex flex-wrap gap-3">
          {voice.status === "READY" ? (
            <form action={setDefaultVoiceAction}>
              <input name="voiceAssetId" type="hidden" value={voice.id} />
              <Button size="sm" type="submit">
                <CheckCircle2 data-icon="inline-start" />
                设为默认
              </Button>
            </form>
          ) : null}
          <VoiceDeleteForm action={deleteVoiceAssetAction} id={voice.id} />
          <Button asChild size="sm" variant="outline">
            <Link href={`/voice?voice=${voice.id}`}>
              使用
              <MoreHorizontal data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyVoice() {
  return (
    <Card>
      <CardContent className="pt-6 text-sm text-muted-foreground">
        暂无音色。可以先使用声音设计或声音复刻创建。
      </CardContent>
    </Card>
  );
}
