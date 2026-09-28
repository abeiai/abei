"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  Camera,
  Hash,
  ImageUp,
  LockKeyhole,
  LogOut,
  Mail,
  Phone,
  UserRound,
  X
} from "lucide-react";

import { ActionToast } from "@/components/ui/action-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  bindPhoneAction,
  changeEmailAction,
  changePasswordAction,
  resetPasswordWithTokenAction,
  sendBindPhoneCodeAction,
  sendChangeEmailCodeAction,
  sendResetPasswordEmailCodeAction,
  sendResetPasswordPhoneCodeAction,
  updateProfileAction,
  uploadAvatarAction,
  userLogoutAction,
  verifyPasswordAction,
  verifyPasswordResetCodeAction,
  type AuthActionState,
  type PublicUser
} from "@/lib/auth-actions";
import { accountProfileIdentityRows } from "@/lib/user-identity";

const initialState: AuthActionState = {};
const dialogButtonClass = "h-11 w-32 rounded-md text-base font-medium";
const dialogPrimaryButtonClass = cn(dialogButtonClass, "bg-[#05c46b] text-white hover:bg-[#04b964]");
const dialogSecondaryButtonClass = cn(dialogButtonClass, "border-border bg-white text-foreground hover:bg-white");
const dialogInputClass =
  "h-12 rounded-none border-[#dfe3e8] bg-white text-base shadow-none focus:border-[#7c8aa3] focus:ring-0";
const profileRowActionClass =
  "text-sm font-medium text-[#526a9c] underline-offset-4 transition-colors hover:text-[#2f4778] hover:underline";

type ProfileDialog = "avatar" | "nickname" | "email" | "password" | "phone";

function displayEmail(email: string) {
  return email.endsWith("@users.xueleai.local") ? "未绑定邮箱" : email;
}

