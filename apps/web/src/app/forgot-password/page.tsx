import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthPanel } from "@/components/shell/auth-panel";
import { safeNextPath } from "@/lib/email-auth";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next) || undefined;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthPanel
      title="找回密码"
      description="通过邮箱验证码重置密码"
      footer={{
        label: "想起密码了？",
        href: loginHref,
        action: "去登录"
      }}
    >
      <ForgotPasswordForm next={next} />
    </AuthPanel>
  );
}
