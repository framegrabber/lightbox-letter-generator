import { get, set, del } from "idb-keyval";

const PREFIX = "font:";

export async function cacheFont(sha256: string, buffer: ArrayBuffer): Promise<void> {
  await set(PREFIX + sha256, buffer);
}

export async function getCachedFont(sha256: string): Promise<ArrayBuffer | undefined> {
  return await get(PREFIX + sha256);
}

export async function deleteCachedFont(sha256: string): Promise<void> {
  await del(PREFIX + sha256);
}
