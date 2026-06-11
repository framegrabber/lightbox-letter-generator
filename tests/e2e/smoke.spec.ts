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

  // Filename starts with lightbox-Hi- and ends in .zip; the middle is the
  // local-time ISO segment which we don't pin precisely.
  expect(download.suggestedFilename()).toMatch(/^lightbox-Hi-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // New layout: stl/chars, stl/plexi, svg.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeTruthy();
  expect(zip.file("stl/chars/02_i_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_H_plexi.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/02_i_plexi.stl")).toBeTruthy();
  expect(zip.file("svg/01_H_plexi.svg")).toBeTruthy();
  expect(zip.file("svg/02_i_plexi.svg")).toBeTruthy();

  // Old layout must not survive.
  expect(zip.file("stl/01_H.stl")).toBeNull();
  expect(zip.file("plexi/01_H.svg")).toBeNull();
  expect(zip.file("manifest.json")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Reproduce");
    expect(text).toContain("?p=");
    expect(text).toContain("Hi");
    expect(text).toContain("Plexi tolerance:");
    expect(text).toContain("stl/chars/");
  }
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

  expect(download.suggestedFilename()).toMatch(/^lightbox-Hi-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // One merged shell + one merged plexi STL + one merged plexi SVG.
  expect(zip.file("stl/chars/01_Hi_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_Hi_plexi.stl")).toBeTruthy();
  expect(zip.file("svg/01_Hi_plexi.svg")).toBeTruthy();
  // No per-letter files.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeNull();
  expect(zip.file("stl/chars/02_i_char.stl")).toBeNull();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Pieces:");
    expect(text).toContain("01_Hi");
    expect(text).toContain("Letter overlap:");
    expect(text).toContain("Plexi tolerance:");
  }
});

test("end-to-end: bulb holes feature on", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Text").fill("H");
  await page.getByLabel("Letter height").fill("80");
  await page.getByLabel("Wall thickness").fill("3");
  await page.getByLabel("Inset width").fill("1.5");
  // Enable bulb holes; values chosen so the H's strokes get a few holes each.
  await page.getByLabel("Bulb hole diameter").fill("8");
  await page.getByLabel("Bulb hole spacing").fill("30");
  await page.getByLabel("Bulb hole inset").fill("3");
  await page.getByLabel("Bulb hole max per letter").fill("8");

  const button = page.getByRole("button", { name: /Download/ });
  await expect(button).toBeEnabled({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  expect(download.suggestedFilename()).toMatch(/^lightbox-H-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/);

  const fs = await import("node:fs/promises");
  const buf = await fs.readFile(path!);
  const zip = await JSZip.loadAsync(buf);

  // The shape of the zip is unchanged by the feature.
  expect(zip.file("stl/chars/01_H_char.stl")).toBeTruthy();
  expect(zip.file("stl/plexi/01_H_plexi.stl")).toBeTruthy();
  expect(zip.file("svg/01_H_plexi.svg")).toBeTruthy();

  const readme = zip.file("README.txt");
  expect(readme).toBeTruthy();
  if (readme) {
    const text = await readme.async("text");
    expect(text).toContain("Bulb hole dia:");
    expect(text).toContain("8 mm"); // diameter we set
  }
});
