import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { AuthPanel } from "@/components/shell/auth-panel";

export default function AdminLoginPage() {
  return (
    <AuthPanel
      variant="admin"
      title="管理员登录"
      description="进入内容后台"
      footer={{
        label: "返回前台？",
        href: "/",
        action: "回到首页"
      }}
    >
      <AdminLoginForm />
    </AuthPanel>
  );
}
