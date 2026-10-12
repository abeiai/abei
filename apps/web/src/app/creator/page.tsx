import type { Metadata } from 'next';
import { PublicShell } from '@/components/shell/public-shell';
import { CreatorInstallation } from '@/components/creator/installation';
export const metadata: Metadata = { title: '绘本创作助手 - 阿贝 AI', description: '在 AI 客户端创作绘本，同步、预览并提交阿贝审核。' };
export default function CreatorPage() { return <PublicShell><CreatorInstallation /></PublicShell>; }
