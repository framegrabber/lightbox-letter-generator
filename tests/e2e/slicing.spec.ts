import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: slicing exports both full assembly and sliced pieces", async ({ page }) => {
  // Use a URL that pre-loads with cuts already set. letterHeight=120 produces
  // a word ~90mm wide; cuts at 30 and 60 both fall within that bbox so each
  // letter that overlaps is split into 2 pieces.
  const encodedParams = JSON.stringify({
    text: "Hi",
    fontSource: { kind: "bundled", id: "anton" },
    letterHeight: 120,
    wallThickness: 3,
    totalDepth: 100,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 1.5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 60,
    plexiTolerance: 0.1,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 60,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 90,
    mountSlotXInset: 6,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 3,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 40,
    cuts: [{ x: 30, angle: 0 }, { x: 60, angle: 0 }],
  });
  await page.goto(`/?p=${encodeURIComponent(encodedParams)}`);

  // Wait for the first build to finish (worker may take a moment with cuts).
  await page.waitForTimeout(1500);

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // Full assembly files must be present — the un-sliced versions.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeTruthy();
  expect(zip.file("stl/chars/02_i_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_H_plexi.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/02_i_plexi.stl")).toBeTruthy();

  // Sliced pieces must ALSO be present.
  const sliceFiles = Object.keys(zip.files).filter((n) => n.includes("_slice-"));
  expect(sliceFiles.length).toBeGreaterThan(0);
  for (const sliceFileName of sliceFiles) {
    // 01_H_char_slice-1.stl → 01_H_char.stl
    const baseName = sliceFileName.replace(/_slice-\d+/, "");
    expect(zip.file(baseName)).toBeTruthy();
  }

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
}, { timeout: 45_000 });