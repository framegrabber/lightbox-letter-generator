import { useState } from "react";
import { saveAs } from "file-saver";
import { useParameters } from "../state/parameters";
import type { Parameters } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { meshToBinarySTL } from "../exporters/stl";
import { polygonsToSVG } from "../exporters/svg";
import { bundleAll } from "../exporters/zip";
import { buildReadme } from "../exporters/manifest";
import { buildZipFilename } from "../exporters/filename";

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
    letterOverlap: params.letterOverlap,
    bridgeWidth: params.bridgeWidth,
    bridgeHeight: params.bridgeHeight,
    bridgeY: params.bridgeY,
    plexiTolerance: params.plexiTolerance,
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
    if (!result || result.components.length === 0) return;
    setBusy(true);
    try {
      const shells = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
      }));
      const layersByChars = new Map(
        result.layers.map((l) => [l.members.map((m) => m.char).join(""), l] as const),
      );

      const componentsWithPlexi = result.components.filter(
        (c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null,
      );
      const plexiStls = componentsWithPlexi.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({
          vertProperties: c.plexi.vertProperties,
          triVerts: c.plexi.triVerts,
        }),
      }));
      const plexiSvgs = componentsWithPlexi.map((c) => {
        const chars = c.members.map((m) => m.char).join("");
        const layer = layersByChars.get(chars);
        // Invariant: a component with a non-null plexi mesh always has a
        // matching layer entry — both gate on the same rabbetCut offset
        // (lipWidth + plexiTolerance) and the same cavity check. If this
        // ever fires, the worker contract has drifted.
        if (!layer) throw new Error(`missing plexi layer for component '${chars}'`);
        return { chars, svg: polygonsToSVG(layer.plexi, { margin: 1 }) };
      });
      const pieces = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        count: c.members.length,
      }));
      const readme = buildReadme(params, buildReproduceUrl(params), pieces);
      const blob = await bundleAll(shells, plexiStls, plexiSvgs, readme);
      saveAs(blob, buildZipFilename(params.text, new Date()));
    } finally {
      setBusy(false);
    }
  }

  const empty = !result || result.components.length === 0;

  return (
    <div className="export-buttons">
      <button disabled={disabled || empty || busy || buildBusy} onClick={exportZip}>
        {busy ? "Bundling…" : "Download (.zip)"}
      </button>
    </div>
  );
}
