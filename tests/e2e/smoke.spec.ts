import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, export STL", async ({ page }) => {
  await page.goto("/");

  // Self-contained settings so the test doesn't depend on default values
  // that may change. wallThickness=3 is small enough for thin strokes at 80mm.
  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");

  // Wait for preview to settle (heuristic: STL button enables when build completes).
  const stlButton = page.getByRole("button", { name: /Download STL/ });
  await expect(stlButton).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await stlButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);
  expect(zip.file("01_H.stl")).toBeTruthy();
  expect(zip.file("02_i.stl")).toBeTruthy();
  expect(zip.file("manifest.json")).toBeTruthy();
});
