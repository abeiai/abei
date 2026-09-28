"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronRight, Coins, IdCard, LogIn, LogOut, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AccountLearnerSwitcher,
  ProfileSwitcher,
  type ProfileTransitionAction
} from "@/components/profiles/profile-switcher";
import { userLogoutAction, type PublicUser } from "@/lib/auth-actions";
import { switchBillingIdentityAction, type BillingIdentity } from "@/lib/billing-identity";
import type { UserOrganizationsResult } from "@/lib/organizations-api";
import type { ProfileSelectionLearner, WebProfile } from "@/lib/profile-api";
import { profileContinuationPath } from "@/lib/profile-routing";
import { publicAccountLabel } from "@/lib/user-identity";
import { cn } from "@/lib/utils";

interface UserAccountMenuProps {
  user: PublicUser | null;
  availableCredits?: number | null;
  billingIdentity?: BillingIdentity | null;
  loginHref?: string;
  organizations?: UserOrganizationsResult | null;
  registerHref?: string;
  className?: string;
  enterLearnerAction: ProfileTransitionAction;
  learners?: readonly ProfileSelectionLearner[];
  profile?: WebProfile;
  returnToAccountAction: ProfileTransitionAction;
  switchLearnerAction: ProfileTransitionAction;
}

export const accountManagementMenuItems = [
  { href: "/dashboard/learners", label: "学习账号" }
] as const;

