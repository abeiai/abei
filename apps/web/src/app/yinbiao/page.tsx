import type { Metadata } from "next";
import { PublicShell } from "@/components/shell/public-shell";
import { YinbiaoWorkbench } from "@/components/yinbiao/yinbiao-workbench";

export const metadata: Metadata = {
  title: "英语音标 - 学乐 AI",
  description: "学习 48 个英语音标，查看发音要领、口型示意、易错提示与按字母数分组的常见词汇。"
};

export default function YinbiaoPage() {
  return <PublicShell showFooter={false}><YinbiaoWorkbench /></PublicShell>;
}
