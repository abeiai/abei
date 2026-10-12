import type { Metadata } from 'next';
import { AuthorizationPanel } from '@/components/creator/authorization-panel';
export const metadata: Metadata = { title: '确认设备连接', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function CreatorDevicePage() { return <AuthorizationPanel device />; }
