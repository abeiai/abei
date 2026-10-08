import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PictureBookStudio } from "@/components/picture-books/picture-book-studio";
import { PublicShell } from "@/components/shell/public-shell";
import { getOptionalCurrentUser } from "@/lib/auth-actions";
import { getWebProfile } from "@/lib/profile-api";
import { profileSelectionHref } from "@/lib/profile-routing";
import { decodeStoryIdea, encodeStoryIdea, STORY_IDEA_MAX_LENGTH } from "@/lib/storybook-idea";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本创作 - 学乐 AI", description: "讨论故事、安排分镜，制作有画面和讲解语音的绘本。" };

export default async function StorybookPage({ searchParams }: { searchParams: Promise<{ book?: string; prompt?: string; idea?: string }> }) {
  const [user, params] = await Promise.all([getOptionalCurrentUser(), searchParams]);
  const initialPrompt = params.idea !== undefined ? decodeStoryIdea(params.idea) : typeof params.prompt === "string" ? params.prompt.slice(0, STORY_IDEA_MAX_LENGTH) : "";
  const query = new URLSearchParams();
  if (params.book) query.set("book", params.book);
  if (initialPrompt) query.set("idea", encodeStoryIdea(initialPrompt));
  const returnPath = query.size ? `/storybook?${query}` : "/storybook";
  if (user) {
    const profile = await getWebProfile(returnPath);
    if (profile.mode !== "ACCOUNT") redirect(profileSelectionHref(returnPath));
  }
  return <PublicShell currentUser={user} showFooter={false}><PictureBookStudio signedIn={Boolean(user)} initialBookId={params.book ?? ""} initialPrompt={initialPrompt} returnPath={returnPath} /></PublicShell>;
}
