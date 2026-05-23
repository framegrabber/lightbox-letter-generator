import { useRef } from "react";
import { useParameters } from "../state/parameters";
import { BUNDLED_FONTS } from "../fonts/bundled";
import { sha256OfBuffer, parseFontBuffer } from "../fonts/load";
import { cacheFont } from "../fonts/cache";

export function FontPicker() {
  const fontSource = useParameters((s) => s.fontSource);
  const set = useParameters((s) => s.set);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    const buf = await file.arrayBuffer();
    try {
      await parseFontBuffer(buf);
    } catch (err) {
      alert(`Could not parse font: ${(err as Error).message}`);
      return;
    }
    const sha = await sha256OfBuffer(buf);
    await cacheFont(sha, buf);
    set({ fontSource: { kind: "uploaded", name: file.name, sha256: sha } });
  }

  return (
    <div className="font-picker">
      <label htmlFor="font">Font</label>
      <select
        id="font"
        value={fontSource.kind === "bundled" ? fontSource.id : "__uploaded"}
        onChange={(e) => {
          if (e.target.value !== "__uploaded") {
            set({ fontSource: { kind: "bundled", id: e.target.value } });
          }
        }}
      >
        {BUNDLED_FONTS.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
        {fontSource.kind === "uploaded" && (
          <option value="__uploaded">Uploaded: {fontSource.name}</option>
        )}
      </select>
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
        }}
      />
    </div>
  );
}
