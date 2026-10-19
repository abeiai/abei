import { AuthPanel } from "@/components/shell/auth-panel";
import { UserLoginForm } from "@/components/auth/user-login-form";
import { normalizeSafeNextPath } from "@/lib/profile-routing";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const next = normalizeSafeNextPath(params.next) ?? undefined;
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <AuthPanel
      title={null}
      description={params.reset === "1" ? "密码已重置，请重新登录" : undefined}
      footer={{
        label: "还没有账号？",
        href: registerHref,
        action: "立即注册"
      }}
    >
      <UserLoginForm next={next} />
    </AuthPanel>
  );
}
