"use client";

import { useLayoutEffect } from "react";

import {
  publicAuthSessionOwner,
  publicAuthSessionStorageKey
} from "@/lib/public-auth-session";

export function PublicAuthSessionSync({
  userId
}: {
  userId: string | null | undefined;
}) {
  useLayoutEffect(() => {
    try {
      window.localStorage.setItem(
        publicAuthSessionStorageKey,
        publicAuthSessionOwner(userId)
      );
    } catch {
      // 跨标签同步不可用时，服务端鉴权仍是最终权限边界。
    }
  }, [userId]);

  return null;
}
