import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleSTLs, bundleSVGs } from "../../../src/exporters/zip";

describe("bundleSTLs", () => {
  it("packages letters with numeric prefixes and a manifest", async () => {
    const blob = await bundleSTLs(
      [
        { char: "M", index: 0, stl: new ArrayBuffer(84) },
        { char: "i", index: 1, stl: new ArrayBuffer(84) },
      ],
      "{}",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("01_M.stl")).toBeTruthy();
    expect(zip.file("02_i.stl")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeTruthy();
  });

  it("uses safe filenames for non-alphanumeric letters", async () => {
    const blob = await bundleSTLs(
      [{ char: "?", index: 0, stl: new ArrayBuffer(84) }],
      "{}",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toContainEqual(expect.stringMatching(/^01_/));
  });
});

describe("bundleSVGs", () => {
  it("packages four svgs per letter plus README", async () => {
    const blob = await bundleSVGs(
      [
        {
          char: "M",
          index: 0,
          back: "<svg/>",
          wall: "<svg/>",
          rabbet: "<svg/>",
          plexi: "<svg/>",
        },
      ],
      "manifest",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("01_M_back.svg")).toBeTruthy();
    expect(zip.file("01_M_wall.svg")).toBeTruthy();
    expect(zip.file("01_M_rabbet.svg")).toBeTruthy();
    expect(zip.file("01_M_plexi.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
  });
});
