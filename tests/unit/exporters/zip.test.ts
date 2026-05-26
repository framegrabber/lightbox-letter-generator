import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleAll } from "../../../src/exporters/zip";

describe("bundleAll", () => {
  it("packages stls under stl/ and plexis under plexi/, plus README at root", async () => {
    const blob = await bundleAll(
      [
        { char: "M", index: 0, stl: new ArrayBuffer(84) },
        { char: "i", index: 1, stl: new ArrayBuffer(84) },
      ],
      [
        { char: "M", index: 0, svg: "<svg/>" },
        { char: "i", index: 1, svg: "<svg/>" },
      ],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_M.stl")).toBeTruthy();
    expect(zip.file("stl/02_i.stl")).toBeTruthy();
    expect(zip.file("plexi/01_M.svg")).toBeTruthy();
    expect(zip.file("plexi/02_i.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeNull();
  });

  it("uses idx fallback for non-alphanumeric letters", async () => {
    const blob = await bundleAll(
      [{ char: "?", index: 3, stl: new ArrayBuffer(84) }],
      [{ char: "?", index: 3, svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_idx3.stl")).toBeTruthy();
    expect(zip.file("plexi/01_idx3.svg")).toBeTruthy();
  });

  it("README content lands at the root", async () => {
    const readme = "Reproduce: http://example.com/?p=...\nText: BURGER";
    const blob = await bundleAll([], [], readme);
    const zip = await JSZip.loadAsync(blob);
    const f = zip.file("README.txt");
    expect(f).toBeTruthy();
    if (f) {
      const txt = await f.async("text");
      expect(txt).toBe(readme);
    }
  });
});
