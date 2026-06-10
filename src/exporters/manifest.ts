import type { Parameters } from "../state/parameters";

function describeFont(source: Parameters["fontSource"]): string {
  if (source.kind === "bundled") return `${source.id} (bundled)`;
  return `${source.name} (uploaded, sha256 ${source.sha256.slice(0, 16)}…)`;
}

export type PieceDescriptor = { chars: string; count: number };

// Build the human-readable README that ships at the root of the export zip.
// Includes a reproduce-URL (with the parameters encoded as `?p=…`) so the
// user can paste it back into a browser to recreate this exact export.
export function buildReadme(
  params: Parameters,
  reproduceUrl: string,
  pieces?: PieceDescriptor[],
): string {
  const lines: string[] = [
    `Lightbox letter generator output`,
    ``,
    `Generated:  ${new Date().toISOString()}`,
    ``,
    `Reproduce this download:`,
    `  ${reproduceUrl}`,
    ``,
    `Parameters:`,
    `  Text:              ${params.text}`,
    `  Font:              ${describeFont(params.fontSource)}`,
    `  Letter height:     ${params.letterHeight} mm`,
    `  Wall thickness:    ${params.wallThickness} mm`,
    `  Total depth:       ${params.totalDepth} mm`,
    `  Back thickness:    ${params.backThickness} mm`,
    `  Rabbet depth:      ${params.rabbetDepth} mm`,
    `  Inset width:       ${params.insetWidth} mm`,
    `  Bezier tolerance:  ${params.bezierTolerance} mm`,
    `  Letter overlap:    ${params.letterOverlap} mm`,
    `  Bridge width:      ${params.bridgeWidth} mm`,
    `  Bridge height:     ${params.bridgeHeight} mm`,
    `  Bridge Y:          ${params.bridgeY} mm`,
    `  Plexi tolerance:   ${params.plexiTolerance} mm`,
    `  Back cavity depth: ${params.backCavityDepth} mm`,
    `  Cable hole dia:    ${params.cableHoleDiameter} mm`,
    `  Cable hole Y:      ${params.cableHoleY} mm`,
    `  Cable hole Z:      ${params.cableHoleZ} mm`,
    `  Cable hole ends:   ${params.cableHoleAtEnds ? "yes" : "no"}`,
    ``,
    `Files in this archive:`,
    `  stl/chars/NN_<chars>_char.stl    — 3D-printable letter shells`,
    `  stl/plexi/NN_<chars>_plexi.stl   — 3D-printable plexi inserts`,
    `  svg/NN_<chars>_plexi.svg          — plexi cut shapes (cut these from acrylic)`,
    ``,
    `NN preserves left-to-right order. Spaces are skipped. Each component`,
    `produces up to three files (shell STL, plexi STL, plexi SVG) sharing`,
    `the same NN slot index.`,
    ``,
  ];

  if (pieces && pieces.length > 0) {
    lines.push(`Pieces:`);
    pieces.forEach((p, i) => {
      const slot = (i + 1).toString().padStart(2, "0");
      lines.push(`  ${slot}_${p.chars}  (${p.count} ${p.count === 1 ? "letter" : "letters"})`);
    });
    lines.push(``);
  }

  return lines.join("\n");
}
