import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { PictureBookPlayer } from "@/components/picture-books/picture-book-player";
import { publicPictureBookHref, yiweiLegacyBookId } from "@/lib/picture-book-public-slug";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本阅读 - 阿贝 AI" };
export default async function PublicPictureBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === yiweiLegacyBookId) permanentRedirect(publicPictureBookHref(id));
  return <PictureBookPlayer bookId={id} learnerMode={false} publicMode />;
}
