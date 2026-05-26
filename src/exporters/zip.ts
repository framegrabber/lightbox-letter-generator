import JSZip from "jszip";

function safeFilenameFragment(ch: string, fallback: string): string {
  return /[A-Za-z0-9]/.test(ch) ? ch : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type STLEntry = { char: string; index: number; stl: ArrayBuffer };
export type PlexiEntry = { char: string; index: number; svg: string };

// Bundle one zip with stl/ and plexi/ subfolders plus a README at the root.
export async function bundleAll(
  stls: STLEntry[],
  plexis: PlexiEntry[],
  readme: string,
): Promise<Blob> {
  const zip = new JSZip();
  const stlDir = zip.folder("stl");
  const plexiDir = zip.folder("plexi");
  if (!stlDir || !plexiDir) throw new Error("zip folder creation failed");

  stls.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}.stl`;
    stlDir.file(name, e.stl);
  });
  plexis.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.char, `idx${e.index}`)}.svg`;
    plexiDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
