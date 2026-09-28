"use client";

import { type FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Eye, UserRoundCheck, UserRoundX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  rechargeUserCreditsAction,
  updateUserStatusAction,
  type AdminUserListItem
} from "@/lib/admin-users-api";

type RechargeReasonType = "TEST" | "REWARD" | "COMPENSATION" | "OTHER";

const reasonOptions: Array<{
  label: string;
  value: RechargeReasonType;
}> = [
  {
    label: "测试",
    value: "TEST"
  },
  {
    label: "奖励",
    value: "REWARD"
  },
  {
    label: "补偿",
    value: "COMPENSATION"
  },
  {
    label: "其他",
    value: "OTHER"
  }
];

function formatDate(value: string | null) {
  if (!value) {
    return "从未登录";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function statusVariant(status: AdminUserListItem["status"]) {
  return status === "ACTIVE" ? "secondary" as const : "muted" as const;
}

export function UserRechargeTable({ users }: { users: AdminUserListItem[] }) {
  const [activeUser, setActiveUser] = useState<AdminUserListItem | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户 ID</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>点数余额</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead>最近登录</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length > 0 ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="max-w-48 truncate font-mono text-xs">{user.id}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.nickname}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(user.status)}>{user.statusName}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.availableCredits.toLocaleString("zh-CN")} 点
                    {user.frozenCredits > 0 ? ` / 冻结 ${user.frozenCredits.toLocaleString("zh-CN")}` : ""}
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/users/${user.id}`}>
                          <Eye data-icon="inline-start" />
                          详情
                        </Link>
                      </Button>
                      <Button onClick={() => setActiveUser(user)} size="sm" type="button" variant="outline">
                        <Coins data-icon="inline-start" />
                        充值
                      </Button>
                      <form action={updateUserStatusAction}>
                        <input name="id" type="hidden" value={user.id} />
                        <input
                          name="status"
                          type="hidden"
                          value={user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"}
                        />
                        <Button size="sm" variant="outline" type="submit">
                          {user.status === "ACTIVE" ? (
                            <UserRoundX data-icon="inline-start" />
                          ) : (
                            <UserRoundCheck data-icon="inline-start" />
                          )}
                          {user.status === "ACTIVE" ? "禁用" : "启用"}
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={8}>
                  暂无用户。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {activeUser ? <RechargeModal onClose={() => setActiveUser(null)} user={activeUser} /> : null}
    </>
  );
}

function RechargeModal({ onClose, user }: { onClose: () => void; user: AdminUserListItem }) {
  const router = useRouter();
  const [reasonType, setReasonType] = useState<RechargeReasonType>("TEST");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitRecharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setMessage("");
    startTransition(async () => {
      try {
        await rechargeUserCreditsAction(formData);
        onClose();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "充值失败，请稍后重试。");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">用户充值</h2>
            <p className="text-sm text-muted-foreground">充值后立即增加可用点数，并写入充值流水。</p>
          </div>
          <Button
            aria-label="关闭弹窗"
            className="size-9 px-0"
            disabled={isPending}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form className="flex flex-col gap-5 px-6 py-5" onSubmit={submitRecharge}>
          <input name="id" type="hidden" value={user.id} />
          <div className="grid gap-3 rounded-md border border-border bg-secondary/30 p-4 text-sm md:grid-cols-3">
            <Info label="用户 ID" value={user.id} mono />
            <Info label="昵称" value={user.nickname} />
            <Info label="邮箱" value={user.email} />
          </div>

          <Field>
            <FieldLabel htmlFor={`${user.id}-recharge-amount`}>充值点数</FieldLabel>
            <Input
              autoFocus
              id={`${user.id}-recharge-amount`}
              min={1}
              name="amount"
              placeholder="例如 1000"
              required
              step={1}
              type="number"
            />
            <FieldDescription>只支持正整数，充值会计入累计充值点数。</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>充值原因</FieldLabel>
            <div className="grid gap-2 md:grid-cols-4">
              {reasonOptions.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  key={option.value}
                >
                  <input
                    checked={reasonType === option.value}
                    name="reasonType"
                    onChange={() => setReasonType(option.value)}
                    type="radio"
                    value={option.value}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Field>

          {reasonType === "OTHER" ? (
            <Field>
              <FieldLabel htmlFor={`${user.id}-recharge-reason`}>其他原因说明</FieldLabel>
              <Input
                id={`${user.id}-recharge-reason`}
                maxLength={200}
                minLength={2}
                name="reason"
                placeholder="请输入具体充值原因"
                required
              />
            </Field>
          ) : null}

          {message ? <p className="text-sm text-destructive">{message}</p> : null}

          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit">
              <Coins data-icon="inline-start" />
              {isPending ? "充值中..." : "确认充值"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Info({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "truncate font-medium"}>{value}</span>
    </div>
  );
}
