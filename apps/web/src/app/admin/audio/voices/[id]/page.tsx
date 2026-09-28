import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";

import { AdminVoiceClassificationFields } from "@/components/audio/admin-voice-classification-fields";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteAdminVoiceAssetAction,
  getAdminVoiceAsset,
  reviewVoiceAssetAction,
  updateAdminPlatformVoiceAction,
  type AdminOperationLog,
  type AdminVoiceAsset
} from "@/lib/audio-admin-api";
import { getAdminAudioSourceFileUrl } from "@/lib/audio-admin-url";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

function statusVariant(status: string) {
  if (status === "READY") {
    return "secondary" as const;
  }

  if (status === "REJECTED" || status === "DISABLED" || status === "DELETED" || status === "FAILED") {
    return "muted" as const;
  }

  return "outline" as const;
}

export default async function AdminAudioVoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const voice = await getAdminVoiceAsset(id);
  const sourceFileUrl = getAdminAudioSourceFileUrl(voice.sourceSampleFilePath);
  const detailTitle = voice.isPlatform ? "编辑平台音色" : "编辑用户音色";
  const detailDescription = voice.isPlatform
    ? "查看并处理平台复刻、平台设计音色的展示、启用禁用和使用记录。"
    : "查看并处理用户音色的授权、样本、使用记录和审核状态。";

  return (
    <AdminShell
      active="/admin/audio/voices"
      title={detailTitle}
      description={detailDescription}
    >
      <div className="flex flex-col gap-6">
        <Button asChild className="w-fit" variant="outline">
          <Link href="/admin/audio/voices">
            <ArrowLeft data-icon="inline-start" />
            返回音色列表
          </Link>
        </Button>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>{voice.name}</CardTitle>
              <CardDescription>{voice.typeName} · {voice.targetModel}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {voice.isPlatform && (voice.type === "CLONED" || voice.type === "DESIGNED") ? (
                <form
                  action={updateAdminPlatformVoiceAction}
                  className="flex flex-col gap-4 border-b border-border pb-5 md:col-span-2"
                >
                  <input name="id" type="hidden" value={voice.id} />
                  <FieldGroup className="grid gap-4 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor={`${voice.id}-platform-name`}>音色名称</FieldLabel>
                      <Input
                        defaultValue={voice.name}
                        id={`${voice.id}-platform-name`}
                        maxLength={80}
                        name="name"
                        required
                      />
                    </Field>
                    <AdminVoiceClassificationFields
                      accent={voice.accent}
                      ageCategory={voice.ageCategory}
                      gender={voice.gender}
                      idPrefix={`${voice.id}-platform`}
                      language={voice.language}
                    />
                  </FieldGroup>
                  <Button className="w-fit" type="submit">
                    <CheckCircle2 data-icon="inline-start" />
                    保存音色信息
                  </Button>
                </form>
              ) : null}
              <Info label="状态" value={voice.statusName} badge={voice.status} />
              <Info label="可见性" value={voice.visibility} />
              <Info label="Provider" value={voice.provider} />
              <Info label="Provider voice_id" value={voice.providerVoiceId ?? "未生成"} />
              <Info label="语种" value={voice.language ?? "未设置"} />
              <Info label="口音" value={voice.accent ?? "无特定口音"} />
              <Info label="性别" value={voice.gender ?? "男声"} />
              <Info label="年龄分类" value={voice.ageCategory ?? "青年"} />
              <Info label="创建时间" value={new Date(voice.createdAt).toLocaleString("zh-CN")} />
              <div className="rounded-md border border-border p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">描述</p>
                <p className="mt-2 text-sm leading-6">{voice.description ?? "未填写描述"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>试听与来源样本</CardTitle>
              <CardDescription>来源样本仅提供受控临时入口，不展示永久公开 URL。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {voice.previewAudioUrl ? (
                <audio className="w-full" controls src={voice.previewAudioUrl} />
              ) : (
                <p className="text-sm text-muted-foreground">暂无预览音频。</p>
              )}
              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">来源样本</p>
                {voice.sourceAudioAsset ? (
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    <span>{voice.sourceAudioAsset.typeName} · {voice.sourceAudioAsset.mimeType}</span>
                    <span className="text-muted-foreground">
                      {voice.sourceAudioAsset.sizeBytes.toLocaleString("zh-CN")} 字节 · {voice.sourceAudioAsset.storageProvider}
                    </span>
                    {sourceFileUrl ? (
                      <Button asChild className="w-fit" size="sm" variant="outline">
                        <a href={sourceFileUrl} rel="noreferrer" target="_blank">
                          <ExternalLink data-icon="inline-start" />
                          临时打开样本
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">当前样本暂无可用临时入口。</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">无来源样本。</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <ReviewCard voice={voice} />
          <ConsentCard voice={voice} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <RecentTasks voice={voice} />
          <RecentUsage voice={voice} />
        </div>

        <OperationLogs logs={voice.operationLogs ?? []} />
      </div>
    </AdminShell>
  );
}

function Info({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2">
        {badge ? <Badge variant={statusVariant(badge)}>{value}</Badge> : <p className="break-all text-sm font-medium">{value}</p>}
      </div>
    </div>
  );
}

function ConsentCard({ voice }: { voice: AdminVoiceAsset }) {
  if (voice.isPlatform) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>平台音色说明</CardTitle>
          <CardDescription>平台音色由管理员维护，可像系统音色一样提供给所有用户使用。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            平台复刻音色和平台设计音色不绑定前台用户授权记录。请确保添加前已完成必要的声音授权、商用许可和合规确认。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>授权记录</CardTitle>
        <CardDescription>用户提交声音复刻时保存的授权声明快照。</CardDescription>
      </CardHeader>
      <CardContent>
        {voice.consent ? (
          <div className="flex flex-col gap-3 text-sm">
            <Badge className="w-fit" variant="outline">{voice.consent.consentTypeName}</Badge>
            <p className="leading-6">{voice.consent.consentText}</p>
            <p className="text-muted-foreground">
              权利人：{voice.consent.ownerName ?? "本人"} · 联系方式：{voice.consent.ownerContact ?? "未填写"}
            </p>
            <p className="text-muted-foreground">
              同意时间：{new Date(voice.consent.agreedAt).toLocaleString("zh-CN")}
            </p>
            <p className="text-muted-foreground">
              IP：{voice.consent.ip ?? "未记录"} · UA：{voice.consent.userAgent ?? "未记录"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无授权记录。</p>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewCard({ voice }: { voice: AdminVoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>审核与处理</CardTitle>
        <CardDescription>审核拒绝、禁用和删除都必须填写原因并写入操作日志。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form action={reviewVoiceAssetAction} className="flex flex-col gap-3">
          <input name="id" type="hidden" value={voice.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${voice.id}-detail-action`}>审核动作</FieldLabel>
              <Select id={`${voice.id}-detail-action`} name="action" defaultValue="APPROVE">
                <option value="APPROVE">审核通过</option>
                <option value="REJECT">审核拒绝</option>
                <option value="DISABLE">禁用音色</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${voice.id}-detail-reason`}>原因</FieldLabel>
              <Input id={`${voice.id}-detail-reason`} name="reason" placeholder="拒绝、禁用或补充说明" />
            </Field>
          </FieldGroup>
          <Button className="w-fit" type="submit">
            <CheckCircle2 data-icon="inline-start" />
            保存审核
          </Button>
        </form>

        <form action={deleteAdminVoiceAssetAction} className="flex flex-col gap-3">
          <input name="id" type="hidden" value={voice.id} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${voice.id}-detail-delete-reason`}>删除原因</FieldLabel>
              <Input id={`${voice.id}-detail-delete-reason`} name="reason" placeholder="违规、侵权或用户请求删除" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input name="confirm" type="checkbox" />
              确认删除该音色
            </label>
          </FieldGroup>
          <Button className="w-fit" type="submit" variant="outline">
            <Trash2 data-icon="inline-start" />
            删除音色
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RecentTasks({ voice }: { voice: AdminVoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>任务记录</CardTitle>
        <CardDescription>最近 {voice.recentTasks.length.toLocaleString("zh-CN")} 个关联语音任务。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voice.recentTasks.length > 0 ? (
                voice.recentTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/audio/tasks/${task.id}`}>
                        {task.typeName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(task.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={3}>
                    暂无任务记录。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentUsage({ voice }: { voice: AdminVoiceAsset }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>使用记录</CardTitle>
        <CardDescription>最近关联的语音用量日志。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>点数</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voice.recentUsageLogs.length > 0 ? (
                voice.recentUsageLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.operationTypeName}</TableCell>
                    <TableCell>{log.consumedCredits.toLocaleString("zh-CN")}</TableCell>
                    <TableCell>
                      <Badge variant={log.success ? "secondary" : "muted"}>{log.success ? "成功" : "失败"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    暂无使用记录。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationLogs({ logs }: { logs: AdminOperationLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>管理员操作日志</CardTitle>
        <CardDescription>展示该音色相关的最近后台处理记录。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>动作</TableHead>
                <TableHead>管理员</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell>{log.adminUser?.name ?? log.adminUser?.email ?? "系统"}</TableCell>
                    <TableCell>{log.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    暂无管理员操作日志。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
