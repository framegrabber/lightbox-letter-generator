import type { Parameters } from "../state/parameters";

function describeFont(source: Parameters["fontSource"]): string {
  if (source.kind === "bundled") return `${source.id} (bundled)`;
  return `${source.name} (uploaded, sha256 ${source.sha256.slice(0, 16)}…)`;
}

// Build the human-readable README that ships at the root of the export zip.
// Includes a reproduce-URL (with the parameters encoded as `?p=…`) so the
// user can paste it back into a browser to recreate this exact export.
export function buildReadme(params: Parameters, reproduceUrl: string): string {
  return [
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
    ``,
    `Files in this archive:`,
    `  stl/NN_<letter>.stl    — 3D-printable letter shells`,
    `  plexi/NN_<letter>.svg  — plexi cut shapes (cut these from acrylic)`,
    ``,
    `NN preserves source word order. Spaces are skipped.`,
    ``,
  ].join("\n");
}
