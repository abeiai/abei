"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Save, Settings2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  checkAiScenarioDeleteAction,
  deleteAiScenarioAction,
  updateAiScenarioEnabledAction,
  updateAiScenarioModelAction,
  updateAiScenarioPromptAction,
  updateAiScenarioSortAction,
  type AdminAiScenario,
  type AiScenarioDeleteCheck
} from "@/lib/ai-admin-api";

type ModelOption = {
  id: string;
  displayName: string;
  modelName: string;
  providerName: string;
};

type AliasOption = {
  aliasKey: string;
  displayName: string;
  statusName: string;
};

type ModalState =
  | { type: "prompt"; scenario: AdminAiScenario }
  | { type: "model"; scenario: AdminAiScenario }
  | null;

type DeleteState = {
  scenario: AdminAiScenario;
  check: AiScenarioDeleteCheck;
};

export function AdminAiScenarioManager({
  scenarios,
  models,
  aliases
}: {
  scenarios: AdminAiScenario[];
  models: ModelOption[];
  aliases: AliasOption[];
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [deleteCheckError, setDeleteCheckError] = useState("");
  const [checkingScenarioId, setCheckingScenarioId] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();
  const deleteCheckPendingRef = useRef(false);

  function openDelete(scenario: AdminAiScenario) {
    if (deleteCheckPendingRef.current) return;

    deleteCheckPendingRef.current = true;
    setDeleteCheckError("");
    setCheckingScenarioId(scenario.id);
    startChecking(async () => {
      try {
        const result = await checkAiScenarioDeleteAction(scenario.id);

        if (!result.ok) {
          setDeleteCheckError(result.message);
          return;
        }

        setDeleteState({ scenario, check: result.data });
      } catch (error) {
        setDeleteCheckError(error instanceof Error ? error.message : "场景关联检查失败");
      } finally {
        deleteCheckPendingRef.current = false;
        setCheckingScenarioId(null);
      }
    });
  }

  return (
    <>
      {deleteCheckError ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {deleteCheckError}
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>场景名称</TableHead>
                <TableHead>英文名</TableHead>
                <TableHead className="w-40">排序</TableHead>
                <TableHead className="w-36">提示词配置</TableHead>
                <TableHead className="w-36">模型配置</TableHead>
                <TableHead className="w-28">是否启用</TableHead>
                <TableHead className="w-28">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((scenario) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">{scenario.name}</TableCell>
                  <TableCell className="text-muted-foreground">{scenario.slug}</TableCell>
                  <TableCell>
                    <SortOrderEditor scenario={scenario} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setModal({ type: "prompt", scenario })}
                    >
                      <FileText />
                      提示词配置
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => setModal({ type: "model", scenario })}
                    >
                      <Settings2 />
                      模型配置
                    </Button>
                  </TableCell>
                  <TableCell>
                    <EnabledControl scenario={scenario} />
                  </TableCell>
                  <TableCell>
                    <Button
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      disabled={isChecking}
                      size="sm"
                      title={`删除${scenario.name}`}
                      type="button"
                      variant="outline"
                      onClick={() => openDelete(scenario)}
                    >
                      {isChecking && checkingScenarioId === scenario.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {scenarios.length === 0 ? (
                <TableRow>
                  <TableCell className="h-32 text-center text-muted-foreground" colSpan={7}>
                    暂无 AI 场景
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {modal?.type === "prompt" ? (
        <PromptConfigModal scenario={modal.scenario} onClose={() => setModal(null)} />
      ) : null}
      {modal?.type === "model" ? (
        <ModelConfigModal
          aliases={aliases}
          models={models}
          scenario={modal.scenario}
          onClose={() => setModal(null)}
        />
      ) : null}
      {deleteState ? (
        <DeleteScenarioModal
          state={deleteState}
          onClose={() => setDeleteState(null)}
          onDeleted={() => setDeleteState(null)}
        />
      ) : null}
    </>
  );
}

function PromptConfigModal({ scenario, onClose }: { scenario: AdminAiScenario; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        await updateAiScenarioPromptAction(formData);
        router.refresh();
        onClose();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "提示词配置保存失败");
      }
    });
  }

  return (
    <ModalFrame title={`${scenario.name} · 提示词配置`} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <input name="id" type="hidden" value={scenario.id} />
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-prompt`}>Prompt 模板</FieldLabel>
          <Textarea
            id={`${scenario.id}-prompt`}
            name="promptTemplate"
            defaultValue={scenario.promptTemplate}
            rows={12}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-schema`}>输入表单 Schema</FieldLabel>
          <Textarea
            className="font-mono text-sm"
            id={`${scenario.id}-schema`}
            name="inputSchema"
            defaultValue={JSON.stringify(scenario.inputSchema ?? { fields: [] }, null, 2)}
            rows={12}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-variables`}>模板变量</FieldLabel>
          <Textarea
            className="font-mono text-sm"
            id={`${scenario.id}-variables`}
            name="promptVariables"
            defaultValue={scenario.promptVariables
              .map((item) => `${item.name}|${item.label}|${item.required}|${item.placeholder}`)
              .join("\n")}
            rows={6}
            placeholder="topic|主题|true|请输入主题"
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button disabled={isPending} type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            保存配置
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModelConfigModal({
  scenario,
  models,
  aliases,
  onClose
}: {
  scenario: AdminAiScenario;
  models: ModelOption[];
  aliases: AliasOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        await updateAiScenarioModelAction(formData);
        router.refresh();
        onClose();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "模型配置保存失败");
      }
    });
  }

  return (
    <ModalFrame title={`${scenario.name} · 模型配置`} onClose={onClose}>
      <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
        <input name="id" type="hidden" value={scenario.id} />
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-membership-rank`}>最低会员等级（0 为不限）</FieldLabel>
          <Input id={`${scenario.id}-membership-rank`} name="minimumMembershipRank" type="number" min="0" step="1" defaultValue={scenario.minimumMembershipRank ?? 0} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-membership-early`}>提前开放截止时间（北京时间，留空则长期限制）</FieldLabel>
          <Input id={`${scenario.id}-membership-early`} name="membershipEarlyAccessUntil" type="datetime-local" defaultValue={scenario.membershipEarlyAccessUntil ? new Date(new Date(scenario.membershipEarlyAccessUntil).getTime() + 8 * 60 * 60000).toISOString().slice(0, 16) : ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-name`}>场景名称</FieldLabel>
          <Input id={`${scenario.id}-name`} name="name" defaultValue={scenario.name} required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-slug`}>英文名</FieldLabel>
          <Input id={`${scenario.id}-slug`} value={scenario.slug} readOnly />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={`${scenario.id}-description`}>场景描述</FieldLabel>
          <Textarea
            id={`${scenario.id}-description`}
            name="description"
            defaultValue={scenario.description ?? ""}
            rows={3}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-cost`}>预估点数</FieldLabel>
          <Input
            id={`${scenario.id}-cost`}
            min="1"
            name="costCredits"
            type="number"
            defaultValue={scenario.costCredits}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-version`}>模板版本</FieldLabel>
          <Input
            id={`${scenario.id}-version`}
            name="templateVersion"
            defaultValue={scenario.templateVersion ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-default-alias`}>默认模型</FieldLabel>
          <Select
            id={`${scenario.id}-default-alias`}
            name="defaultModelAlias"
            defaultValue={scenario.defaultModelAlias ?? ""}
          >
            <option value="">不绑定模型别名</option>
            {aliases.map((alias) => (
              <option key={alias.aliasKey} value={alias.aliasKey}>
                {alias.displayName} · {alias.statusName}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-fallback-alias`}>Fallback 模型</FieldLabel>
          <Select
            id={`${scenario.id}-fallback-alias`}
            name="fallbackModelAlias"
            defaultValue={scenario.fallbackModelAlias ?? ""}
          >
            <option value="">不启用 Fallback</option>
            {aliases.map((alias) => (
              <option key={alias.aliasKey} value={alias.aliasKey}>
                {alias.displayName} · {alias.statusName}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={`${scenario.id}-capabilities`}>能力要求</FieldLabel>
          <Input
            id={`${scenario.id}-capabilities`}
            name="requiredCapabilities"
            defaultValue={scenario.requiredCapabilities.join(",")}
            placeholder="TEXT,STREAMING"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-default-model`}>旧默认模型</FieldLabel>
          <Select
            id={`${scenario.id}-default-model`}
            name="defaultModelId"
            defaultValue={scenario.defaultModelId ?? ""}
          >
            <option value="">不使用旧模型绑定</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.providerName} · {model.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${scenario.id}-fallback-model`}>旧 Fallback 模型</FieldLabel>
          <Select
            id={`${scenario.id}-fallback-model`}
            name="fallbackModelId"
            defaultValue={scenario.fallbackModelId ?? ""}
          >
            <option value="">不启用旧 Fallback</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.providerName} · {model.displayName}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
        <div className="flex justify-end gap-3 border-t border-border pt-5 md:col-span-2">
          <Button disabled={isPending} type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2 className="animate-spin" /> : <Save />}
            保存配置
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

function DeleteScenarioModal({
  state,
  onClose,
  onDeleted
}: {
  state: DeleteState;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!state.check.canDelete) return;

    setCountdown(5);
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state.check.canDelete, state.check.scenarioId]);

  function confirmDelete() {
    if (!state.check.canDelete || countdown > 0) return;

    setError("");
    startTransition(async () => {
      try {
        const result = await deleteAiScenarioAction(state.scenario.id);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        router.refresh();
        onDeleted();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "删除场景失败");
      }
    });
  }

  const associationRows = [
    ["AI 任务", state.check.associations.aiTasks],
    ["语音任务", state.check.associations.audioTasks],
    ["学员授权", state.check.associations.learnerAuthorizations],
    ["学习活动", state.check.associations.activityEvents],
    ["用量统计", state.check.associations.usageStats],
    ["学习时长", state.check.associations.learningTimeSlices],
    ["每日学习汇总", state.check.associations.dailyLearningSummaries]
  ].filter((item) => Number(item[1]) > 0);

  return (
    <ModalFrame title="删除 AI 场景" onClose={onClose}>
      <div className="grid gap-5">
        <div className="rounded-md border border-border bg-secondary/30 p-4">
          <p className="font-medium">{state.scenario.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.scenario.slug}</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!state.check.canDelete ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">{state.check.message}</p>
            {associationRows.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-border">
                {associationRows.map(([label, count]) => (
                  <div
                    className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                    key={String(label)}
                  >
                    <span>{label}</span>
                    <span className="font-medium">{count} 条</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                我知道了
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              删除后无法恢复，相关 Prompt、表单 Schema 与模型配置会同时移除。
            </p>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button disabled={isPending} type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={countdown > 0 || isPending}
                type="button"
                onClick={confirmDelete}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {countdown > 0 ? `确认删除（${countdown}s）` : "确认删除"}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
      role="dialog"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button aria-label="关闭弹窗" className="size-9 px-0" type="button" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function SortOrderEditor({ scenario }: { scenario: AdminAiScenario }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await updateAiScenarioSortAction(formData);
      router.refresh();
    });
  }

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <input name="id" type="hidden" value={scenario.id} />
      <Input
        aria-label={`${scenario.name}排序`}
        className="h-9 w-20"
        min="0"
        name="sortOrder"
        type="number"
        defaultValue={scenario.sortOrder}
      />
      <Button
        aria-label={`保存${scenario.name}排序`}
        className="size-9 px-0"
        disabled={isPending}
        size="sm"
        title="保存排序"
        type="submit"
        variant="ghost"
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Save />}
      </Button>
    </form>
  );
}

function EnabledControl({ scenario }: { scenario: AdminAiScenario }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleEnabled() {
    const formData = new FormData();
    formData.set("id", scenario.id);
    formData.set("isEnabled", String(!scenario.isEnabled));
    startTransition(async () => {
      await updateAiScenarioEnabledAction(formData);
      router.refresh();
    });
  }

  return (
    <button
      aria-checked={scenario.isEnabled}
      className="disabled:cursor-not-allowed disabled:opacity-50"
      disabled={isPending}
      role="switch"
      type="button"
      onClick={toggleEnabled}
    >
      <Badge variant={scenario.isEnabled ? "secondary" : "muted"}>
        {isPending ? "更新中" : scenario.isEnabled ? "已启用" : "已停用"}
      </Badge>
    </button>
  );
}
