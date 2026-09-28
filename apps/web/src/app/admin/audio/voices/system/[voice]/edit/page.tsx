import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Mic2, Save } from "lucide-react";

import { AdminVoiceClassificationFields } from "@/components/audio/admin-voice-classification-fields";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminSystemVoiceAsset,
  updateAdminSystemVoiceAction,
  type AdminSystemVoiceAsset
} from "@/lib/audio-admin-api";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    voice: string;
  }>;
}

function statusVariant(status: string) {
  if (status === "READY") {
    return "secondary" as const;
  }

  if (status === "DISABLED") {
    return "muted" as const;
  }

  return "outline" as const;
}

export default async function AdminSystemVoiceEditPage({ params }: PageProps) {
  const { voice: voiceParam } = await params;
  const providerVoiceId = decodeURIComponent(voiceParam);
  const voice = await getAdminSystemVoiceAsset(providerVoiceId);

  return (
    <AdminShell
      active="/admin/audio/voices"
      title="编辑系统音色"
      description="调整官方音色在后台和前台展示的信息，并控制是否启用。"
    >
      <div className="flex flex-col gap-6">
        <Button asChild className="w-fit" variant="outline">
          <Link href="/admin/audio/voices">
            <ArrowLeft data-icon="inline-start" />
            返回音色列表
          </Link>
        </Button>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SystemVoiceSummary voice={voice} />
          <SystemVoiceEditForm voice={voice} />
        </div>
      </div>
    </AdminShell>
  );
}

function SystemVoiceSummary({ voice }: { voice: AdminSystemVoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <Mic2 />
        </div>
        <CardTitle>{voice.name}</CardTitle>
        <CardDescription className="font-mono">{voice.providerVoiceId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="当前状态">
            <Badge variant={statusVariant(voice.status)}>{voice.statusName}</Badge>
          </Info>
          <Info label="类型">{voice.typeName}</Info>
          <Info label="目标模型">{voice.targetModel}</Info>
          <Info label="可调用模型">{voice.supportedModels.join("、")}</Info>
          <Info label="来源模型">{voice.sourceModels.join("、")}</Info>
          <Info label="语种">{voice.language}</Info>
          <Info label="口音">{voice.accent ?? "无特定口音"}</Info>
          <Info label="性别">{voice.gender}</Info>
          <Info label="官方年龄">{voice.age}</Info>
          <Info label="后台年龄分类">{voice.ageCategory ?? "未设置"}</Info>
          <Info label="SSML">{voice.ssmlSupported ? "支持" : "不支持"}</Info>
          <Info label="Instruct">{voice.instructSupported ? "支持" : "不支持"}</Info>
          <Info label="时间戳">{voice.timestampSupported ? "支持" : "不支持"}</Info>
          <Info label="最近更新">{voice.updatedAt ? new Date(voice.updatedAt).toLocaleString("zh-CN") : "未自定义"}</Info>
        </div>

        <div className="rounded-md border border-border p-4">
          <p className="text-sm font-medium text-foreground">试听音频</p>
          <audio className="mt-3 w-full" controls src={voice.previewAudioUrl}>
            <track kind="captions" />
          </audio>
        </div>

        {voice.modelHealth?.length ? (
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-medium text-foreground">兼容模型状态</p>
            <div className="mt-3 flex flex-col gap-2">
              {voice.modelHealth.map((item) => (
                <div className="flex flex-col gap-1 rounded-md bg-secondary/60 px-3 py-2 text-sm" key={item.modelName}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{item.modelName}</span>
                    <Badge variant={item.isAvailable ? "secondary" : "muted"}>{item.statusName}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Provider：{item.providerName ?? "未创建"} · 状态：{item.providerStatus ?? "未创建"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    别名：{item.aliases.length > 0 ? item.aliases.map((alias) => alias.displayName).join("、") : "未绑定"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {voice.disabledReason ? (
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-medium text-foreground">禁用原因</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{voice.disabledReason}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SystemVoiceEditForm({ voice }: { voice: AdminSystemVoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>后台展示与启停</CardTitle>
        <CardDescription>修改后会覆盖官方音色默认信息；禁用后前台不会展示，也不能用于语音合成。</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={updateAdminSystemVoiceAction} className="flex flex-col gap-5">
          <input name="providerVoiceId" type="hidden" value={voice.providerVoiceId} />
          <input name="redirectTo" type="hidden" value="/admin/audio/voices" />

          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="name">显示名称</FieldLabel>
              <Input defaultValue={voice.name} id="name" maxLength={80} name="name" />
            </Field>
            <AdminVoiceClassificationFields
              accent={voice.accent}
              ageCategory={voice.ageCategory}
              gender={voice.gender}
              idPrefix="system-voice"
              language={voice.language}
            />
            <Field>
              <FieldLabel htmlFor="scene">适用场景</FieldLabel>
              <Input defaultValue={voice.scene} id="scene" maxLength={120} name="scene" />
            </Field>
            <Field>
              <FieldLabel htmlFor="trait">声音特质</FieldLabel>
              <Input defaultValue={voice.trait} id="trait" maxLength={120} name="trait" />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="description">描述文本</FieldLabel>
              <Textarea defaultValue={voice.description} id="description" maxLength={300} name="description" />
            </Field>
            <Field>
              <FieldLabel htmlFor="status">是否启用</FieldLabel>
              <Select defaultValue={voice.status} id="status" name="status">
                <option value="READY">启用</option>
                <option value="DISABLED">禁用</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="disabledReason">禁用原因</FieldLabel>
              <Input
                defaultValue={voice.disabledReason ?? ""}
                id="disabledReason"
                maxLength={300}
                name="disabledReason"
                placeholder="禁用时必填"
              />
            </Field>
          </FieldGroup>

          <Button className="w-fit" type="submit">
            <Save data-icon="inline-start" />
            保存并返回列表
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Info({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 break-all text-sm font-medium">{children}</div>
    </div>
  );
}
