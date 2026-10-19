import { RegisterForm } from "@/components/auth/register-form";
import { AuthPanel } from "@/components/shell/auth-panel";
import { normalizeSafeNextPath } from "@/lib/profile-routing";

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = normalizeSafeNextPath(params.next) ?? undefined;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthPanel
      layout="illustrated"
      title="创建账号"
      description="保存学习材料和生成记录"
      footer={{
        label: "已经有账号？",
        href: loginHref,
        action: "去登录"
      }}
    >
      <RegisterForm next={next} />
    </AuthPanel>
  );
}
