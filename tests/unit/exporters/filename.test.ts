import { describe, it, expect } from "vitest";
import { buildZipFilename } from "../../../src/exporters/filename";

describe("buildZipFilename", () => {
  // Use a Date instance directly so we don't depend on the host timezone:
  // Date constructed from local components (Y, M, D, h, m, s) — getFullYear()
  // etc. return those exact components regardless of where the test runs.
  const localDate = new Date(2026, 5, 9, 14, 34, 56); // June 9 2026, 14:34:56 local

  it("includes a sanitized text and local-timezone ISO timestamp", () => {
    expect(buildZipFilename("BURGER", localDate)).toBe(
      "lightbox-BURGER-2026-06-09T14-34-56.zip",
    );
  });

  it("replaces whitespace with underscores", () => {
    expect(buildZipFilename("HELLO WORLD", localDate)).toBe(
      "lightbox-HELLO_WORLD-2026-06-09T14-34-56.zip",
    );
  });

  it("strips characters outside [A-Za-z0-9_-]", () => {
    expect(buildZipFilename("Hi!?", localDate)).toBe(
      "lightbox-Hi-2026-06-09T14-34-56.zip",
    );
  });

  it("omits the text segment when sanitization produces an empty string", () => {
    expect(buildZipFilename("??", localDate)).toBe(
      "lightbox-2026-06-09T14-34-56.zip",
    );
  });

  it("omits the text segment when text is empty", () => {
    expect(buildZipFilename("", localDate)).toBe(
      "lightbox-2026-06-09T14-34-56.zip",
    );
  });

  it("zero-pads single-digit components", () => {
    const d = new Date(2026, 0, 1, 1, 2, 3); // Jan 1 2026, 01:02:03
    expect(buildZipFilename("A", d)).toBe("lightbox-A-2026-01-01T01-02-03.zip");
  });
});
