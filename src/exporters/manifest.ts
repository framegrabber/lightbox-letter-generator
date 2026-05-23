import type { Parameters } from "../state/parameters";

export function buildManifest(params: Parameters, fontHash: string): string {
  return JSON.stringify(
    {
      generator: "lightbox-letter-generator",
      version: 1,
      generatedAt: new Date().toISOString(),
      parameters: { ...params },
      fontSha256: fontHash,
    },
    null,
    2,
  );
}
