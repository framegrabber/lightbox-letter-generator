import opentype from "opentype.js";

export async function parseFontBuffer(buffer: ArrayBuffer): Promise<opentype.Font> {
  const font = opentype.parse(buffer);
  if (!font || !font.unitsPerEm) {
    throw new Error("Invalid font file");
  }
  return font;
}

export async function sha256OfBuffer(buffer: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SubtleCrypto is not available in this environment");
  }
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
