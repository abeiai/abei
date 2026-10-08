import type { VideoBookProject } from "./video-books";

// IndexedDB keeps uploaded reference media out of localStorage's small quota.
async function openVideoBooks(userId: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`abei:video-books:${userId}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开视频作品记录，请检查浏览器存储权限"));
  });
}

async function transaction<T>(userId: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openVideoBooks(userId);
  return new Promise((resolve, reject) => {
    const tx = database.transaction("projects", mode);
    const request = action(tx.objectStore("projects"));
    tx.oncomplete = () => { database.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { database.close(); reject(new Error("作品保存失败，浏览器存储空间不足或不可用")); };
  });
}

export async function loadVideoBooks(userId: string): Promise<VideoBookProject[]> {
  const projects = await transaction<VideoBookProject[]>(userId, "readonly", store => store.getAll());
  return projects.filter(project => project && typeof project.id === "string" && Array.isArray(project.pages))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveVideoBook(userId: string, project: VideoBookProject) {
  await transaction(userId, "readwrite", store => store.put(project));
}

export async function removeVideoBook(userId: string, id: string) {
  await transaction(userId, "readwrite", store => store.delete(id));
}
