import type { Metadata } from 'next';
import { AuthorizationPanel } from '@/components/creator/authorization-panel';
export const metadata: Metadata = { title: '连接外部客户端', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function CreatorAuthorizePage({ searchParams }: { searchParams: Promise<{ transaction?: string }> }) {
  return <AuthorizationPanel transaction={(await searchParams).transaction} />;
}
