import { test, expect } from "@playwright/test";
import JSZip from "jszip";

test("end-to-end: type word, download zip", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");

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
    expect(text).toContain("Letter overlap:");
  }
  expect(zip.file("manifest.json")).toBeNull();
});

test("end-to-end: connected mode merges letters into one STL", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("Hi");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");
  // Pull H and i together far enough that their outlines overlap.
  // Anton (the bundled default font) at letterHeight=80 produces an "H"
  // whose advance leaves enough gap that an overlap of 30mm reliably
  // merges the two letters. If a future font change breaks this, bump
  // the value (40, 50, ...) until the merge fires.
  await page.getByLabel("Letter overlap").fill("30");

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

  // One merged STL named with both chars (letter order preserved).
  expect(zip.file("stl/01_Hi.stl")).toBeTruthy();
  expect(zip.file("plexi/01_Hi.svg")).toBeTruthy();
  // No per-letter STLs.
  expect(zip.file("stl/01_H.stl")).toBeNull();
  expect(zip.file("stl/02_i.stl")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Pieces:");
    expect(text).toContain("01_Hi");
    expect(text).toContain("Letter overlap:");
  }
});
