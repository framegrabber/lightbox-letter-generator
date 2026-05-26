import { useState } from "react";
import { saveAs } from "file-saver";
import { useParameters } from "../state/parameters";
import type { Parameters } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { meshToBinarySTL } from "../exporters/stl";
import { polygonsToSVG } from "../exporters/svg";
import { bundleAll } from "../exporters/zip";
import { buildReadme } from "../exporters/manifest";

type Props = { disabled: boolean };

function buildReproduceUrl(params: Parameters): string {
  const serializable = {
    text: params.text,
    fontSource: params.fontSource,
    letterHeight: params.letterHeight,
    wallThickness: params.wallThickness,
    totalDepth: params.totalDepth,
    backThickness: params.backThickness,
    rabbetDepth: params.rabbetDepth,
    insetWidth: params.insetWidth,
    bezierTolerance: params.bezierTolerance,
  };
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("p", JSON.stringify(serializable));
  return url.toString();
}

export function ExportButtons({ disabled }: Props) {
  const params = useParameters();
  const { result, busy: buildBusy } = usePreviewBuildContext();
  const [busy, setBusy] = useState(false);

  async function exportZip() {
    if (!result || result.letters.length === 0) return;
    setBusy(true);
    try {
      const stls = result.letters.map((l) => ({
        char: l.char,
        index: l.index,
        stl: meshToBinarySTL({ vertProperties: l.vertProperties, triVerts: l.triVerts }),
      }));
      const plexis = result.layers.map((l) => ({
        char: l.char,
        index: l.index,
        svg: polygonsToSVG(l.plexi, { margin: 1 }),
      }));
      const readme = buildReadme(params, buildReproduceUrl(params));
      const blob = await bundleAll(stls, plexis, readme);
      saveAs(blob, `lightbox-${Date.now()}.zip`);
    } finally {
      setBusy(false);
    }
  }

  const empty = !result || result.letters.length === 0;

  return (
    <div className="export-buttons">
      <button disabled={disabled || empty || busy || buildBusy} onClick={exportZip}>
        {busy ? "Bundling…" : "Download (.zip)"}
      </button>
    </div>
  );
}
