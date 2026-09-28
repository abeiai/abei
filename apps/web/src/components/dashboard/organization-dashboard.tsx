"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  Plus,
  Search,
  Trash2,
  UserPlus,
  WalletCards,
  X
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addOrganizationMemberAction,
  adjustOrganizationMemberQuotaAction,
  createOrganizationAction,
  updateOrganizationMemberAction,
  type ActionResult,
  type OrganizationDetail,
  type OrganizationMember,
  type UserOrganization,
  type UserOrganizationsResult
} from "@/lib/organizations-api";
import { publicEmailLabel } from "@/lib/user-identity";
import { cn } from "@/lib/utils";

type ModalState =
  | { type: "create" }
  | { type: "recharge"; organization: OrganizationDetail }
  | { type: "add-member"; organization: OrganizationDetail }
  | { type: "adjust"; organization: OrganizationDetail; member: OrganizationMember }
  | { type: "edit-member"; organization: OrganizationDetail; member: OrganizationMember }
  | { type: "delete-member"; organization: OrganizationDetail; member: OrganizationMember };

type SearchUser = {
  id: string;
  email: string;
  phone: string | null;
  nickname: string;
  isCurrentUser: boolean;
};

function formatPoints(value: number) {
  return `${value.toLocaleString("zh-CN")} 点`;
}

function identityName(organization: UserOrganization) {
  if (organization.memberStatus === "REMOVED") {
    return "已退出";
  }

  if (organization.role === "OWNER") {
    return "创建人";
  }

  if (organization.role === "ADMIN" || organization.role === "FINANCE_ADMIN") {
    return "管理员";
  }

  return "成员";
}

function canManage(organization: Pick<UserOrganization, "role" | "memberStatus">) {
  return organization.memberStatus === "ACTIVE" && (organization.role === "OWNER" || organization.role === "ADMIN");
}

function memberRoleName(role: string) {
  const names: Record<string, string> = {
    OWNER: "创建人",
    ADMIN: "管理员",
    FINANCE_ADMIN: "财务管理员",
    MEMBER: "成员"
  };

  return names[role] ?? role;
}

function memberStatusName(status: string) {
  const names: Record<string, string> = {
    INVITED: "待加入",
    ACTIVE: "启用",
    SUSPENDED: "禁用",
    REMOVED: "已退出"
  };

  return names[status] ?? status;
}

function displayOrganizationType(type: string) {
  return type === "企业" ? "组织" : type;
}

function memberQuota(member: OrganizationMember) {
  return member.quotas.reduce(
    (summary, quota) => {
      summary.totalQuota += quota.totalQuota;
      summary.usedQuota += quota.usedQuota;
      summary.remainingQuota += quota.remainingQuota;
      return summary;
    },
    {
      totalQuota: 0,
      usedQuota: 0,
      remainingQuota: 0
    }
  );
}

