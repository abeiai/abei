"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const labels: Record<string, string> = {
  'creator:read': '读取我的创作内容',
  'creator:write': '创建和修改我的草稿',
  'creator:submit': '提交我的作品审核'
};
type Consent = { id: string; clientName: string; account: { accountId: string; nickname: string }; scopes: string[]; audience: string; csrfToken: string };
type Connection = Omit<Consent, 'csrfToken' | 'account'> & { createdAt: string; lastUsedAt: string | null; expiresAt: string };
class BrowserRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function api<T>(path: string, method = 'GET', body?: unknown, csrf?: string): Promise<T> {
  const response = await fetch(`/api/creator-auth${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-Creator-CSRF': csrf } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json() as { code: number; message: string; data: T };
  if (!response.ok || result.code !== 0) throw new BrowserRequestError(result.message || '操作失败，请稍后重试', response.status);
  return result.data;
}
export function ConsentDetails({ clientName, account, scopes, audience }: Pick<Consent, 'clientName' | 'account' | 'scopes' | 'audience'>) {
  return <div className="space-y-4">
    <div><p className="text-sm text-muted-foreground">外部客户端</p><p className="mt-1 break-all text-lg font-semibold">{clientName}</p></div>
    <p className="text-sm leading-6 text-muted-foreground">客户端名称由第三方提供，请确认来源后授权。</p>
    <div><p className="text-sm font-semibold">授权账号</p><p className="mt-1 break-all text-sm">{account.nickname}</p><p className="mt-1 text-sm text-muted-foreground">主账号 ID：{account.accountId}</p></div>
    <div><p className="text-sm font-semibold">请求以下权限</p><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{scopes.map(scope => <li key={scope}>{labels[scope] ?? '未知权限'}</li>)}</ul></div>
    <p className="text-sm text-muted-foreground">连接方式：{audience.endsWith('/mcp') ? 'MCP 客户端' : '创作助手'}</p>
  </div>;
}
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#f6f6f5] px-5 py-12"><section className="mx-auto max-w-lg space-y-6 rounded-2xl border border-border bg-background p-6 shadow-sm"><nav className="flex gap-4 text-sm text-muted-foreground"><Link href="/dashboard">用户中心</Link><Link href="/creator">创作助手</Link></nav><h1 className="text-2xl font-semibold tracking-normal">{title}</h1>{children}</section></main>;
}
function ErrorNotice({ error, next }: { error: BrowserRequestError | null; next: string }) {
  if (!error) return null;
  return <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error.message}</p>{error.status === 401 && <Button asChild variant="outline"><Link href={`/login?next=${encodeURIComponent(next)}`}>登录主账号</Link></Button>}{error.status === 403 && error.message.includes('主账号') && <Link className="block underline" href={`/select-profile?next=${encodeURIComponent(next)}`}>切换主账号</Link>}</div>;
}
function asError(value: unknown) { return value instanceof BrowserRequestError ? value : new BrowserRequestError('网络异常，请稍后重试', 0); }
export function AuthorizationPanel({ transaction, device = false }: { transaction?: string; device?: boolean }) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BrowserRequestError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const next = device ? '/creator/device' : `/creator/authorize?transaction=${encodeURIComponent(transaction ?? '')}`;
  useEffect(() => {
    if (device) return;
    if (!transaction || !/^[a-z0-9]{20,64}$/.test(transaction)) { setError(new BrowserRequestError('授权链接无效', 400)); return; }
    let active = true;
    api<Consent>(`/requests/${encodeURIComponent(transaction)}`).then(data => { if (active) setConsent(data); }).catch(e => { if (active) setError(asError(e)); });
    return () => { active = false; };
  }, [transaction, device]);
  async function lookup(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { setConsent(await api<Consent>('/device/lookup', 'POST', { user_code: code })); } catch (e) { setError(asError(e)); } finally { setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (!consent) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ redirectUri?: string }>(device ? '/device/decision' : `/requests/${encodeURIComponent(consent.id)}`, 'POST', { approve, ...(device ? { transaction: consent.id } : {}) }, consent.csrfToken);
      if (device) { setDone(approve ? '已授权，请返回创作助手继续。' : '已拒绝本次授权。'); setConsent(null); }
      else if (result.redirectUri) window.location.assign(result.redirectUri);
    } catch (e) { setError(asError(e)); } finally { setBusy(false); }
  }
  return <Frame title={device ? '确认设备连接' : '连接外部客户端'}>
    <ErrorNotice error={error} next={next} />
    {done ? <p role="status" className="text-sm leading-6">{done}</p> : consent ? <><ConsentDetails {...consent} /><div className="flex gap-3"><Button disabled={busy} onClick={() => void decide(true)}>同意授权</Button><Button variant="outline" disabled={busy} onClick={() => void decide(false)}>拒绝</Button></div><Link href="/account/connections" className="block text-sm underline">管理已连接客户端</Link></> : device ? <form onSubmit={lookup} className="space-y-4"><label className="block text-sm font-semibold" htmlFor="device-code">输入创作助手显示的设备码</label><input className="h-11 w-full rounded-md border border-input px-3 text-base uppercase" id="device-code" autoComplete="off" autoCapitalize="characters" maxLength={11} required value={code} onChange={e => setCode(e.target.value)} placeholder="ABCDE-12345" /><Button type="submit" disabled={busy}>查看授权请求</Button></form> : !error && <p role="status" className="text-sm text-muted-foreground">正在读取授权请求…</p>}
  </Frame>;
}
export function ConnectionTimes({ createdAt, lastUsedAt, expiresAt }: Pick<Connection, 'createdAt' | 'lastUsedAt' | 'expiresAt'>) {
  const format = (value: string) => new Date(value).toLocaleString('zh-CN');
  return <dl className="space-y-1 text-xs text-muted-foreground"><div><dt className="inline">授权时间：</dt><dd className="inline"><time dateTime={createdAt}>{format(createdAt)}</time></dd></div><div><dt className="inline">最近使用：</dt><dd className="inline">{lastUsedAt ? <time dateTime={lastUsedAt}>{format(lastUsedAt)}</time> : '尚未使用'}</dd></div><div><dt className="inline">到期时间：</dt><dd className="inline"><time dateTime={expiresAt}>{format(expiresAt)}</time></dd></div></dl>;
}
export function ConnectionsPanel() {
  const [data, setData] = useState<{ connections: Connection[]; csrfToken: string } | null>(null);
  const [error, setError] = useState<BrowserRequestError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { let active = true; api<{ connections: Connection[]; csrfToken: string }>('/connections').then(result => { if (active) setData(result); }).catch(e => { if (active) setError(asError(e)); }); return () => { active = false; }; }, []);
  async function revoke(connection: Connection) {
    if (!data || !window.confirm(`撤销“${connection.clientName}”的授权？`)) return;
    setBusy(connection.id); setError(null);
    try { await api(`/connections/${encodeURIComponent(connection.id)}`, 'DELETE', undefined, data.csrfToken); setData({ ...data, connections: data.connections.filter(item => item.id !== connection.id) }); } catch (e) { setError(asError(e)); } finally { setBusy(null); }
  }
  return <Frame title="已连接客户端"><ErrorNotice error={error} next="/account/connections" />{data ? data.connections.length ? <ul className="space-y-5">{data.connections.map(connection => <li key={connection.id} className="space-y-3 rounded-xl border border-border p-4"><p className="break-all font-semibold">{connection.clientName}</p><p className="text-sm leading-6 text-muted-foreground">{connection.scopes.map(scope => labels[scope] ?? '未知权限').join('、')}</p><ConnectionTimes {...connection} /><Button variant="outline" disabled={busy !== null} onClick={() => void revoke(connection)}>{busy === connection.id ? '正在撤销…' : '撤销授权'}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">暂无已连接客户端</p> : !error && <p role="status" className="text-sm text-muted-foreground">正在读取…</p>}</Frame>;
}