export function UserAccountMenu({
  user,
  availableCredits,
  billingIdentity,
  loginHref = "/login",
  organizations,
  learners = [],
  profile,
  registerHref,
  className,
  enterLearnerAction,
  returnToAccountAction,
  switchLearnerAction
}: UserAccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [currentSearch, setCurrentSearch] = useState("");
  const [identityMessage, setIdentityMessage] = useState("");
  const [isSwitchingIdentity, startIdentityTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const displayName = user?.nickname?.trim() || "体验区用户";
  const accountLabel = user ? publicAccountLabel(user) : "";
  const currentPage = `${pathname ?? ""}${currentSearch}`;
  const resolvedLoginHref = loginHrefForCurrentPage(loginHref, currentPage);
  const resolvedRegisterHref = registerHref ?? deriveRegisterHref(resolvedLoginHref);
  const activeOrganizations = useMemo(
    () => (organizations?.enabled ? organizations.organizations.filter((organization) => organization.memberStatus === "ACTIVE") : []),
    [organizations]
  );
  const activeIdentity = billingIdentity ?? {
    type: "PERSONAL" as const,
    organizationId: null,
    label: "个人账号"
  };

  useEffect(() => {
    setCurrentSearch(window.location.search);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function switchIdentity(identity: string) {
    const formData = new FormData();
    formData.set("identity", identity);
    setIdentityMessage("");

    startIdentityTransition(async () => {
      const result = await switchBillingIdentityAction(formData);

      if (!result.ok) {
        setIdentityMessage(result.message ?? "登录身份切换失败，请稍后重试。");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  if (!user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button asChild className="hidden sm:inline-flex" size="sm" variant="outline">
          <Link href={resolvedRegisterHref}>
            <UserPlus data-icon="inline-start" />
            注册
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={resolvedLoginHref}>
            <LogIn data-icon="inline-start" />
            登录
          </Link>
        </Button>
      </div>
    );
  }

  if (profile?.mode === "UNSELECTED") {
    return (
      <Button asChild className={className} size="sm">
        <Link href="/select-profile">选择身份</Link>
      </Button>
    );
  }

  if (profile?.mode === "LEARNER") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button asChild size="sm" variant="outline">
          <Link href="/learn/center">学习中心</Link>
        </Button>
        <ProfileSwitcher
          currentLearner={profile.home.learner}
          learners={learners}
          returnToAccountAction={returnToAccountAction}
          switchLearnerAction={switchLearnerAction}
        />
      </div>
    );
  }

  const identity = profileIdentityPresentation(user, profile ?? { mode: "ACCOUNT" });

  return (
    <div className={cn("relative z-50", className)} ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={identity.label}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-1 py-1 text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        onClick={() => setOpen((current) => !current)}
        title={identity.label}
        type="button"
      >
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {user.avatarUrl ? (
            <img alt={displayName} className="size-full object-cover" src={user.avatarUrl} />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="hidden max-w-24 truncate pr-2 text-sm font-medium sm:inline">{identity.label}</span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-12 w-[300px] overflow-hidden rounded-md border border-border bg-background text-foreground shadow-xl"
          role="menu"
        >
          <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="xueleai-icon-tile flex size-9 shrink-0 items-center justify-center rounded-md">
                  <Coins className="size-4" />
                </span>
                <span className="text-sm font-semibold">剩余点数</span>
              </div>
              <Link
                className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary"
                href="/dashboard/billing"
                onClick={() => setOpen(false)}
              >
                充值
              </Link>
            </div>
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm text-muted-foreground">当前可用</span>
              <span className="font-display text-2xl font-medium">
                {formatCredits(availableCredits)} 点
              </span>
            </div>
          </div>

          <div className="border-b border-border p-2">
            <Link
              className="flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-secondary"
              href="/dashboard/profile"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-base font-semibold text-primary-foreground">
                {user.avatarUrl ? (
                  <img alt={displayName} className="size-full object-cover" src={user.avatarUrl} />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">个人账号登录</p>
                <p className="mt-1 truncate text-base font-semibold">{displayName}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{accountLabel}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>

            {activeOrganizations.length > 0 ? (
              <div className="mt-2 border-t border-border pt-2">
                {activeOrganizations.map((organization) => (
                  <IdentityOption
                    active={activeIdentity.organizationId === organization.id}
                    disabled={isSwitchingIdentity}
                    key={organization.id}
                    label={organization.name}
                    onClick={() => switchIdentity(`org:${organization.id}`)}
                  />
                ))}
              </div>
            ) : null}
            {identityMessage ? <p className="mt-2 text-xs text-destructive">{identityMessage}</p> : null}
          </div>

          <div className="flex flex-col p-2 text-sm">
            <AccountLearnerSwitcher
              enterLearnerAction={enterLearnerAction}
              learners={learners}
            />
            {accountManagementMenuItems.map((item) => (
              <Link
                className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-secondary"
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                <Users className="size-4" />
                {item.label}
              </Link>
            ))}
            <Link
              className="flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-secondary"
              href="/dashboard/profile"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <IdCard className="size-4" />
              我的账号
            </Link>
            <form action={userLogoutAction}>
              <button
                className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-secondary"
                role="menuitem"
                type="submit"
              >
                <LogOut className="size-4" />
                退出登录
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function profileIdentityPresentation(user: PublicUser, profile: WebProfile) {
  if (profile.mode === "LEARNER") {
    return {
      label: profile.home.learner.nickname,
      nickname: profile.home.learner.nickname,
      avatarUrl: profile.home.learner.avatarUrl,
      showsAccountControls: false
    };
  }

  return {
    label: profile.mode === "ACCOUNT" ? "我的账号" : "选择身份",
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    showsAccountControls: profile.mode === "ACCOUNT"
  };
}

function IdentityOption({
  active,
  disabled,
  label,
  onClick
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-60",
        active ? "bg-secondary text-foreground" : "text-muted-foreground"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Building2 className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {active ? <Check className="size-4 shrink-0" /> : null}
    </button>
  );
}

function formatCredits(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "--";
}

function deriveRegisterHref(loginHref: string) {
  try {
    const url = new URL(loginHref, "https://local.xueleai");
    const next = url.searchParams.get("next");

    return next ? `/register?next=${encodeURIComponent(next)}` : "/register";
  } catch {
    return "/register";
  }
}

export function loginHrefForCurrentPage(loginHref: string, pathname: string | null) {
  try {
    const url = new URL(loginHref, "https://local.xueleai");

    if (url.pathname !== "/login" || url.searchParams.has("next")) {
      return loginHref;
    }

    const continuation = profileContinuationPath(pathname);

    if (!continuation || ["/", "/login", "/register"].includes(continuation)) {
      return loginHref;
    }

    return `/login?next=${encodeURIComponent(continuation)}`;
  } catch {
    return loginHref;
  }
}
