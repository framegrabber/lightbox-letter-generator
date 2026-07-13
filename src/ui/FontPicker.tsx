import { useEffect, useRef, useState } from "react";
import { useParameters, DEFAULT_PARAMETERS } from "../state/parameters";
import { BUNDLED_FONTS } from "../fonts/bundled";
import { sha256OfBuffer, parseFontBuffer } from "../fonts/load";
import {
  listUploadedFonts,
  registerUploadedFont,
  removeUploadedFont,
} from "../fonts/cache";
import type { UploadedFontMeta } from "../fonts/cache";

export function FontPicker() {
  const fontSource = useParameters((s) => s.fontSource);
  const set = useParameters((s) => s.set);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedFontMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let list = await listUploadedFonts();
        // Adopt a selected upload that predates the registry so it isn't lost.
        const src = useParameters.getState().fontSource;
        if (src.kind === "uploaded" && !list.some((f) => f.sha256 === src.sha256)) {
          await registerUploadedFont({ sha256: src.sha256, name: src.name, addedAt: Date.now() });
          list = await listUploadedFonts();
        }
        if (!cancelled) setUploads(list);
      } catch {
        // IndexedDB unavailable — bundled fonts still work.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(file: File) {
    const buf = await file.arrayBuffer();
    try {
      await parseFontBuffer(buf);
    } catch (err) {
      alert(`Could not parse font: ${(err as Error).message}`);
      return;
    }
    const sha = await sha256OfBuffer(buf);
    await registerUploadedFont({ sha256: sha, name: file.name, addedAt: Date.now() }, buf);
    setUploads(await listUploadedFonts());
    set({ fontSource: { kind: "uploaded", name: file.name, sha256: sha } });
  }

  async function handleRemove(sha256: string) {
    await removeUploadedFont(sha256);
    setUploads(await listUploadedFonts());
    set({ fontSource: DEFAULT_PARAMETERS.fontSource });
  }

  const selectedSha = fontSource.kind === "uploaded" ? fontSource.sha256 : null;
  const selectedUnlisted =
    selectedSha !== null && !uploads.some((f) => f.sha256 === selectedSha);

  return (
    <div className="font-picker">
      <label htmlFor="font">Font</label>
      <select
        id="font"
        value={fontSource.kind === "bundled" ? fontSource.id : fontSource.sha256}
        onChange={(e) => {
          const v = e.target.value;
          const up = uploads.find((f) => f.sha256 === v);
          if (up) {
            set({ fontSource: { kind: "uploaded", name: up.name, sha256: up.sha256 } });
          } else {
            set({ fontSource: { kind: "bundled", id: v } });
          }
        }}
      >
        <optgroup label="Bundled">
          {BUNDLED_FONTS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </optgroup>
        {(uploads.length > 0 || selectedUnlisted) && (
          <optgroup label="Uploaded">
            {uploads.map((f) => (
              <option key={f.sha256} value={f.sha256}>{f.name}</option>
            ))}
            {selectedUnlisted && fontSource.kind === "uploaded" && (
              <option value={fontSource.sha256}>{fontSource.name}</option>
            )}
          </optgroup>
        )}
      </select>
      {selectedSha !== null && (
        <button
          type="button"
          aria-label="Remove uploaded font"
          title="Remove uploaded font"
          onClick={() => void handleRemove(selectedSha)}
        >
          Remove
        </button>
      )}
      <button type="button" onClick={() => fileRef.current?.click()}>
        Upload TTF/OTF…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,application/font-sfnt"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