function maskPhone(phone: string | null) {
  if (!phone) {
    return "未绑定";
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function userInitial(user: PublicUser) {
  return (user.nickname?.trim() || user.email || "用").slice(0, 1).toUpperCase();
}

function resetEmailValue(user: PublicUser) {
  return user.email.endsWith("@users.xueleai.local") ? "" : user.email;
}

export function ProfileSettingsPanel({ user }: { user: PublicUser }) {
  const [activeDialog, setActiveDialog] = useState<ProfileDialog | null>(null);
  const identityRows = accountProfileIdentityRows(user);

  return (
    <section className="flex w-full justify-center px-5 py-10">
      <div className="w-full max-w-5xl bg-background px-2 py-2 md:px-8 md:py-6">
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">个人资料</h1>

        <div className="mt-12 flex justify-center">
          <button
            className="group relative flex size-24 items-center justify-center overflow-hidden rounded-full bg-secondary text-3xl font-semibold text-muted-foreground transition-colors hover:bg-secondary/80"
            onClick={() => setActiveDialog("avatar")}
            type="button"
          >
            <span className="sr-only">修改头像</span>
            <AvatarPreview user={user} />
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ImageUp className="mr-1 size-4" />
              更换
            </span>
          </button>
        </div>

        <div className="mt-12 divide-y divide-[#e8ebef]">
          <ProfileInfoRow
            icon={UserRound}
            label="头像"
            value={user.avatarUrl ? "已上传" : "未上传"}
            actionLabel="修改"
            onAction={() => setActiveDialog("avatar")}
          />
          {identityRows.map((row) => (
            <ProfileInfoRow
              actionLabel={row.key === "nickname" ? "修改" : undefined}
              icon={row.key === "accountId" ? Hash : UserRound}
              key={row.key}
              label={row.label}
              onAction={row.key === "nickname" ? () => setActiveDialog("nickname") : undefined}
              value={row.value}
            />
          ))}
          <ProfileInfoRow
            icon={Mail}
            label="邮箱"
            value={displayEmail(user.email)}
            actionLabel="修改"
            onAction={() => setActiveDialog("email")}
          />
          <ProfileInfoRow
            icon={LockKeyhole}
            label="密码"
            value="已设置"
            actionLabel="修改"
            onAction={() => setActiveDialog("password")}
          />
          <ProfileInfoRow
            icon={Phone}
            label="手机"
            value={maskPhone(user.phone)}
            actionLabel={user.phone ? "修改" : "绑定"}
            onAction={() => setActiveDialog("phone")}
          />
        </div>
      </div>

      {activeDialog === "avatar" ? (
        <AvatarDialog onClose={() => setActiveDialog(null)} user={user} />
      ) : null}
      {activeDialog === "nickname" ? (
        <NicknameDialog onClose={() => setActiveDialog(null)} user={user} />
      ) : null}
      {activeDialog === "email" ? (
        <EmailDialog onClose={() => setActiveDialog(null)} user={user} />
      ) : null}
      {activeDialog === "password" ? (
        <PasswordDialog onClose={() => setActiveDialog(null)} user={user} />
      ) : null}
      {activeDialog === "phone" ? (
        <PhoneDialog onClose={() => setActiveDialog(null)} user={user} />
      ) : null}
    </section>
  );
}

function ProfileInfoRow({
  actionLabel,
  icon: Icon,
  label,
  onAction,
  value
}: {
  actionLabel?: string;
  icon: typeof UserRound;
  label: string;
  onAction?: () => void;
  value: string;
}) {
  return (
    <div className="grid min-h-20 grid-cols-1 items-center gap-3 py-4 text-base sm:grid-cols-[180px_minmax(0,1fr)_80px] sm:gap-6">
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <Icon className="size-5" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 break-words text-base font-medium text-foreground">{value}</div>
      {actionLabel && onAction ? (
        <button className={profileRowActionClass} onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ProfileDialogShell({
  children,
  onClose,
  title
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[92vh] min-h-[520px] w-full max-w-4xl flex-col rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between px-8 py-7">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">{title}</h2>
          <button
            aria-label="关闭"
            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="size-8 stroke-[1.6]" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8 md:px-12">{children}</div>
      </div>
    </div>
  );
}

function DialogFooter({
  cancelLabel = "取消",
  confirmLabel,
  disabled,
  onCancel
}: {
  cancelLabel?: string;
  confirmLabel: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-auto flex justify-center gap-4 pt-10">
      <Button className={dialogPrimaryButtonClass} disabled={disabled} type="submit">
        {confirmLabel}
      </Button>
      <Button className={dialogSecondaryButtonClass} onClick={onCancel} type="button" variant="outline">
        {cancelLabel}
      </Button>
    </div>
  );
}

function AvatarPreview({ user }: { user: PublicUser }) {
  if (user.avatarUrl) {
    return <img alt="当前头像" className="size-full object-cover" src={user.avatarUrl} />;
  }

  return <span>{userInitial(user)}</span>;
}

function AvatarDialog({ onClose, user }: { onClose: () => void; user: PublicUser }) {
  const [state, formAction, isPending] = useActionState(uploadAvatarAction, initialState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
    const timer = window.setTimeout(onClose, 500);

    return () => window.clearTimeout(timer);
  }, [onClose, router, state.success]);

  return (
    <ProfileDialogShell onClose={onClose} title="修改头像">
      <ActionToast state={state} />
      <form
        action={formAction}
        className="flex flex-1 flex-col items-center justify-center gap-8"
        encType="multipart/form-data"
        ref={formRef}
      >
        <label className="group relative flex size-32 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-secondary text-4xl font-semibold text-muted-foreground transition-colors hover:bg-secondary/80">
          <input
            accept="image/*"
            className="sr-only"
            id="avatar-file-input"
            name="file"
            onChange={() => formRef.current?.requestSubmit()}
            type="file"
          />
          <AvatarPreview user={user} />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="mr-2 size-5" />
            {isPending ? "上传中" : "上传头像"}
          </span>
        </label>
        <Button asChild className={dialogSecondaryButtonClass} variant="outline">
          <label htmlFor="avatar-file-input">{isPending ? "上传中" : "点击头像上传"}</label>
        </Button>
      </form>
    </ProfileDialogShell>
  );
}

function NicknameDialog({ onClose, user }: { onClose: () => void; user: PublicUser }) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) {
      return;
    }

    router.refresh();
    const timer = window.setTimeout(onClose, 500);

    return () => window.clearTimeout(timer);
  }, [onClose, router, state.success]);

  return (
    <ProfileDialogShell onClose={onClose} title="修改昵称">
      <ActionToast state={state} />
      <form action={formAction} className="flex flex-1 flex-col">
        <div className="mx-auto mt-28 w-full max-w-2xl">
          <Input
            autoFocus
            className={dialogInputClass}
            defaultValue={user.nickname}
            maxLength={32}
            minLength={4}
            name="nickname"
            placeholder="请输入昵称"
            required
          />
        </div>
        <DialogFooter confirmLabel={isPending ? "保存中" : "确定"} disabled={isPending} onCancel={onClose} />
      </form>
    </ProfileDialogShell>
  );
}

function EmailDialog({ onClose, user }: { onClose: () => void; user: PublicUser }) {
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [step, setStep] = useState<"password" | "email">("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState("");
  const [verifyState, verifyFormAction, isVerifyPending] = useActionState(
    verifyPasswordAction,
    initialState
  );
  const [codeState, codeFormAction, isCodePending] = useActionState(
    sendChangeEmailCodeAction,
    initialState
  );
  const [changeState, changeFormAction, isChangePending] = useActionState(
    changeEmailAction,
    initialState
  );
  const router = useRouter();

  useEffect(() => {
    if (verifyState.success && currentPassword) {
      setStep("email");
    }
  }, [currentPassword, verifyState.success]);

  useEffect(() => {
    if (!changeState.success) {
      return;
    }

    router.refresh();
    const timer = window.setTimeout(onClose, 500);

    return () => window.clearTimeout(timer);
  }, [changeState.success, onClose, router]);

  return (
    <ProfileDialogShell onClose={onClose} title={isResettingPassword ? "重置密码" : "修改邮箱"}>
      <ActionToast state={verifyState} />
      <ActionToast state={codeState} />
      <ActionToast state={changeState} />
      {isResettingPassword ? (
        <ForgotPasswordFlow
          onBack={() => setIsResettingPassword(false)}
          onClose={onClose}
          user={user}
        />
      ) : step === "password" ? (
        <form action={verifyFormAction} className="flex flex-1 flex-col">
          <div className="mx-auto mt-28 w-full max-w-2xl">
            <Input
              autoFocus
              className={dialogInputClass}
              name="password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="请输入登录密码"
              type="password"
              value={currentPassword}
              required
            />
            <button
              className="mt-4 text-sm font-medium text-[#526a9c] underline-offset-4 hover:underline"
              onClick={() => setIsResettingPassword(true)}
              type="button"
            >
              忘记密码
            </button>
          </div>
          <DialogFooter
            confirmLabel={isVerifyPending ? "验证中" : "下一步"}
            disabled={isVerifyPending}
            onCancel={onClose}
          />
        </form>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="mx-auto mt-24 flex w-full max-w-2xl flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              当前邮箱：<span className="text-foreground">{displayEmail(user.email)}</span>
            </div>
            <form action={codeFormAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
              <Input
                autoFocus
                className={dialogInputClass}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入新邮箱"
                type="email"
                value={email}
                required
              />
              <Button className={dialogSecondaryButtonClass} disabled={isCodePending || !email} type="submit" variant="outline">
                {isCodePending ? "发送中" : "获取验证码"}
              </Button>
            </form>
            <form action={changeFormAction} className="flex flex-col">
              <input name="currentPassword" type="hidden" value={currentPassword} />
              <input name="email" type="hidden" value={email} />
              <Input
                className={dialogInputClass}
                inputMode="numeric"
                maxLength={8}
                name="emailCode"
                placeholder="请输入邮箱验证码"
                required
              />
              <DialogFooter
                confirmLabel={isChangePending ? "确认中" : "确定"}
                disabled={isChangePending}
                onCancel={onClose}
              />
            </form>
          </div>
        </div>
      )}
    </ProfileDialogShell>
  );
}

function PasswordDialog({ onClose, user }: { onClose: () => void; user: PublicUser }) {
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [step, setStep] = useState<"password" | "new-password">("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [verifyState, verifyFormAction, isVerifyPending] = useActionState(
    verifyPasswordAction,
    initialState
  );
  const [changeState, changeFormAction, isChangePending] = useActionState(
    changePasswordAction,
    initialState
  );

  useEffect(() => {
    if (verifyState.success && currentPassword) {
      setStep("new-password");
    }
  }, [currentPassword, verifyState.success]);

  useEffect(() => {
    if (!changeState.success) {
      return;
    }

    const timer = window.setTimeout(onClose, 500);

    return () => window.clearTimeout(timer);
  }, [changeState.success, onClose]);

  return (
    <ProfileDialogShell onClose={onClose} title={isResettingPassword ? "重置密码" : "修改密码"}>
      <ActionToast state={verifyState} />
      <ActionToast state={changeState} />
      {isResettingPassword ? (
        <ForgotPasswordFlow
          onBack={() => setIsResettingPassword(false)}
          onClose={onClose}
          user={user}
        />
      ) : step === "password" ? (
        <form action={verifyFormAction} className="flex flex-1 flex-col">
          <div className="mx-auto mt-28 w-full max-w-2xl">
            <Input
              autoFocus
              className={dialogInputClass}
              name="password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="请输入原登录密码"
              type="password"
              value={currentPassword}
              required
            />
            <button
              className="mt-4 text-sm font-medium text-[#526a9c] underline-offset-4 hover:underline"
              onClick={() => setIsResettingPassword(true)}
              type="button"
            >
              忘记密码
            </button>
          </div>
          <DialogFooter
            confirmLabel={isVerifyPending ? "验证中" : "下一步"}
            disabled={isVerifyPending}
            onCancel={onClose}
          />
        </form>
      ) : (
        <form action={changeFormAction} className="flex flex-1 flex-col">
          <input name="currentPassword" type="hidden" value={currentPassword} />
          <div className="mx-auto mt-24 flex w-full max-w-2xl flex-col gap-4">
            <Input
              autoFocus
              className={dialogInputClass}
              maxLength={72}
              minLength={6}
              name="newPassword"
              placeholder="请输入新密码"
              type="password"
              required
            />
            <Input
              className={dialogInputClass}
              maxLength={72}
              minLength={6}
              name="confirmPassword"
              placeholder="请再次输入新密码"
              type="password"
              required
            />
          </div>
          <DialogFooter
            confirmLabel={isChangePending ? "修改中" : "确定"}
            disabled={isChangePending}
            onCancel={onClose}
          />
        </form>
      )}
    </ProfileDialogShell>
  );
}

function PhoneDialog({ onClose, user }: { onClose: () => void; user: PublicUser }) {
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [step, setStep] = useState<"password" | "phone">("password");
  const [currentPassword, setCurrentPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [verifyState, verifyFormAction, isVerifyPending] = useActionState(
    verifyPasswordAction,
    initialState
  );
  const [codeState, codeFormAction, isCodePending] = useActionState(
    sendBindPhoneCodeAction,
    initialState
  );
  const [bindState, bindFormAction, isBindPending] = useActionState(bindPhoneAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (verifyState.success && currentPassword) {
      setStep("phone");
    }
  }, [currentPassword, verifyState.success]);

  useEffect(() => {
    if (!bindState.success) {
      return;
    }

    router.refresh();
    const timer = window.setTimeout(onClose, 500);

    return () => window.clearTimeout(timer);
  }, [bindState.success, onClose, router]);

  return (
    <ProfileDialogShell
      onClose={onClose}
      title={isResettingPassword ? "重置密码" : user.phone ? "修改手机" : "绑定手机"}
    >
      <ActionToast state={verifyState} />
      <ActionToast state={codeState} />
      <ActionToast state={bindState} />
      {isResettingPassword ? (
        <ForgotPasswordFlow
          onBack={() => setIsResettingPassword(false)}
          onClose={onClose}
          user={user}
        />
      ) : step === "password" ? (
        <form action={verifyFormAction} className="flex flex-1 flex-col">
          <div className="mx-auto mt-28 w-full max-w-2xl">
            <Input
              autoFocus
              className={dialogInputClass}
              name="password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="请输入登录密码"
              type="password"
              value={currentPassword}
              required
            />
            <button
              className="mt-4 text-sm font-medium text-[#526a9c] underline-offset-4 hover:underline"
              onClick={() => setIsResettingPassword(true)}
              type="button"
            >
              忘记密码
            </button>
          </div>
          <DialogFooter
            confirmLabel={isVerifyPending ? "验证中" : "下一步"}
            disabled={isVerifyPending}
            onCancel={onClose}
          />
        </form>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="mx-auto mt-24 flex w-full max-w-2xl flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              当前手机：<span className="text-foreground">{maskPhone(user.phone)}</span>
            </div>
            <form action={codeFormAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
              <Input
                autoFocus
                className={dialogInputClass}
                inputMode="tel"
                name="phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="请输入新手机号码"
                value={phone}
                required
              />
              <Button className={dialogSecondaryButtonClass} disabled={isCodePending || !phone} type="submit" variant="outline">
                {isCodePending ? "发送中" : "获取验证码"}
              </Button>
            </form>
            <form action={bindFormAction} className="flex flex-col">
              <input name="currentPassword" type="hidden" value={currentPassword} />
              <input name="phone" type="hidden" value={phone} />
              <Input
                className={dialogInputClass}
                inputMode="numeric"
                maxLength={8}
                name="code"
                placeholder="请输入手机验证码"
                required
              />
              <DialogFooter
                confirmLabel={isBindPending ? "确认中" : "确定"}
                disabled={isBindPending}
                onCancel={onClose}
              />
            </form>
          </div>
        </div>
      )}
    </ProfileDialogShell>
  );
}

function ForgotPasswordFlow({
  onBack,
  onClose,
  user
}: {
  onBack: () => void;
  onClose: () => void;
  user: PublicUser;
}) {
  const [step, setStep] = useState<"method" | "code" | "password">("method");
  const [method, setMethod] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [email, setEmail] = useState(resetEmailValue(user));
  const [phone, setPhone] = useState(user.phone ?? "");
  const [resetToken, setResetToken] = useState("");
  const [emailCodeState, emailCodeFormAction, isEmailCodePending] = useActionState(
    sendResetPasswordEmailCodeAction,
    initialState
  );
  const [phoneCodeState, phoneCodeFormAction, isPhoneCodePending] = useActionState(
    sendResetPasswordPhoneCodeAction,
    initialState
  );
  const [verifyState, verifyFormAction, isVerifyPending] = useActionState(
    verifyPasswordResetCodeAction,
    initialState
  );
  const [resetState, resetFormAction, isResetPending] = useActionState(
    resetPasswordWithTokenAction,
    initialState
  );

  useEffect(() => {
    if (!verifyState.resetToken) {
      return;
    }

    setResetToken(verifyState.resetToken);
    setStep("password");
  }, [verifyState.resetToken]);

  useEffect(() => {
    if (!resetState.success) {
      return;
    }

    const timer = window.setTimeout(onClose, 800);

    return () => window.clearTimeout(timer);
  }, [onClose, resetState.success]);

  const codeState = method === "EMAIL" ? emailCodeState : phoneCodeState;
  const isCodePending = method === "EMAIL" ? isEmailCodePending : isPhoneCodePending;
  const codeFormAction = method === "EMAIL" ? emailCodeFormAction : phoneCodeFormAction;
  const contactValue = method === "EMAIL" ? email : phone;

  if (step === "method") {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto mt-24 grid w-full max-w-2xl gap-4 sm:grid-cols-2">
          <button
            className={cn(
              "h-24 rounded-md border text-base font-semibold transition-colors",
              method === "EMAIL" ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground"
            )}
            onClick={() => {
              setMethod("EMAIL");
              setStep("code");
            }}
            type="button"
          >
            邮箱验证
          </button>
          <button
            className={cn(
              "h-24 rounded-md border text-base font-semibold transition-colors",
              method === "PHONE" ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground"
            )}
            onClick={() => {
              setMethod("PHONE");
              setStep("code");
            }}
            type="button"
          >
            手机验证
          </button>
        </div>
        <div className="mt-auto flex justify-center gap-4 pt-10">
          <Button className={dialogSecondaryButtonClass} onClick={onBack} type="button" variant="outline">
            返回
          </Button>
        </div>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="flex flex-1 flex-col">
        <ActionToast state={codeState} />
        <ActionToast state={verifyState} />
        <div className="mx-auto mt-24 flex w-full max-w-2xl flex-col gap-4">
          <form action={codeFormAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
            {method === "EMAIL" ? (
              <Input
                autoFocus
                className={dialogInputClass}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
                type="email"
                value={email}
                required
              />
            ) : (
              <Input
                autoFocus
                className={dialogInputClass}
                inputMode="tel"
                name="phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="请输入手机号码"
                value={phone}
                required
              />
            )}
            <Button
              className={dialogSecondaryButtonClass}
              disabled={isCodePending || !contactValue}
              type="submit"
              variant="outline"
            >
              {isCodePending ? "发送中" : "获取验证码"}
            </Button>
          </form>

          <form action={verifyFormAction} className="flex flex-col">
            <input name="method" type="hidden" value={method} />
            <input name="email" type="hidden" value={email} />
            <input name="phone" type="hidden" value={phone} />
            <Input
              className={dialogInputClass}
              inputMode="numeric"
              maxLength={8}
              name="code"
              placeholder={method === "EMAIL" ? "请输入邮箱验证码" : "请输入手机验证码"}
              required
            />
            <div className="mt-auto flex justify-center gap-4 pt-10">
              <Button className={dialogPrimaryButtonClass} disabled={isVerifyPending} type="submit">
                {isVerifyPending ? "验证中" : "下一步"}
              </Button>
              <Button
                className={dialogSecondaryButtonClass}
                onClick={() => setStep("method")}
                type="button"
                variant="outline"
              >
                返回
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={resetFormAction} className="flex flex-1 flex-col">
      <ActionToast state={resetState} />
      <input name="resetToken" type="hidden" value={resetToken} />
      <div className="mx-auto mt-24 flex w-full max-w-2xl flex-col gap-4">
        <Input
          autoFocus
          className={dialogInputClass}
          maxLength={72}
          minLength={6}
          name="password"
          placeholder="请输入新密码"
          type="password"
          required
        />
        <Input
          className={dialogInputClass}
          maxLength={72}
          minLength={6}
          name="confirmPassword"
          placeholder="请再次输入新密码"
          type="password"
          required
        />
      </div>
      <DialogFooter
        confirmLabel={isResetPending ? "重置中" : "确定"}
        disabled={isResetPending}
        onCancel={onClose}
      />
    </form>
  );
}

export function LogoutPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        退出后需要重新登录才能访问用户中心、账单中心和 AI 任务。
      </p>
      <div className="flex flex-wrap gap-3">
        <form action={userLogoutAction}>
          <Button type="submit" variant="outline">
            <LogOut data-icon="inline-start" />
            退出登录
          </Button>
        </form>
        <Button asChild variant="ghost">
          <Link href="/experience/chat">继续体验</Link>
        </Button>
      </div>
    </div>
  );
}