export function OrganizationDashboard({
  organizations,
  selectedOrganization
}: {
  organizations: UserOrganizationsResult;
  selectedOrganization: OrganizationDetail | null;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedSummary = selectedOrganization
    ? organizations.organizations.find((organization) => organization.id === selectedOrganization.id)
    : null;
  const selectedCanManage = selectedSummary ? canManage(selectedSummary) : false;

  function closeModal() {
    if (!isPending) {
      setModal(null);
      setMessage("");
    }
  }

  function runAction(action: (formData: FormData) => Promise<ActionResult>, formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const result = await action(formData);

      if (!result.ok) {
        setMessage(result.message ?? "请求处理失败。");
        return;
      }

      setModal(null);
      router.refresh();
    });
  }

  function toggleMember(organization: OrganizationDetail, member: OrganizationMember) {
    const formData = new FormData();
    formData.set("orgId", organization.id);
    formData.set("memberId", member.id);
    formData.set("role", member.role);
    formData.set("status", member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
    formData.set("title", member.title ?? "");
    runAction(updateOrganizationMemberAction, formData);
  }

  return (
    <section className="flex w-full flex-col gap-6 px-5 py-8">
      {!organizations.enabled ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">组织账号体系未启用。</CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl font-semibold tracking-normal">组织账号</h2>
              <p className="text-sm text-muted-foreground">统一管理组织成员、成员点数与组织充值入口。</p>
            </div>
            <Button onClick={() => setModal({ type: "create" })} type="button">
              <Plus data-icon="inline-start" />
              创建组织账号
            </Button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              {organizations.organizations.length > 0 ? (
                organizations.organizations.map((organization) => {
                  const manageable = canManage(organization);
                  const isActive = selectedOrganization?.id === organization.id;
                  const content = (
                    <OrganizationCard
                      isActive={isActive}
                      isClickable={manageable}
                      organization={organization}
                    />
                  );

                  return manageable ? (
                    <Link href={`/dashboard/organizations?org=${organization.id}`} key={organization.id}>
                      {content}
                    </Link>
                  ) : (
                    <div key={organization.id}>{content}</div>
                  );
                })
              ) : (
                <Card>
                  <CardContent className="py-8 text-sm text-muted-foreground">
                    暂无组织账号，可以先创建一个组织。
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="min-h-[560px]">
              {selectedOrganization && selectedCanManage ? (
                <>
                  <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle>{selectedOrganization.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        成员列表 · {selectedOrganization.members.length.toLocaleString("zh-CN")} 个账号
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setModal({ type: "recharge", organization: selectedOrganization })} type="button" variant="outline">
                        <WalletCards data-icon="inline-start" />
                        统一充值
                      </Button>
                      <Button onClick={() => setModal({ type: "add-member", organization: selectedOrganization })} type="button">
                        <UserPlus data-icon="inline-start" />
                        新增成员
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <div className="grid gap-3 md:grid-cols-3">
                      <MetricCard label="组织可用点数" value={formatPoints(selectedOrganization.wallet?.balanceAvailable ?? 0)} />
                      <MetricCard label="已分配成员点数" value={formatPoints(selectedOrganization.quotas.reduce((sum, quota) => sum + quota.totalQuota, 0))} />
                      <MetricCard label="已消耗点数" value={formatPoints(selectedOrganization.wallet?.totalConsumed ?? 0)} />
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>成员</TableHead>
                            <TableHead>身份</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>剩余点数</TableHead>
                            <TableHead>已用点数</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrganization.members.map((member) => {
                            const quota = memberQuota(member);
                            const isOwner = member.role === "OWNER";

                            return (
                              <TableRow key={member.id}>
                                <TableCell>
                                  <p className="font-medium">{member.nickname}</p>
                                  <p className="text-xs text-muted-foreground">{publicEmailLabel(member.email)}</p>
                                  {member.phone ? <p className="text-xs text-muted-foreground">{member.phone}</p> : null}
                                </TableCell>
                                <TableCell>{memberRoleName(member.role)}</TableCell>
                                <TableCell>
                                  <Badge variant={member.status === "ACTIVE" ? "secondary" : "muted"}>
                                    {memberStatusName(member.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatPoints(quota.remainingQuota)}</TableCell>
                                <TableCell>{formatPoints(quota.usedQuota)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button disabled={isPending || isOwner} onClick={() => toggleMember(selectedOrganization, member)} size="sm" type="button" variant="outline">
                                      {member.status === "ACTIVE" ? "禁用" : "启用"}
                                    </Button>
                                    <Button disabled={isPending || member.status === "REMOVED"} onClick={() => setModal({ type: "adjust", organization: selectedOrganization, member })} size="sm" type="button" variant="outline">
                                      增扣点
                                    </Button>
                                    <Button disabled={isPending || isOwner} onClick={() => setModal({ type: "edit-member", organization: selectedOrganization, member })} size="sm" type="button" variant="outline">
                                      编辑
                                    </Button>
                                    <Button disabled={isPending || isOwner} onClick={() => setModal({ type: "delete-member", organization: selectedOrganization, member })} size="sm" type="button" variant="outline">
                                      删除
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {message && !modal ? <p className="text-sm text-destructive">{message}</p> : null}
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex min-h-[560px] flex-col items-center justify-center gap-4 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-secondary">
                    <Building2 className="size-6" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-lg font-semibold">请选择可管理的组织</p>
                    <p className="max-w-md text-sm leading-6 text-muted-foreground">
                      创建人或管理员可以进入成员列表，进行统一充值、新增成员和成员点数管理。
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </>
      )}

      {modal ? (
        <OrganizationModal
          isPending={isPending}
          message={message}
          modal={modal}
          onClose={closeModal}
          onRunAction={runAction}
        />
      ) : null}
    </section>
  );
}

function OrganizationCard({
  isActive,
  isClickable,
  organization
}: {
  isActive: boolean;
  isClickable: boolean;
  organization: UserOrganization;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 transition-colors",
        isActive ? "border-primary/40 bg-secondary/60" : null,
        isClickable ? "hover:border-primary/40 hover:bg-secondary/50" : "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{organization.name}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{organization.legalName || "未填写全称"}</p>
        </div>
        <Badge variant={organization.memberStatus === "ACTIVE" ? "secondary" : "muted"}>
          {identityName(organization)}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-muted-foreground">类型</p>
          <p className="mt-1 font-medium">{displayOrganizationType(organization.type)}</p>
        </div>
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-muted-foreground">开通人数</p>
          <p className="mt-1 font-medium">{organization.memberCount.toLocaleString("zh-CN")}</p>
        </div>
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-muted-foreground">可用点数</p>
          <p className="mt-1 font-medium">{formatPoints(organization.wallet?.balanceAvailable ?? 0)}</p>
        </div>
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-muted-foreground">我的额度</p>
          <p className="mt-1 font-medium">{formatPoints(organization.quota.remainingQuota)}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function OrganizationModal({
  isPending,
  message,
  modal,
  onClose,
  onRunAction
}: {
  isPending: boolean;
  message: string;
  modal: ModalState;
  onClose: () => void;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <ModalTitle modal={modal} />
          <Button aria-label="关闭弹窗" className="size-9 px-0" disabled={isPending} onClick={onClose} size="sm" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>
        {modal.type === "create" ? (
          <CreateOrganizationForm isPending={isPending} message={message} onRunAction={onRunAction} />
        ) : null}
        {modal.type === "recharge" ? <RechargePanel organization={modal.organization} /> : null}
        {modal.type === "add-member" ? (
          <AddMemberForm isPending={isPending} message={message} onRunAction={onRunAction} organization={modal.organization} />
        ) : null}
        {modal.type === "adjust" ? (
          <AdjustMemberForm isPending={isPending} member={modal.member} message={message} onRunAction={onRunAction} organization={modal.organization} />
        ) : null}
        {modal.type === "edit-member" ? (
          <EditMemberForm isPending={isPending} member={modal.member} message={message} onRunAction={onRunAction} organization={modal.organization} />
        ) : null}
        {modal.type === "delete-member" ? (
          <DeleteMemberForm isPending={isPending} member={modal.member} message={message} onRunAction={onRunAction} organization={modal.organization} />
        ) : null}
      </div>
    </div>
  );
}

function ModalTitle({ modal }: { modal: ModalState }) {
  const titles: Record<ModalState["type"], string> = {
    create: "创建组织账号",
    recharge: "统一充值",
    "add-member": "新增成员",
    adjust: "增扣点",
    "edit-member": "编辑成员",
    "delete-member": "删除成员"
  };
  const descriptions: Record<ModalState["type"], string> = {
    create: "创建后当前账号会成为组织创建人。",
    recharge: "组织统一购买点数，成员使用时从组织余额扣除。",
    "add-member": "搜索已注册用户，加入本组织并分配初始点数。",
    adjust: "增加或扣减成员可用点数，不直接改变组织钱包余额。",
    "edit-member": "调整成员身份、职位和状态。",
    "delete-member": "删除后成员将不能继续使用本组织点数。",
  };

  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-xl font-semibold">{titles[modal.type]}</h2>
      <p className="text-sm text-muted-foreground">{descriptions[modal.type]}</p>
    </div>
  );
}

function CreateOrganizationForm({
  isPending,
  message,
  onRunAction
}: {
  isPending: boolean;
  message: string;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRunAction(createOrganizationAction, new FormData(event.currentTarget));
  }

  return (
    <form className="grid gap-5 px-6 py-5 md:grid-cols-2" onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="org-name">组织名称</FieldLabel>
        <Input id="org-name" name="name" required />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-type">组织类型</FieldLabel>
        <Input id="org-type" name="type" defaultValue="组织" />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-legal">组织全称</FieldLabel>
        <Input id="org-legal" name="legalName" />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-industry">行业</FieldLabel>
        <Input id="org-industry" name="industry" />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-size">开通人数</FieldLabel>
        <Input id="org-size" name="employeeSize" placeholder="例如 20" />
      </Field>
      {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
        <Button disabled={isPending} type="submit">
          {isPending ? "创建中..." : "创建组织账号"}
        </Button>
      </div>
    </form>
  );
}

function RechargePanel({ organization }: { organization: OrganizationDetail }) {
  const [method, setMethod] = useState<"ALIPAY" | "WECHAT_PAY" | "BANK_TRANSFER">("ALIPAY");

  return (
    <div className="grid gap-5 px-6 py-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-lg border border-border bg-secondary/30 p-5">
        <p className="text-sm text-muted-foreground">当前组织</p>
        <p className="mt-2 text-2xl font-semibold">{organization.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{organization.legalName || "未填写组织全称"}</p>
        <div className="mt-5 rounded-md bg-background p-4">
          <p className="text-sm text-muted-foreground">当前可用点数</p>
          <p className="mt-2 text-xl font-semibold">{formatPoints(organization.wallet?.balanceAvailable ?? 0)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="recharge-amount">充值金额</FieldLabel>
          <Input id="recharge-amount" inputMode="decimal" min="0.01" placeholder="请输入任意充值金额" type="number" />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["ALIPAY", "支付宝"],
            ["WECHAT_PAY", "微信支付"],
            ["BANK_TRANSFER", "对公转账"]
          ].map(([value, label]) => (
            <button
              className={cn(
                "rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                method === value ? "border-primary bg-secondary text-foreground" : "border-border bg-background text-muted-foreground"
              )}
              key={value}
              onClick={() => setMethod(value as typeof method)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {method === "BANK_TRANSFER" ? (
          <div className="rounded-lg border border-border bg-background p-4 text-sm leading-7">
            <p className="font-medium">对公账号</p>
            <p className="text-muted-foreground">户名：南京阿贝智能科技有限公司</p>
            <p className="text-muted-foreground">开户行：请在后台支付配置中维护</p>
            <p className="text-muted-foreground">账号：请联系财务确认后打款</p>
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background p-6 text-center">
            <CreditCard className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">组织支付订单接口接入后，这里会展示真实支付二维码。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddMemberForm({
  isPending,
  message,
  onRunAction,
  organization
}: {
  isPending: boolean;
  message: string;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
  organization: OrganizationDetail;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function searchUsers() {
    const keyword = query.trim();

    if (keyword.length < 2) {
      setSearchMessage("请至少输入 2 个字符。");
      return;
    }

    setIsSearching(true);
    setSearchMessage("");
    try {
      const response = await fetch(`/api/organizations/users/search?q=${encodeURIComponent(keyword)}`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok || payload.code !== 0) {
        setSearchMessage(payload.message ?? "搜索失败。");
        setUsers([]);
        return;
      }

      setUsers(payload.data as SearchUser[]);
      if ((payload.data as SearchUser[]).length === 0) {
        setSearchMessage("没有找到匹配的已注册用户。");
      }
    } finally {
      setIsSearching(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("orgId", organization.id);

    if (selectedUser) {
      formData.set("userId", selectedUser.id);
      formData.set("email", selectedUser.email);
      formData.set("phone", selectedUser.phone ?? "");
    }

    onRunAction(addOrganizationMemberAction, formData);
  }

  return (
    <form className="flex flex-col gap-5 px-6 py-5" onSubmit={submit}>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索成员 ID、邮箱或手机"
        />
        <Button disabled={isSearching} onClick={searchUsers} type="button" variant="outline">
          <Search data-icon="inline-start" />
          {isSearching ? "搜索中..." : "搜索"}
        </Button>
      </div>
      {searchMessage ? <p className="text-sm text-muted-foreground">{searchMessage}</p> : null}
      {users.length > 0 ? (
        <div className="grid gap-2">
          {users.map((user) => (
            <button
              className={cn(
                "rounded-lg border border-border p-3 text-left transition-colors",
                selectedUser?.id === user.id ? "border-primary bg-secondary" : "bg-background hover:bg-secondary/60"
              )}
              key={user.id}
              onClick={() => setSelectedUser(user)}
              type="button"
            >
              <p className="font-medium">{user.nickname}</p>
              <p className="text-xs text-muted-foreground">
                {publicEmailLabel(user.email)} · {user.phone || "未绑定手机"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{user.id}</p>
            </button>
          ))}
        </div>
      ) : null}
      <FieldGroup className="grid gap-4 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="new-member-role">身份</FieldLabel>
          <Select id="new-member-role" name="role" defaultValue="MEMBER">
            <option value="MEMBER">成员</option>
            <option value="ADMIN">管理员</option>
            <option value="FINANCE_ADMIN">财务管理员</option>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="new-member-title">职位</FieldLabel>
          <Input id="new-member-title" name="title" placeholder="可选" />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-member-quota">分配点数</FieldLabel>
          <Input id="new-member-quota" name="initialQuota" defaultValue="0" inputMode="numeric" min="0" type="number" />
        </Field>
      </FieldGroup>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button disabled={isPending || !selectedUser} type="submit">
          {isPending ? "加入中..." : "加入本组织"}
        </Button>
      </div>
    </form>
  );
}

function AdjustMemberForm({
  isPending,
  member,
  message,
  onRunAction,
  organization
}: {
  isPending: boolean;
  member: OrganizationMember;
  message: string;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
  organization: OrganizationDetail;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const direction = String(formData.get("direction") ?? "increase");
    const amount = Math.abs(Number(formData.get("points") ?? 0));
    formData.set("orgId", organization.id);
    formData.set("memberId", member.id);
    formData.set("amount", String(direction === "decrease" ? -amount : amount));
    onRunAction(adjustOrganizationMemberQuotaAction, formData);
  }

  return (
    <form className="flex flex-col gap-5 px-6 py-5" onSubmit={submit}>
      <div className="rounded-lg border border-border bg-secondary/40 p-4">
        <p className="font-medium">{member.nickname}</p>
        <p className="text-sm text-muted-foreground">{member.email}</p>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="quota-direction">操作</FieldLabel>
          <Select id="quota-direction" name="direction" defaultValue="increase">
            <option value="increase">增加点数</option>
            <option value="decrease">扣减点数</option>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="quota-points">点数</FieldLabel>
          <Input id="quota-points" name="points" inputMode="numeric" min="1" required type="number" />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="quota-remark">备注</FieldLabel>
          <Input id="quota-remark" name="remark" placeholder="例如 项目预算调整" />
        </Field>
      </FieldGroup>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button disabled={isPending} type="submit">
          {isPending ? "处理中..." : "确认调整"}
        </Button>
      </div>
    </form>
  );
}

function EditMemberForm({
  isPending,
  member,
  message,
  onRunAction,
  organization
}: {
  isPending: boolean;
  member: OrganizationMember;
  message: string;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
  organization: OrganizationDetail;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("orgId", organization.id);
    formData.set("memberId", member.id);
    onRunAction(updateOrganizationMemberAction, formData);
  }

  return (
    <form className="grid gap-5 px-6 py-5 md:grid-cols-2" onSubmit={submit}>
      <Field>
        <FieldLabel htmlFor="edit-member-role">身份</FieldLabel>
        <Select id="edit-member-role" name="role" defaultValue={member.role}>
          <option value="ADMIN">管理员</option>
          <option value="FINANCE_ADMIN">财务管理员</option>
          <option value="MEMBER">成员</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="edit-member-status">状态</FieldLabel>
        <Select id="edit-member-status" name="status" defaultValue={member.status}>
          <option value="ACTIVE">启用</option>
          <option value="SUSPENDED">禁用</option>
          <option value="REMOVED">已退出</option>
        </Select>
      </Field>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor="edit-member-title">职位</FieldLabel>
        <Input id="edit-member-title" name="title" defaultValue={member.title ?? ""} />
      </Field>
      {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-5 md:col-span-2">
        <Button disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存成员"}
        </Button>
      </div>
    </form>
  );
}

function DeleteMemberForm({
  isPending,
  member,
  message,
  onRunAction,
  organization
}: {
  isPending: boolean;
  member: OrganizationMember;
  message: string;
  onRunAction: (action: (formData: FormData) => Promise<ActionResult>, formData: FormData) => void;
  organization: OrganizationDetail;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("orgId", organization.id);
    formData.set("memberId", member.id);
    formData.set("role", member.role);
    formData.set("status", "REMOVED");
    formData.set("title", member.title ?? "");
    onRunAction(updateOrganizationMemberAction, formData);
  }

  return (
    <form className="flex flex-col gap-5 px-6 py-5" onSubmit={submit}>
      <div className="rounded-lg border border-border bg-secondary/40 p-4">
        <p className="font-medium">{member.nickname}</p>
        <p className="text-sm text-muted-foreground">{member.email}</p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        删除后该成员会变为已退出状态，历史用量和账本仍会保留。
      </p>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button disabled={isPending} type="submit" variant="outline">
          <Trash2 data-icon="inline-start" />
          {isPending ? "删除中..." : "确认删除"}
        </Button>
      </div>
    </form>
  );
}
