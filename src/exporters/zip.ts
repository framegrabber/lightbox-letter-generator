import JSZip from "jszip";

const README = `Lightbox letter generator output

Files in this archive:
  NN_<letter>_back.svg    — solid letter outline (the floor)
  NN_<letter>_wall.svg    — wall ring (donut). Stack copies to (totalDepth - rabbetDepth - backThickness).
  NN_<letter>_rabbet.svg  — rabbet ring (the visible lip)
  NN_<letter>_plexi.svg   — plexi cut shape (drops into the rabbet)

Stack order from back to front:
  1× back
  N× wall  (until you reach totalDepth - rabbetDepth - backThickness)
  1× rabbet
  Plexi sheet sits inside rabbet, flush with front face.

NN preserves source word order. Spaces are skipped.
`;

function safeFilenameFragment(ch: string, fallback: string): string {
  return /[A-Za-z0-9]/.test(ch) ? ch : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type STLEntry = { char: string; index: number; stl: ArrayBuffer };

export async function bundleSTLs(entries: STLEntry[], manifestJson: string): Promise<Blob> {
  const zip = new JSZip();
  entries.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}.stl`;
    zip.file(name, e.stl);
  });
  zip.file("manifest.json", manifestJson);
  return zip.generateAsync({ type: "blob" });
}

export type SVGEntry = {
  char: string;
  index: number;
  back: string;
  wall: string;
  rabbet: string;
  plexi: string;
};

export async function bundleSVGs(entries: SVGEntry[], manifestJson: string): Promise<Blob> {
  const zip = new JSZip();
  entries.forEach((e, slot) => {
    const base = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}`;
    zip.file(`${base}_back.svg`, e.back);
    zip.file(`${base}_wall.svg`, e.wall);
    zip.file(`${base}_rabbet.svg`, e.rabbet);
    zip.file(`${base}_plexi.svg`, e.plexi);
  });
  zip.file("manifest.json", manifestJson);
  zip.file("README.txt", README);
  return zip.generateAsync({ type: "blob" });
}
