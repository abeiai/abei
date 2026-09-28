import { AuthPanel } from "@/components/shell/auth-panel";
import { UserLoginForm } from "@/components/auth/user-login-form";
import { normalizeSafeNextPath } from "@/lib/profile-routing";
import { wechatLoginErrorMessage } from "@/lib/wechat-auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; reset?: string; wechat_error?: string }>;
}) {
  const params = await searchParams;
  const next = normalizeSafeNextPath(params.next) ?? undefined;
  const wechatError = wechatLoginErrorMessage(params.wechat_error);
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <AuthPanel
      title="登录"
      description={params.reset === "1" ? "密码已重置，请重新登录" : "继续学习任务"}
      footer={{
        label: "还没有账号？",
        href: registerHref,
        action: "立即注册"
      }}
    >
      <UserLoginForm next={next} wechatError={wechatError} />
    </AuthPanel>
  );
}
