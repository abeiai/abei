import Link from "next/link";
import type { ReactNode } from "react";
import { RefreshCcw } from "lucide-react";

import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAdminAiModelAliases,
  getAdminAiTasks,
  type AdminAiTask,
  type AiModelInstance
} from "@/lib/ai-admin-api";
import { getAdminAudioModels, getAdminAudioTasks, type AdminAudioModel, type AdminAudioTask } from "@/lib/audio-admin-api";

const pageSize = 50;

const taskTypeOptions = [
  { value: "TEXT", label: "文本任务" },
  { value: "IMAGE", label: "图片任务" },
  { value: "VIDEO", label: "视频任务" },
  { value: "AUDIO", label: "语音任务" }
] as const;

type TaskType = (typeof taskTypeOptions)[number]["value"];

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  basePath?: "/admin/ai-tasks" | "/admin/ai-logs";
  controls?: ReactNode;
}

interface FilterState {
  taskType: TaskType;
  provider: string;
  model: string;
  status: string;
  startTime: string;
  endTime: string;
  user: string;
  page: number;
}

interface SelectOption {
  value: string;
  label: string;
}

function searchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeTaskType(value: string): TaskType {
  return taskTypeOptions.some((option) => option.value === value) ? (value as TaskType) : "TEXT";
}

function normalizePage(value: string) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function formatDate(value: string | null) {
  if (!value) {
    return "未完成";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: string) {
  if (status === "SUCCEEDED") {
    return "secondary" as const;
  }

  if (status === "FAILED" || status === "CANCELLED" || status === "COMPENSATED") {
    return "muted" as const;
  }

  return "outline" as const;
}

function taskTypeLabel(value: TaskType) {
  return taskTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function hasAnyTag(tags: string[], candidates: string[]) {
  const normalized = new Set(tags.map((tag) => tag.toUpperCase()));

  return candidates.some((candidate) => normalized.has(candidate));
}

function aiModelMatchesTaskType(model: AiModelInstance, taskType: Exclude<TaskType, "AUDIO">) {
  const hasImage = hasAnyTag(model.capabilityTags, [
    "IMAGE",
    "IMAGE_INPUT",
    "IMAGE_GENERATION",
    "IMAGE_EDIT",
    "REFERENCE_IMAGE",
    "BATCH_IMAGE"
  ]);
  const hasVideo = hasAnyTag(model.capabilityTags, [
    "VIDEO",
    "VIDEO_GENERATION",
    "TEXT_TO_VIDEO",
    "IMAGE_TO_VIDEO",
    "REFERENCE_TO_VIDEO",
    "REFERENCE_VIDEO",
    "VIDEO_EDIT"
  ]);

  if (taskType === "IMAGE") {
    return hasImage && !hasVideo;
  }

  if (taskType === "VIDEO") {
    return hasVideo;
  }

  return !hasImage && !hasVideo;
}

function uniqueOptions(options: SelectOption[]) {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (!option.value || seen.has(option.value)) {
      return false;
    }

    seen.add(option.value);
    return true;
  });
}

function buildOptions(taskType: TaskType, aiModels: AiModelInstance[], audioModels: AdminAudioModel[]) {
  if (taskType === "AUDIO") {
    const enabledAudioModels = audioModels.filter((model) => model.isEnabled);

    return {
      providers: uniqueOptions(
        enabledAudioModels.map((model) => ({
          value: model.provider,
          label: model.providerDisplayName || model.providerName || model.provider
        }))
      ),
      models: enabledAudioModels.map((model) => ({
        value: model.id,
        label: `${model.displayName} · ${model.modelName}`
      }))
    };
  }

  const enabledAiModels = aiModels.filter((model) => model.isEnabled && aiModelMatchesTaskType(model, taskType));

  return {
    providers: uniqueOptions(
      enabledAiModels.map((model) => ({
        value: model.providerInstanceId,
        label: model.providerName || model.providerPresetName || model.providerInstanceId
      }))
    ),
    models: enabledAiModels.map((model) => ({
      value: model.id,
      label: `${model.displayName} · ${model.providerModelName}`
    }))
  };
}

