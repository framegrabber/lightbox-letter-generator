import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleAll } from "../../../src/exporters/zip";

describe("bundleAll", () => {
  it("packages stls under stl/ and plexis under plexi/, plus README at root", async () => {
    const blob = await bundleAll(
      [
        { chars: "M", stl: new ArrayBuffer(84) },
        { chars: "i", stl: new ArrayBuffer(84) },
      ],
      [
        { chars: "M", svg: "<svg/>" },
        { chars: "i", svg: "<svg/>" },
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

  it("uses joined member chars for connected components", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [{ chars: "BURGER", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_BURGER.stl")).toBeTruthy();
    expect(zip.file("plexi/01_BURGER.svg")).toBeTruthy();
  });

  it("falls back to component<slot> when chars sanitize to empty", async () => {
    const blob = await bundleAll(
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_component1.stl")).toBeTruthy();
    expect(zip.file("plexi/01_component1.svg")).toBeTruthy();
  });

  it("strips disallowed characters", async () => {
    const blob = await bundleAll(
      [{ chars: "Hi/?", stl: new ArrayBuffer(84) }],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_Hi.stl")).toBeTruthy();
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
