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
    `  Mount shank dia:   ${params.mountShankDiameter} mm`,
    `  Mount slot Y:      ${params.mountSlotY} mm`,
    `  Mount slot inset:  ${params.mountSlotXInset} mm`,
    `  Bulb hole dia:     ${params.bulbHoleDiameter} mm`,
    `  Bulb hole spacing: ${params.bulbHoleSpacing} mm`,
    `  Bulb hole max:     ${params.bulbHoleMaxCount}`,
  ];

  if (params.maxPieceWidth > 0 || params.cuts.length > 0) {
    lines.push(`  Max piece width:   ${params.maxPieceWidth} mm`);
  }
  lines.push(``);

  if (params.cuts.length > 0) {
    lines.push(`Slicing:`);
    lines.push(`  Max piece width:    ${params.maxPieceWidth > 0 ? `${params.maxPieceWidth} mm` : "disabled"}`);
    lines.push(`  Cuts (${params.cuts.length}):`);
    params.cuts.forEach((c, i) => {
      const xStr = c.x.toFixed(1).padStart(5, " ");
      const angleStr = c.angle >= 0 ? ` ${c.angle.toFixed(1)}` : c.angle.toFixed(1);
      lines.push(`    Cut ${i + 1}: x = ${xStr} mm,  angle = ${angleStr}°`);
    });
    if (pieces && pieces.length > 0) {
      const totalPieces = pieces.reduce((sum, p) => sum + p.count, 0);
      lines.push(`  Pieces per word:    ${totalPieces}`);
    }
    lines.push(``);
  }

  lines.push(`Files in this archive:`);
  lines.push(`  stl/chars/NN_<chars>_char.stl             — 3D-printable letter shells`);
  lines.push(`  stl/chars/NN_<chars>_char_slice-K.stl     — sliced letter shells`);
  lines.push(`  stl/plexi/NN_<chars>_plexi.stl            — 3D-printable plexi inserts`);
  lines.push(`  stl/plexi/NN_<chars>_plexi_slice-K.stl    — sliced plexi inserts`);
  lines.push(`  svg/NN_<chars>_plexi.svg                  — plexi cut shapes (cut these from acrylic)`);
  lines.push(`  svg/NN_<chars>_plexi_slice-K.svg          — sliced plexi cut shapes`);
  lines.push(``);
  lines.push(`NN preserves left-to-right order. Spaces are skipped. Each component`);
  lines.push(`produces up to six files (full + sliced shell STL, full + sliced plexi STL,`);
  lines.push(`full + sliced plexi SVG) sharing the same NN slot index.`);
  lines.push(`Slice index K is 1-based and zero-padded only when total slices >= 10.`);
  lines.push(``);

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
