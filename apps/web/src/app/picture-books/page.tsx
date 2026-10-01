import { redirect } from "next/navigation";

export default async function PictureBooksRedirect({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const { book } = await searchParams;
  redirect(book ? `/storybook?book=${encodeURIComponent(book)}` : "/storybook");
}
