import type { Metadata } from "next";
import { PictureBookHome } from "@/components/home/picture-book-home";
import { PublicShell } from "@/components/shell/public-shell";
import { getPictureBookLibrary } from "@/lib/picture-book-library-api";
import { getPublicSystemConfigs } from "@/lib/settings-api";
import { homeSiteMetadata, resolveSiteSeo } from "@/lib/site-seo-metadata";
import styles from "@/components/home/picture-book-home.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const configs = await getPublicSystemConfigs().catch(() => []);
  return homeSiteMetadata(resolveSiteSeo(configs));
}

export default async function HomePage() {
  const library = await getPictureBookLibrary();
  return (
    <PublicShell className={styles.shell}>
      <PictureBookHome albums={library.albums} books={library.books.items} libraryFailed={library.failed} />
    </PublicShell>
  );
}
