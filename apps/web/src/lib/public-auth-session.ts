export const publicAuthSessionStorageKey = "xueleai:auth:user";

export function publicAuthSessionOwner(userId: string | null | undefined) {
  return userId?.trim() ? encodeURIComponent(userId.trim()) : "guest";
}

export function shouldReloadForPublicAuthChange(
  expectedUserId: string | null | undefined,
  changedKey: string | null,
  changedOwner: string | null
) {
  return (
    changedKey === publicAuthSessionStorageKey &&
    changedOwner !== null &&
    changedOwner !== publicAuthSessionOwner(expectedUserId)
  );
}
