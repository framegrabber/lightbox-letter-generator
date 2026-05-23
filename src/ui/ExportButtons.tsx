import { useState } from "react";
import { saveAs } from "file-saver";
import { useParameters } from "../state/parameters";
import type { FontSource } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { meshToBinarySTL } from "../exporters/stl";
import { polygonsToSVG } from "../exporters/svg";
import { bundleSTLs, bundleSVGs } from "../exporters/zip";
import { buildManifest } from "../exporters/manifest";
import { sha256OfBuffer } from "../fonts/load";
import { BUNDLED_FONTS, bundledFontById } from "../fonts/bundled";

type Props = { disabled: boolean };

async function fontShaForSource(source: FontSource): Promise<string> {
  if (source.kind === "uploaded") return source.sha256;
  const def = bundledFontById(source.id) ?? BUNDLED_FONTS[0];
  const buf = await (await fetch(`./${def.path}`)).arrayBuffer();
  return sha256OfBuffer(buf);
}

export function ExportButtons({ disabled }: Props) {
  const params = useParameters();
  const { result, busy: buildBusy } = usePreviewBuildContext();
  const [busy, setBusy] = useState<"stl" | "svg" | null>(null);

  async function exportSTL() {
    if (!result || result.letters.length === 0) return;
    setBusy("stl");
    try {
      const sha = await fontShaForSource(params.fontSource);
      const manifest = buildManifest(params, sha);
      const entries = result.letters.map((l) => ({
        char: l.char,
        index: l.index,
        stl: meshToBinarySTL({ vertProperties: l.vertProperties, triVerts: l.triVerts }),
      }));
      const blob = await bundleSTLs(entries, manifest);
      saveAs(blob, `lightbox-stl-${Date.now()}.zip`);
    } finally {
      setBusy(null);
    }
  }

  async function exportSVG() {
    if (!result || result.layers.length === 0) return;
    setBusy("svg");
    try {
      const sha = await fontShaForSource(params.fontSource);
      const manifest = buildManifest(params, sha);
      const entries = result.layers.map((l) => ({
        char: l.char,
        index: l.index,
        back: polygonsToSVG(l.back, { margin: 1 }),
        wall: polygonsToSVG(l.wall, { margin: 1 }),
        rabbet: polygonsToSVG(l.rabbet, { margin: 1 }),
        plexi: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
      const blob = await bundleSVGs(entries, manifest);
      saveAs(blob, `lightbox-svg-${Date.now()}.zip`);
    } finally {
      setBusy(null);
    }
  }

  const empty = !result || result.letters.length === 0;

  return (
    <div className="export-buttons">
      <button disabled={disabled || empty || busy !== null || buildBusy} onClick={exportSTL}>
        {busy === "stl" ? "Bundling…" : "Download STL (.zip)"}
      </button>
      <button disabled={disabled || empty || busy !== null || buildBusy} onClick={exportSVG}>
        {busy === "svg" ? "Bundling…" : "Download SVG (.zip)"}
      </button>
    </div>
  );
}
