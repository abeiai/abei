import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/shell/public-shell";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Button } from "@/components/ui/button";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getReferralProfile } from "@/lib/referral-api";
import DashboardPage from "@/app/dashboard/page";
import { ReferralRegistration } from "@/components/billing/referral-registration";

export const dynamic = "force-dynamic";
export const metadata = { title: "个人主页 - 学乐AI", robots: { index: false, follow: false } };

export default async function PersonalHome({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getReferralProfile(handle).catch(error => {
    if (error instanceof Error && error.message === "个人主页不存在") notFound();
    throw error;
  });
  const user = await getOptionalCurrentUser();
  if (user?.id === profile.id) return <DashboardPage />;
  return <PublicShell><section className="mx-auto w-full max-w-2xl px-5 py-12"><div className="space-y-6 rounded-2xl border border-border bg-background p-8 shadow-sm">
    <div className="flex items-center gap-4">{profile.avatarUrl ? <ResponsiveImage usage="avatar" alt="用户头像" src={profile.avatarUrl} className="size-16 rounded-full object-cover" /> : <div aria-hidden className="flex size-16 items-center justify-center rounded-full bg-muted text-2xl">学</div>}<div><h1 className="text-2xl font-semibold">{profile.nickname}的个人主页</h1><p className="mt-1 text-sm text-muted-foreground">@{profile.canonicalHandle}</p></div></div>
    {user ? <Button asChild><Link href="/dashboard">进入我的个人中心</Link></Button> : <ReferralRegistration handle={handle} />}
    <div className="flex flex-wrap gap-4 border-t border-border pt-5 text-sm"><Link href="/text2lesson">英文带学</Link><Link href="/gushiwen">学古诗文</Link><Link href="/flashcard">学习闪卡</Link></div>
  </div></section></PublicShell>;
}
