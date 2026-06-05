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
    ``,
    `Files in this archive:`,
    `  stl/NN_<chars>.stl    — 3D-printable shells (one per connected component)`,
    `  plexi/NN_<chars>.svg  — plexi cut shapes (cut these from acrylic)`,
    ``,
    `NN preserves left-to-right order. Spaces are skipped.`,
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
