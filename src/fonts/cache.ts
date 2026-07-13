import { get, set, del } from "idb-keyval";

const PREFIX = "font:";
const INDEX_KEY = "font-index";

export type UploadedFontMeta = {
  sha256: string;
  name: string; // original filename
  addedAt: number; // Date.now() at registration
};

export async function getCachedFont(sha256: string): Promise<ArrayBuffer | undefined> {
  return await get(PREFIX + sha256);
}

export async function listUploadedFonts(): Promise<UploadedFontMeta[]> {
  return (await get(INDEX_KEY)) ?? [];
}

export async function registerUploadedFont(
  meta: UploadedFontMeta,
  buffer?: ArrayBuffer,
): Promise<void> {
  if (buffer) {
    await set(PREFIX + meta.sha256, buffer);
  }
  const rest = (await listUploadedFonts()).filter((f) => f.sha256 !== meta.sha256);
  await set(INDEX_KEY, [...rest, meta]);
}

export async function removeUploadedFont(sha256: string): Promise<void> {
  await del(PREFIX + sha256);
  const rest = (await listUploadedFonts()).filter((f) => f.sha256 !== sha256);
  await set(INDEX_KEY, rest);
}
