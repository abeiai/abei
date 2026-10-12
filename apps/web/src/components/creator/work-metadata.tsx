import React from 'react';
export type CreatorSync = { source: string; version: number } | null;
export function CreatorWorkMetadata({ sync }: { sync?: CreatorSync }) {
  return sync ? <p className="text-xs text-muted-foreground">外部客户端同步 · 版本 {sync.version}</p> : null;
}
