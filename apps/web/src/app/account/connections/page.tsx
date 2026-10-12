import type { Metadata } from 'next';
import { ConnectionsPanel } from '@/components/creator/authorization-panel';
export const metadata: Metadata = { title: '已连接客户端', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function AccountConnectionsPage() { return <ConnectionsPanel />; }
