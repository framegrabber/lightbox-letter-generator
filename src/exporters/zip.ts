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

export type SlicedShellEntry = ShellEntry & { parentSlot: number; sliceIndex: number; totalSlices: number };
export type SlicedPlexiStlEntry = PlexiStlEntry & { parentSlot: number; sliceIndex: number; totalSlices: number };
export type SlicedPlexiSvgEntry = PlexiSvgEntry & { parentSlot: number; sliceIndex: number; totalSlices: number };

// Bundle one zip with three role-grouped folders plus a README at the root:
//   stl/chars/NN_<chars>_char.stl             — printable letter shells
//   stl/chars/NN_<chars>_char_slice-K.stl     — sliced letter shells (K is 1-based)
//   stl/plexi/NN_<chars>_plexi.stl            — printable plexi inserts
//   stl/plexi/NN_<chars>_plexi_slice-K.stl    — sliced plexi inserts
//   svg/NN_<chars>_plexi.svg                  — laser-cut plexi cut sheets
//   svg/NN_<chars>_plexi_slice-K.svg          — sliced plexi cut sheets
//
// Slice index K is zero-padded only when totalSlices >= 10.
export async function bundleAll(
  shells: ShellEntry[],
  plexiStls: PlexiStlEntry[],
  plexiSvgs: PlexiSvgEntry[],
  slicedShells: SlicedShellEntry[],
  slicedPlexiStls: SlicedPlexiStlEntry[],
  slicedPlexiSvgs: SlicedPlexiSvgEntry[],
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

  const slicePad = (idx: number, total: number) => {
    return total >= 10 ? idx.toString().padStart(2, "0") : idx.toString();
  };

  slicedShells.forEach((e) => {
    const parent = pad2(e.parentSlot);
    const chars = safeFilenameFragment(e.chars, `component${e.parentSlot}`);
    const sliceStr = slicePad(e.sliceIndex, e.totalSlices);
    const name = `${parent}_${chars}_char_slice-${sliceStr}.stl`;
    stlChars.file(name, e.stl);
  });

  slicedPlexiStls.forEach((e) => {
    const parent = pad2(e.parentSlot);
    const chars = safeFilenameFragment(e.chars, `component${e.parentSlot}`);
    const sliceStr = slicePad(e.sliceIndex, e.totalSlices);
    const name = `${parent}_${chars}_plexi_slice-${sliceStr}.stl`;
    stlPlexi.file(name, e.stl);
  });

  slicedPlexiSvgs.forEach((e) => {
    const parent = pad2(e.parentSlot);
    const chars = safeFilenameFragment(e.chars, `component${e.parentSlot}`);
    const sliceStr = slicePad(e.sliceIndex, e.totalSlices);
    const name = `${parent}_${chars}_plexi_slice-${sliceStr}.svg`;
    svgDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
