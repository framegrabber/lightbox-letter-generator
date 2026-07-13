import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import {
  listUploadedFonts,
  registerUploadedFont,
  removeUploadedFont,
  getCachedFont,
} from "../../../src/fonts/cache";

const bufA = new Uint8Array([1, 2, 3]).buffer;
const bufB = new Uint8Array([4, 5, 6]).buffer;

describe("uploaded font registry", () => {
  beforeEach(() => {
    store.clear();
  });

  it("lists empty when no index exists", async () => {
    expect(await listUploadedFonts()).toEqual([]);
  });

  it("registers a font: bytes stored, index row added", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    expect(await getCachedFont("aaa")).toBe(bufA);
    expect(await listUploadedFonts()).toEqual([{ sha256: "aaa", name: "A.ttf", addedAt: 1 }]);
  });

  it("dedupes by sha256: re-registering refreshes the row, keeps one entry", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    await registerUploadedFont({ sha256: "bbb", name: "B.ttf", addedAt: 2 }, bufB);
    await registerUploadedFont({ sha256: "aaa", name: "A-renamed.ttf", addedAt: 3 }, bufA);
    const list = await listUploadedFonts();
    expect(list).toHaveLength(2);
    expect(list.find((f) => f.sha256 === "aaa")?.name).toBe("A-renamed.ttf");
  });

  it("registers without a buffer (adoption): index row only, bytes untouched", async () => {
    await registerUploadedFont({ sha256: "ccc", name: "C.ttf", addedAt: 1 });
    expect(await listUploadedFonts()).toEqual([{ sha256: "ccc", name: "C.ttf", addedAt: 1 }]);
    expect(await getCachedFont("ccc")).toBeUndefined();
  });

  it("removes a font: bytes and index row both gone, others untouched", async () => {
    await registerUploadedFont({ sha256: "aaa", name: "A.ttf", addedAt: 1 }, bufA);
    await registerUploadedFont({ sha256: "bbb", name: "B.ttf", addedAt: 2 }, bufB);
    await removeUploadedFont("aaa");
    expect(await getCachedFont("aaa")).toBeUndefined();
    expect(await getCachedFont("bbb")).toBe(bufB);
    expect(await listUploadedFonts()).toEqual([{ sha256: "bbb", name: "B.ttf", addedAt: 2 }]);
  });
});
