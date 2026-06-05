import JSZip from "jszip";

function safeFilenameFragment(chars: string, fallback: string): string {
  const cleaned = chars.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type STLEntry = { chars: string; stl: ArrayBuffer };
export type PlexiEntry = { chars: string; svg: string };

// Bundle one zip with stl/ and plexi/ subfolders plus a README at the root.
// Filenames use the joined member chars per component, sanitized to a safe
// subset; the slot index (1-based) is the zero-padded prefix.
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
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}.stl`;
    stlDir.file(name, e.stl);
  });
  plexis.forEach((e, slot) => {
    const name = `${pad2(slot + 1)}_${safeFilenameFragment(e.chars, `component${slot + 1}`)}.svg`;
    plexiDir.file(name, e.svg);
  });

  zip.file("README.txt", readme);
  return zip.generateAsync({ type: "blob" });
}
