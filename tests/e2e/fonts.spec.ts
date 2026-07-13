import { test, expect } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "../fixtures/fonts/Inter-Regular.ttf");

test("uploaded fonts persist in the picker and can be removed", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Text").fill("Hi");

  // Exact match: the "Remove uploaded font" button's aria-label also
  // contains the substring "font", which collides with a loose getByLabel.
  const select = page.getByLabel("Font", { exact: true });

  // Upload: setInputFiles works on the hidden file input directly.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  // The uploaded font is selected and listed under the Uploaded optgroup.
  const uploadedOption = page.locator('optgroup[label="Uploaded"] option', {
    hasText: "Inter-Regular.ttf",
  });
  await expect(uploadedOption).toHaveCount(1);
  await expect(select).toHaveValue(/^[0-9a-f]{64}$/);

  // Switch to a bundled font — the upload stays in the list.
  await select.selectOption("anton");
  await expect(select).toHaveValue("anton");
  await expect(uploadedOption).toHaveCount(1);

  // Switch back WITHOUT re-uploading.
  const sha = await uploadedOption.getAttribute("value");
  await select.selectOption(sha!);
  await expect(select).toHaveValue(sha!);

  // Survives a reload (registry + bytes live in IndexedDB).
  await page.reload();
  await expect(page.locator('optgroup[label="Uploaded"] option')).toHaveCount(1);
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue(sha!);

  // Remove: falls back to the default bundled font, option disappears.
  await page.getByRole("button", { name: "Remove uploaded font" }).click();
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("anton");
  await expect(page.locator('optgroup[label="Uploaded"]')).toHaveCount(0);
});
