import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, download zip", async ({ page }) => {
  await page.goto("/");

  // Self-contained settings so the test doesn't depend on default values
  // that may change. wallThickness=3 is small enough for thin strokes at 80mm.
  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");

  // Wait for preview to settle (heuristic: download button enables when build completes).
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
  expect(zip.file("stl/01_H.stl")).toBeTruthy();
  expect(zip.file("stl/02_i.stl")).toBeTruthy();
  expect(zip.file("plexi/01_H.svg")).toBeTruthy();
  expect(zip.file("plexi/02_i.svg")).toBeTruthy();
  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Reproduce");
    expect(text).toContain("?p=");
    expect(text).toContain("Hi");
  }
  expect(zip.file("manifest.json")).toBeNull();
});
