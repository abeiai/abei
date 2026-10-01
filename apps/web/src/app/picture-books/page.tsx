import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PictureBookStudio } from "@/components/picture-books/picture-book-studio";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本创作 - 学乐 AI", description: "讨论故事、安排分镜，制作有画面和讲解语音的绘本。" };

export default async function PictureBooksPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const [user, params] = await Promise.all([getOptionalCurrentUser(), searchParams]);
  if (user) {
    const profile = await getWebProfile("/picture-books");
    if (profile.mode !== "ACCOUNT") redirect(profileSelectionHref("/picture-books"));
  }
  return <PictureBookStudio signedIn={Boolean(user)} initialBookId={params.book ?? ""} />;
}
