import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PictureBookLayoutWorkspace } from "@/components/picture-books/picture-book-layout-workspace";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";
import { pictureBookLayoutHref } from "@/lib/picture-book-layout-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "图文编排 - 阿贝智能" };

export default async function PictureBookLayoutPage({ searchParams }: { searchParams: Promise<{ book?: string; page?: string }> }) {
  const [user, params] = await Promise.all([getOptionalCurrentUser(), searchParams]);
  const bookId = typeof params.book === "string" ? params.book : "";
  const position = typeof params.page === "string" && /^\d+$/.test(params.page) && Number.isSafeInteger(Number(params.page)) ? Number(params.page) : null;
  const returnPath = bookId ? pictureBookLayoutHref(bookId, position ?? 1) : "/storybook/layout";
  if (!user) return <main className="p-6"><h1 className="text-xl font-semibold">图文编排</h1><Link href={`/login?next=${encodeURIComponent(returnPath)}`} className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">登录后继续</Link></main>;
  const profile = await getWebProfile(returnPath);
  if (profile.mode !== "ACCOUNT") redirect(profileSelectionHref(returnPath));
  if (!bookId) return <main className="p-6"><p className="text-sm">请从绘本中打开图文编排。</p><Link className="mt-4 inline-block text-sm underline" href="/storybook">返回绘本创作</Link></main>;
  return <PictureBookLayoutWorkspace bookId={bookId} initialPosition={position} />;
}
