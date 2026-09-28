import { Bot, CheckCircle2, Link2, Tags } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAdminAiModelAliases, updateAiModelAliasAction, type AiModelAliasPayload } from "@/lib/ai-admin-api";
import { getAdminSystemConfigs, updateAiConfigAction } from "@/lib/settings-api";

export const dynamic = "force-dynamic";

type AiModelInstanceOption = AiModelAliasPayload["modelInstances"][number];

export default async function AdminAiConfigPage() {
  const [settings, modelAliasPayload] = await Promise.all([
    getAdminSystemConfigs(),
    getAdminAiModelAliases()
  ]);
  const configByKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  return (
    <AdminShell
      active="/admin/ai/config"
      title="AI 配置"
      description="集中管理默认 AI 策略、内容保存策略和语音 AI 安全审核配置。"
    >
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>AI 运行配置</CardTitle>
            <CardDescription>这些配置会影响 AI 任务记录、语音工具审核和前台语音安全提示。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateAiConfigAction} className="grid gap-6 xl:grid-cols-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ai-save-full-content">AI 完整内容保存</FieldLabel>
                  <Select
                    id="ai-save-full-content"
                    name="aiSaveFullContent"
                    defaultValue={configByKey.get("aiSaveFullContent") ?? "false"}
                  >
                    <option value="false">关闭，仅保存预览与哈希</option>
                    <option value="true">启用，保存完整内容</option>
                  </Select>
                  <FieldDescription>默认关闭，启用后才保存完整输入、Prompt 和生成结果。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-voice-clone-review-required">声音复刻审核</FieldLabel>
                  <Select
                    id="audio-voice-clone-review-required"
                    name="audioVoiceCloneReviewRequired"
                    defaultValue={configByKey.get("audioVoiceCloneReviewRequired") ?? "true"}
                  >
                    <option value="true">开启，生成后进入待审核</option>
                    <option value="false">关闭，生成后直接可用</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-voice-design-review-required">声音设计审核</FieldLabel>
                  <Select
                    id="audio-voice-design-review-required"
                    name="audioVoiceDesignReviewRequired"
                    defaultValue={configByKey.get("audioVoiceDesignReviewRequired") ?? "false"}
                  >
                    <option value="false">关闭，生成后直接可用</option>
                    <option value="true">开启，生成后进入待审核</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-user-public-voice-enabled">允许公开用户音色</FieldLabel>
                  <Select
                    id="audio-user-public-voice-enabled"
                    name="audioUserPublicVoiceEnabled"
                    defaultValue={configByKey.get("audioUserPublicVoiceEnabled") ?? "false"}
                  >
                    <option value="false">不允许</option>
                    <option value="true">允许</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-clone-default-visibility">复刻音色默认可见性</FieldLabel>
                  <Select
                    id="audio-clone-default-visibility"
                    name="audioCloneDefaultVisibility"
                    defaultValue={configByKey.get("audioCloneDefaultVisibility") ?? "PRIVATE"}
                  >
                    <option value="PRIVATE">仅用户自己可见</option>
                    <option value="ADMIN_ONLY">仅管理员可见</option>
                    <option value="PUBLIC">公开可见</option>
                  </Select>
                </Field>
              </FieldGroup>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="audio-design-default-visibility">设计音色默认可见性</FieldLabel>
                  <Select
                    id="audio-design-default-visibility"
                    name="audioDesignDefaultVisibility"
                    defaultValue={configByKey.get("audioDesignDefaultVisibility") ?? "PRIVATE"}
                  >
                    <option value="PRIVATE">仅用户自己可见</option>
                    <option value="ADMIN_ONLY">仅管理员可见</option>
                    <option value="PUBLIC">公开可见</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-safety-notice">语音安全提示</FieldLabel>
                  <Textarea
                    id="audio-safety-notice"
                    name="audioSafetyNotice"
                    defaultValue={
                      configByKey.get("audioSafetyNotice") ??
                      "AI 生成语音可能被误用，请勿用于冒充他人、诈骗、侵权、虚假宣传或违法违规用途。声音复刻仅允许上传本人声音或已获得授权的声音。生成音频建议标注为 AI 生成语音。"
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-clone-consent-text">声音复刻授权声明</FieldLabel>
                  <Textarea
                    id="audio-clone-consent-text"
                    name="audioCloneConsentText"
                    defaultValue={
                      configByKey.get("audioCloneConsentText") ??
                      "我确认上传的音频为本人声音，或我已获得声音权利人的明确授权。我承诺不会将该音色用于冒充他人、诈骗、侵权、虚假宣传或其他违法违规用途。"
                    }
                    required
                  />
                  <FieldDescription>用户提交复刻任务时会保存这段声明快照。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="audio-download-notice">音频下载提示</FieldLabel>
                  <Textarea
                    id="audio-download-notice"
                    name="audioDownloadNotice"
                    defaultValue={
                      configByKey.get("audioDownloadNotice") ??
                      "下载或对外使用生成音频前，请确认用途合法合规，并建议标注为 AI 生成语音。"
                    }
                    required
                  />
                </Field>
                <Button className="w-fit" type="submit">保存 AI 配置</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <DefaultModelsSection payload={modelAliasPayload} />
      </div>
    </AdminShell>
  );
}

