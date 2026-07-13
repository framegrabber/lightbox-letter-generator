import { useState } from "react";
import { saveAs } from "file-saver";
import { useParameters } from "../state/parameters";
import type { Parameters } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { meshToBinarySTL } from "../exporters/stl";
import { polygonsToSVG } from "../exporters/svg";
import {
  bundleAll,
  type ShellEntry,
  type PlexiStlEntry,
  type PlexiSvgEntry,
  type SlicedShellEntry,
  type SlicedPlexiStlEntry,
  type SlicedPlexiSvgEntry,
} from "../exporters/zip";
import { buildReadme } from "../exporters/manifest";
import { buildZipFilename } from "../exporters/filename";

type Props = { disabled: boolean };

function buildReproduceUrl(params: Parameters): string {
  const serializable: Parameters = {
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
    backCavityDepth: params.backCavityDepth,
    cableHoleDiameter: params.cableHoleDiameter,
    cableHoleY: params.cableHoleY,
    cableHoleZ: params.cableHoleZ,
    cableHoleAtEnds: params.cableHoleAtEnds,
    mountShankDiameter: params.mountShankDiameter,
    mountSlotY: params.mountSlotY,
    mountSlotXInset: params.mountSlotXInset,
    bulbHoleDiameter: params.bulbHoleDiameter,
    bulbHoleSpacing: params.bulbHoleSpacing,
    bulbHoleInset: params.bulbHoleInset,
    bulbHoleMaxCount: params.bulbHoleMaxCount,
    maxPieceWidth: params.maxPieceWidth,
    cuts: params.cuts,
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
    if (!result) return;
    const hasFullComponents = result.components.length > 0;
    const hasSlicedComponents = (result.slicedComponents || []).length > 0;
    if (!hasFullComponents && !hasSlicedComponents) return;
    setBusy(true);
    try {
      const shells: ShellEntry[] = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
      }));
      const slicedShells: SlicedShellEntry[] = (result.slicedComponents || []).map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({ vertProperties: c.vertProperties, triVerts: c.triVerts }),
        parentSlot: c.parentSlot,
        sliceIndex: c.sliceIndex,
        totalSlices: c.totalSlices,
      }));

      const layersByChars = new Map(
        result.layers.map((l) => [l.members.map((m) => m.char).join(""), l] as const),
      );

      const componentsWithPlexi = result.components.filter(
        (c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null,
      );
      const plexiStls: PlexiStlEntry[] = componentsWithPlexi.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        stl: meshToBinarySTL({
          vertProperties: c.plexi.vertProperties,
          triVerts: c.plexi.triVerts,
        }),
      }));
      const slicedPlexiStls: SlicedPlexiStlEntry[] = (result.slicedComponents || [])
        .filter((c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null)
        .map((c) => ({
          chars: c.members.map((m) => m.char).join(""),
          stl: meshToBinarySTL({
            vertProperties: c.plexi.vertProperties,
            triVerts: c.plexi.triVerts,
          }),
          parentSlot: c.parentSlot,
          sliceIndex: c.sliceIndex,
          totalSlices: c.totalSlices,
        }));

      const plexiSvgs: PlexiSvgEntry[] = componentsWithPlexi.map((c) => {
        const chars = c.members.map((m) => m.char).join("");
        const layer = layersByChars.get(chars);
        if (!layer) throw new Error(`missing plexi layer for component '${chars}'`);
        return { chars, svg: polygonsToSVG(layer.plexi, { margin: 1 }) };
      });
      const slicedPlexiSvgs: SlicedPlexiSvgEntry[] = (result.slicedComponents || [])
        .filter((c): c is typeof c & { plexi: NonNullable<typeof c.plexi> } => c.plexi != null)
        .map((c, i) => {
          const chars = c.members.map((m) => m.char).join("");
          const layer = (result.slicedLayers || [])[i];
          if (!layer) throw new Error(`missing sliced plexi layer for component '${chars}' slice ${c.sliceIndex}`);
          return {
            chars,
            svg: polygonsToSVG(layer.plexi, { margin: 1 }),
            parentSlot: c.parentSlot,
            sliceIndex: c.sliceIndex,
            totalSlices: c.totalSlices,
          };
        });

      const pieces = result.components.map((c) => ({
        chars: c.members.map((m) => m.char).join(""),
        count: c.members.length,
      }));
      const readme = buildReadme(params, buildReproduceUrl(params), pieces);
      const blob = await bundleAll(
        shells,
        plexiStls,
        plexiSvgs,
        slicedShells,
        slicedPlexiStls,
        slicedPlexiSvgs,
        readme,
      );
      saveAs(blob, buildZipFilename(params.text, new Date()));
    } finally {
      setBusy(false);
    }
  }

  const empty = !result || (result.components.length === 0 && (result.slicedComponents || []).length === 0);

  return (
    <div className="export-buttons">
      <button disabled={disabled || empty || busy || buildBusy} onClick={exportZip}>
        {busy ? "Bundling…" : "Download (.zip)"}
      </button>
    </div>
  );
}
