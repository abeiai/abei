"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Eye, Plus, Power, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createAdminOrganizationAction,
  toggleAdminOrganizationStatusAction,
  updateAdminOrganizationAction,
  type AdminOrganizationsResult
} from "@/lib/organizations-api";

type AdminOrganization = AdminOrganizationsResult["organizations"][number];
type ModalState = { type: "create" } | { type: "edit"; organization: AdminOrganization };

function formatPoints(value: number) {
  return `${value.toLocaleString("zh-CN")} 点`;
}

function statusName(status: string) {
  const names: Record<string, string> = {
    ACTIVE: "正常",
    PENDING: "待认证",
    SUSPENDED: "已暂停",
    CLOSED: "已关闭"
  };

  return names[status] ?? status;
}

export function AdminOrganizationManager({ organizations }: { organizations: AdminOrganization[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function closeModal() {
    if (!isPending) {
      setModal(null);
      setMessage("");
    }
  }

  function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const action = modal?.type === "edit" ? updateAdminOrganizationAction : createAdminOrganizationAction;

    setMessage("");
    startTransition(async () => {
      const result = await action(formData);

      if (!result.ok) {
        setMessage(result.message ?? "企业账号保存失败，请稍后重试。");
        return;
      }

      setModal(null);
      router.refresh();
    });
  }

  function toggleStatus(organization: AdminOrganization) {
    const formData = new FormData();
    formData.set("orgId", organization.id);
    formData.set("status", organization.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");

    startTransition(async () => {
      const result = await toggleAdminOrganizationStatusAction(formData);

      if (!result.ok) {
        setMessage(result.message ?? "企业账号状态更新失败，请稍后重试。");
        return;
      }

      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>企业列表</CardTitle>
          <Button onClick={() => setModal({ type: "create" })} type="button">
            <Plus data-icon="inline-start" />
            新建企业账号
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {message && !modal ? <p className="mb-3 text-sm text-destructive">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>企业</TableHead>
                <TableHead>所有者</TableHead>
                <TableHead>成员</TableHead>
                <TableHead>可用点数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.length > 0 ? (
                organizations.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <p className="font-medium">{organization.name}</p>
                      <p className="text-xs text-muted-foreground">{organization.legalName || organization.type}</p>
                    </TableCell>
                    <TableCell>
                      <p>{organization.owner.nickname}</p>
                      <p className="text-xs text-muted-foreground">{organization.owner.email}</p>
                    </TableCell>
                    <TableCell>{organization.memberCount}</TableCell>
                    <TableCell>{formatPoints(organization.wallet?.balanceAvailable ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant={organization.status === "ACTIVE" ? "secondary" : "muted"}>
                        {statusName(organization.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/organizations/${organization.id}`}>
                            <Eye data-icon="inline-start" />
                            查看
                          </Link>
                        </Button>
                        <Button onClick={() => setModal({ organization, type: "edit" })} size="sm" type="button" variant="outline">
                          <Edit3 data-icon="inline-start" />
                          编辑
                        </Button>
                        <Button disabled={isPending} onClick={() => toggleStatus(organization)} size="sm" type="button" variant="outline">
                          <Power data-icon="inline-start" />
                          {organization.status === "ACTIVE" ? "禁用" : "启用"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={6}>
                    暂无企业账号。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {modal ? (
        <OrganizationModal isPending={isPending} message={message} modal={modal} onClose={closeModal} onSubmit={submitOrganization} />
      ) : null}
    </>
  );
}

function OrganizationModal({
  isPending,
  message,
  modal,
  onClose,
  onSubmit
}: {
  isPending: boolean;
  message: string;
  modal: ModalState;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const organization = modal.type === "edit" ? modal.organization : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">{organization ? "编辑企业账号" : "新建企业账号"}</h2>
            <p className="text-sm text-muted-foreground">
              新建时需要指定一个已存在的前台用户作为企业所有者。
            </p>
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

        <form className="grid gap-5 px-6 py-5 md:grid-cols-2" onSubmit={onSubmit}>
          {organization ? <input name="orgId" type="hidden" value={organization.id} /> : null}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-name">企业名称</FieldLabel>
              <Input id="organization-name" name="name" defaultValue={organization?.name ?? ""} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-legal-name">企业法定名称</FieldLabel>
              <Input id="organization-legal-name" name="legalName" defaultValue={organization?.legalName ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-owner-email">所有者邮箱</FieldLabel>
              <Input
                disabled={Boolean(organization)}
                id="organization-owner-email"
                name="ownerEmail"
                defaultValue={organization?.owner.email ?? ""}
                placeholder="owner@example.com"
                required={!organization}
                type="email"
              />
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-type">组织类型</FieldLabel>
              <Input id="organization-type" name="type" defaultValue={organization?.type ?? "企业"} />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-industry">行业</FieldLabel>
              <Input id="organization-industry" name="industry" defaultValue={organization?.industry ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-employee-size">企业规模</FieldLabel>
              <Input id="organization-employee-size" name="employeeSize" defaultValue={organization?.employeeSize ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-status">启用/禁用状态</FieldLabel>
              <Select id="organization-status" name="status" defaultValue={organization?.status ?? "ACTIVE"}>
                <option value="ACTIVE">启用</option>
                <option value="SUSPENDED">禁用</option>
                <option value="PENDING">待认证</option>
                <option value="CLOSED">已关闭</option>
              </Select>
            </Field>
          </FieldGroup>
          {message ? <p className="md:col-span-2 text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "保存中..." : organization ? "保存企业账号" : "新建企业账号"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
