import type { EnglishGuidedStudyMaterial } from "@/lib/english-guided-study-data";

export type AccountHistoryStatus = "guest" | "loading" | "ready" | "error";

export interface AccountHistoryState {
  ownerUserId: string | null;
  status: AccountHistoryStatus;
  items: EnglishGuidedStudyMaterial[];
  errorMessage: string | null;
}

export function accountHistoryForUser(userId: string | null): AccountHistoryState {
  return userId
    ? { ownerUserId: userId, status: "loading", items: [], errorMessage: null }
    : { ownerUserId: null, status: "guest", items: [], errorMessage: null };
}

export function accountHistoryLoaded(
  current: AccountHistoryState,
  userId: string,
  items: EnglishGuidedStudyMaterial[]
): AccountHistoryState {
  return current.ownerUserId === userId
    ? { ownerUserId: userId, status: "ready", items, errorMessage: null }
    : current;
}

export function accountHistoryFailed(
  current: AccountHistoryState,
  userId: string,
  errorMessage: string
): AccountHistoryState {
  return current.ownerUserId === userId
    ? { ...current, status: "error", errorMessage }
    : current;
}

export async function loadAccountHistoryRequest(input: {
  isCurrent: () => boolean;
  load: () => Promise<EnglishGuidedStudyMaterial[]>;
  update: (updater: (current: AccountHistoryState) => AccountHistoryState) => void;
  userId: string;
}) {
  try {
    const items = await input.load();

    if (input.isCurrent()) {
      input.update((current) => accountHistoryLoaded(current, input.userId, items));
    }
  } catch (error) {
    if (input.isCurrent()) {
      input.update((current) => accountHistoryFailed(
        current,
        input.userId,
        error instanceof Error ? error.message : "账号历史加载失败"
      ));
    }
  }
}

export function accountHistoryUpsert(
  current: AccountHistoryState,
  material: EnglishGuidedStudyMaterial
): AccountHistoryState {
  if (current.status === "guest") return current;

  return {
    ...current,
    status: "ready",
    items: [material, ...current.items.filter((item) => item.id !== material.id)].slice(0, 50),
    errorMessage: null
  };
}

export function accountHistoryPin(current: AccountHistoryState, materialId: string): AccountHistoryState {
  const material = current.items.find((item) => item.id === materialId);

  return material
    ? { ...current, items: [material, ...current.items.filter((item) => item.id !== materialId)] }
    : current;
}

export function accountHistoryRemove(current: AccountHistoryState, materialId: string): AccountHistoryState {
  return { ...current, items: current.items.filter((item) => item.id !== materialId) };
}
