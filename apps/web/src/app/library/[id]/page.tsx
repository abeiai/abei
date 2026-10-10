import type { Metadata } from "next";
import { PictureBookPlayer } from "@/components/picture-books/picture-book-player";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "绘本阅读 - 阿贝 AI" };
export default async function PublicPictureBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PictureBookPlayer bookId={id} learnerMode={false} publicMode />;
}
