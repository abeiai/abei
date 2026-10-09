import type { Metadata } from "next";
import { PictureBookHome } from "@/components/home/picture-book-home";
import { PublicShell } from "@/components/shell/public-shell";
import styles from "@/components/home/picture-book-home.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "阿贝 AI - 把一个想法变成有声绘本",
  description: "创作属于孩子的有声绘本，在线阅读、聆听和下载绘本，上传绘本素材制作专属导读。",
  openGraph: {
    title: "阿贝 AI - 把一个想法变成有声绘本",
    description: "让想象有画面，让故事有声音。创作绘本、发现好故事、制作绘本导读。",
    siteName: "阿贝 AI",
    locale: "zh_CN",
    type: "website",
    url: "/",
    images: [{ url: "/picture-book-demos/series-cover.webp", width: 1600, height: 900, alt: "熊猫乐乐的森林朋友" }]
  }
};

export default function HomePage() {
  return (
    <PublicShell className={styles.shell}>
      <PictureBookHome />
    </PublicShell>
  );
}