function buildPageHref(filters: FilterState, page: number, basePath: string) {
  const params = new URLSearchParams();

  params.set("taskType", filters.taskType);
  params.set("page", String(page));

  for (const key of ["provider", "model", "status", "startTime", "endTime", "user"] as const) {
    if (filters[key]) {
      params.set(key, filters[key]);
    }
  }

  if (basePath === "/admin/ai-logs") params.set("source", "NEW");
  return `${basePath}?${params.toString()}`;
}

function aiTaskCredits(task: AdminAiTask) {
  return `${(task.actualCredits ?? 0).toLocaleString("zh-CN")} / ${task.estimatedCredits.toLocaleString("zh-CN")} 点`;
}

function audioTaskCredits(task: AdminAudioTask) {
  return `${(task.actualCredits ?? task.estimatedCredits).toLocaleString("zh-CN")} / ${task.estimatedCredits.toLocaleString("zh-CN")} 点`;
}

export async function AdminTaskList({ searchParams, basePath = "/admin/ai-tasks", controls }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters: FilterState = {
    taskType: normalizeTaskType(searchValue(params, "taskType")),
    provider: searchValue(params, "provider"),
    model: searchValue(params, "model"),
    status: searchValue(params, "status"),
    startTime: searchValue(params, "startTime"),
    endTime: searchValue(params, "endTime"),
    user: searchValue(params, "user"),
    page: normalizePage(searchValue(params, "page"))
  };

  const [modelAliasPayload, audioModels] = await Promise.all([
    getAdminAiModelAliases().catch(() => ({ aliases: [], modelInstances: [] })),
    getAdminAudioModels().catch(() => [])
  ]);
  const options = buildOptions(filters.taskType, modelAliasPayload.modelInstances, audioModels);
  const sharedFilters = {
    provider: filters.provider,
    model: filters.model,
    status: filters.status,
    startTime: filters.startTime,
    endTime: filters.endTime,
    user: filters.user,
    page: String(filters.page),
    pageSize: String(pageSize)
  };
  const tasks =
    filters.taskType === "AUDIO"
      ? await getAdminAudioTasks(sharedFilters)
      : await getAdminAiTasks({
          ...sharedFilters,
          taskType: filters.taskType
        });
  const hasPreviousPage = filters.page > 1;
  const hasNextPage = tasks.length === pageSize;

  return (
    <AdminShell active={basePath} title={basePath === "/admin/ai-logs" ? "日志查询" : "任务清单"}>
      <div className="flex flex-col gap-6">
        {controls}
        <Card>
          <CardHeader>
            <CardTitle>筛选任务</CardTitle>
            <CardDescription>默认展示文本任务；切换任务类型后，模型下拉只展示对应类型的可用模型。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-6" action={basePath}>
              {basePath === "/admin/ai-logs" ? <input name="source" type="hidden" value="NEW" /> : null}
              <FieldGroup className="contents">
                <Field>
                  <FieldLabel htmlFor="taskType">任务类型</FieldLabel>
                  <Select id="taskType" name="taskType" defaultValue={filters.taskType}>
                    {taskTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="provider">Provider</FieldLabel>
                  <Select id="provider" name="provider" defaultValue={filters.provider}>
                    <option value="">全部 Provider</option>
                    {options.providers.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="model">模型</FieldLabel>
                  <Select id="model" name="model" defaultValue={filters.model}>
                    <option value="">全部模型</option>
                    {options.models.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="status">状态</FieldLabel>
                  <Select id="status" name="status" defaultValue={filters.status}>
                    <option value="">全部状态</option>
                    <option value="CREATED">已创建</option>
                    <option value="RESERVED">已冻结点数</option>
                    <option value="RUNNING">运行中</option>
                    <option value="PROCESSING">处理中</option>
                    <option value="SUCCEEDED">处理成功</option>
                    <option value="FAILED">处理失败</option>
                    <option value="CANCELLED">已取消</option>
                    <option value="COMPENSATED">已补偿</option>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="startTime">开始时间</FieldLabel>
                  <Input id="startTime" name="startTime" type="datetime-local" defaultValue={filters.startTime} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="endTime">结束时间</FieldLabel>
                  <Input id="endTime" name="endTime" type="datetime-local" defaultValue={filters.endTime} />
                </Field>
                <Field className="lg:col-span-2">
                  <FieldLabel htmlFor="user">用户</FieldLabel>
                  <Input id="user" name="user" defaultValue={filters.user} placeholder="用户名、邮箱或用户 ID" />
                </Field>
                <input name="page" type="hidden" value="1" />
                <div className="flex items-end gap-3 lg:col-span-4">
                  <Button type="submit">
                    <RefreshCcw data-icon="inline-start" />
                    应用筛选
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href={basePath}>重置</Link>
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>任务列表</CardTitle>
              <CardDescription>
                当前为{taskTypeLabel(filters.taskType)}，每页 {pageSize.toLocaleString("zh-CN")} 条。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasPreviousPage ? (
                <Button asChild size="sm" type="button" variant="outline">
                  <Link href={buildPageHref(filters, filters.page - 1, basePath)}>上一页</Link>
                </Button>
              ) : (
                <Button disabled size="sm" type="button" variant="outline">
                  上一页
                </Button>
              )}
              <span className="text-sm text-muted-foreground">第 {filters.page.toLocaleString("zh-CN")} 页</span>
              {hasNextPage ? (
                <Button asChild size="sm" type="button" variant="outline">
                  <Link href={buildPageHref(filters, filters.page + 1, basePath)}>下一页</Link>
                </Button>
              ) : (
                <Button disabled size="sm" type="button" variant="outline">
                  下一页
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>任务类型</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>消耗点数</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>完成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length > 0 ? (
                    filters.taskType === "AUDIO" ? (
                      (tasks as AdminAudioTask[]).map((task) => <AudioTaskRow key={task.id} task={task} />)
                    ) : (
                      (tasks as AdminAiTask[]).map((task) => (
                        <AiTaskRow
                          key={task.id}
                          task={task}
                          taskType={filters.taskType as Exclude<TaskType, "AUDIO">}
                        />
                      ))
                    )
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={9}>
                        暂无任务。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function AiTaskRow({ task, taskType }: { task: AdminAiTask; taskType: Exclude<TaskType, "AUDIO"> }) {
  return (
    <TableRow>
      <TableCell className="max-w-56">
        <div className="flex flex-col gap-1">
          <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/ai-tasks/${task.id}`}>
            {task.scenario.name}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{task.user?.nickname ?? "未知用户"}</span>
          <span className="text-xs text-muted-foreground">{task.user?.email ?? task.user?.id ?? task.userId}</span>
        </div>
      </TableCell>
      <TableCell>{taskTypeLabel(taskType)}</TableCell>
      <TableCell>{task.providerName ?? task.callLogs[0]?.provider ?? "未记录"}</TableCell>
      <TableCell className="font-mono text-xs">{task.modelName ?? task.callLogs[0]?.model ?? "本地 mock"}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
      </TableCell>
      <TableCell>{aiTaskCredits(task)}</TableCell>
      <TableCell>{formatDate(task.createdAt)}</TableCell>
      <TableCell>{formatDate(task.finishedAt)}</TableCell>
    </TableRow>
  );
}

function AudioTaskRow({ task }: { task: AdminAudioTask }) {
  return (
    <TableRow>
      <TableCell className="max-w-56">
        <div className="flex flex-col gap-1">
          <Link className="font-medium underline-offset-4 hover:underline" href={`/admin/audio/tasks/${task.id}`}>
            {task.typeName}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span>{task.user?.nickname ?? "未知用户"}</span>
          <span className="text-xs text-muted-foreground">{task.user?.email ?? task.userId}</span>
        </div>
      </TableCell>
      <TableCell>{audioTaskSourceName(task)}</TableCell>
      <TableCell>{task.provider}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs">{task.model}</span>
          <span className="text-xs text-muted-foreground">{task.voiceAsset?.name ?? "系统音色"}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(task.status)}>{task.statusName}</Badge>
      </TableCell>
      <TableCell>{audioTaskCredits(task)}</TableCell>
      <TableCell>{formatDate(task.createdAt)}</TableCell>
      <TableCell>{formatDate(task.finishedAt)}</TableCell>
    </TableRow>
  );
}

function audioTaskSourceName(task: AdminAudioTask) {
  const payload = task.providerPayload;
  const source = payload && typeof payload === "object" && "source" in payload ? payload.source : "";

  if (source === "VIDEO_GUIDE") {
    return "视频导学";
  }

  if (source === "EXPERIENCE") {
    return "体验区语音";
  }

  return "语音任务";
}
