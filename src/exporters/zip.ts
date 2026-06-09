import JSZip from "jszip";

function safeFilenameFragment(chars: string, fallback: string): string {
  const cleaned = chars.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type ShellEntry = { chars: string; stl: ArrayBuffer };
export type PlexiStlEntry = { chars: string; stl: ArrayBuffer };
export type PlexiSvgEntry = { chars: string; svg: string };

// Bundle one zip with three role-grouped folders plus a README at the root:
//   stl/chars/NN_<chars>_char.stl   — printable letter shells
//   stl/plexi/NN_<chars>_plexi.stl  — printable plexi inserts
//   svg/NN_<chars>_plexi.svg        — laser-cut plexi cut sheets
//
// Filenames carry a literal _char or _plexi suffix so a file moved out of
// its folder still self-describes. Slot index is the array position
// (1-based, zero-padded). A component without a plexi just doesn't appear
// in the plexi arrays — its shell still ships under stl/chars.
export async function bundleAll(
  shells: ShellEntry[],
  plexiStls: PlexiStlEntry[],
  plexiSvgs: PlexiSvgEntry[],
  readme: string,
): Promise<Blob> {
  const zip = new JSZip();
  const stlChars = zip.folder("stl/chars");
  const stlPlexi = zip.folder("stl/plexi");
  const svgDir = zip.folder("svg");
  if (!stlChars || !stlPlexi || !svgDir) throw new Error("zip folder creation failed");

  shells.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_char.stl`;
    stlChars.file(name, e.stl);
  });
  plexiStls.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_plexi.stl`;
    stlPlexi.file(name, e.stl);
  });
  plexiSvgs.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}_plexi.svg`;
    svgDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