function DefaultModelsSection({ payload }: { payload: AiModelAliasPayload }) {
  const boundCount = payload.aliases.filter((alias) => alias.modelInstance).length;

  return (
    <section id="default-models" className="grid gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-normal">默认模型</h2>
        <p className="text-sm text-muted-foreground">
          为聊天、推理、视觉、图片、视频和语音等业务用途指定默认模型，业务场景读取这些用途绑定。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">默认模型项</p>
              <p className="mt-1 text-2xl font-semibold">{payload.aliases.length}</p>
            </div>
            <Link2 className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">已绑定</p>
              <p className="mt-1 text-2xl font-semibold">{boundCount}</p>
            </div>
            <CheckCircle2 className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">可选模型</p>
              <p className="mt-1 text-2xl font-semibold">{payload.modelInstances.length}</p>
            </div>
            <Bot className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {payload.aliases.map((alias) => {
          const modelOptions = modelOptionsForAlias(alias.aliasKey, payload.modelInstances);
          const requiresBinding = isRequiredModelAliasKey(alias.aliasKey);

          return (
            <Card className="flex min-h-[360px] flex-col" key={alias.aliasKey}>
              <CardHeader className="gap-4 border-b border-border">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-xl">{alias.displayName}</CardTitle>
                    <Badge variant={alias.modelInstance ? "secondary" : "muted"}>{alias.statusName}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">用途：{alias.aliasKey}</Badge>
                    {alias.modelInstance?.isEnabled ? <Badge variant="outline">模型已启用</Badge> : null}
                  </div>
                  <CardDescription className="min-h-10">{alias.description || "未填写默认模型说明。"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5 pt-5">
                {alias.modelInstance ? (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">当前绑定模型</p>
                        <p className="mt-1 truncate font-semibold">{alias.modelInstance.displayName}</p>
                      </div>
                      <Bot className="size-4 text-muted-foreground" />
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                      <Info label="Provider" value={alias.modelInstance.providerPresetName || alias.modelInstance.providerName} />
                      <Info label="模型名" value={alias.modelInstance.providerModelName} mono />
                      <Info label="Provider 状态" value={alias.modelInstance.providerStatus} />
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[152px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/40 p-5 text-center">
                    <Link2 className="size-5 text-muted-foreground" />
                    <p className="mt-3 font-medium">尚未绑定默认模型</p>
                    <p className="mt-1 text-sm text-muted-foreground">相关业务场景会返回中文配置提示。</p>
                  </div>
                )}

                <div className="flex min-h-10 flex-wrap gap-2">
                  {alias.modelInstance?.capabilityTags.length ? (
                    alias.modelInstance.capabilityTags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        <Tags data-icon="inline-start" />
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">暂无能力标签</span>
                  )}
                </div>

                <form action={updateAiModelAliasAction} className="mt-auto grid gap-3 border-t border-border pt-5">
                  <input name="aliasKey" type="hidden" value={alias.aliasKey} />
                  <Field>
                    <FieldLabel htmlFor={`${alias.aliasKey}-model`}>选择默认模型</FieldLabel>
                    <Select
                      id={`${alias.aliasKey}-model`}
                      key={`${alias.aliasKey}-${alias.modelInstanceId ?? "empty"}`}
                      name="modelInstanceId"
                      defaultValue={alias.modelInstanceId ?? ""}
                    >
                      <option disabled={requiresBinding} value="">
                        {requiresBinding ? "请选择文本模型" : "未配置"}
                      </option>
                      {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.providerPresetName} / {model.displayName} / {model.providerModelName}
                        </option>
                      ))}
                    </Select>
                    <FieldDescription>
                      {alias.modelInstance
                        ? `${alias.modelInstance.providerPresetName} · ${alias.modelInstance.providerModelName}`
                        : requiresBinding
                          ? "默认聊天模型必须绑定已启用的文本模型。"
                          : "未配置时，相关业务场景会提示需要先配置默认模型。"}
                    </FieldDescription>
                  </Field>
                  <Button disabled={requiresBinding && modelOptions.length === 0} type="submit">
                    <Link2 data-icon="inline-start" />
                    保存绑定
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function modelOptionsForAlias(aliasKey: string, modelInstances: AiModelInstanceOption[]) {
  const requiredCapabilities = requiredCapabilitiesForAlias(aliasKey);

  if (requiredCapabilities.length === 0) {
    return modelInstances;
  }

  return modelInstances.filter((model) =>
    requiredCapabilities.every((capability) => model.capabilityTags.includes(capability))
  );
}

function requiredCapabilitiesForAlias(aliasKey: string) {
  return aliasKey === "default-chat" ? ["TEXT"] : [];
}

function isRequiredModelAliasKey(aliasKey: string) {
  return aliasKey === "default-chat";
}

function Info({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-sm" : "break-all font-medium"}>{value}</span>
    </div>
  );
}
