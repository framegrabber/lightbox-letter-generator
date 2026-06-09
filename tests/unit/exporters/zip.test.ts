import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { bundleAll } from "../../../src/exporters/zip";

describe("bundleAll", () => {
  it("places shells under stl/chars/ with _char suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_BURGER_char.stl")).toBeTruthy();
  });

  it("places plexi STLs under stl/plexi/ with _plexi suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/plexi/01_BURGER_plexi.stl")).toBeTruthy();
  });

  it("places plexi SVGs under svg/ with _plexi suffix", async () => {
    const blob = await bundleAll(
      [{ chars: "BURGER", stl: new ArrayBuffer(84) }],
      [],
      [{ chars: "BURGER", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("svg/01_BURGER_plexi.svg")).toBeTruthy();
  });

  it("packs a full multi-component export", async () => {
    const blob = await bundleAll(
      [
        { chars: "M", stl: new ArrayBuffer(84) },
        { chars: "i", stl: new ArrayBuffer(84) },
      ],
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
    expect(zip.file("stl/chars/01_M_char.stl")).toBeTruthy();
    expect(zip.file("stl/chars/02_i_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_M_plexi.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/02_i_plexi.stl")).toBeTruthy();
    expect(zip.file("svg/01_M_plexi.svg")).toBeTruthy();
    expect(zip.file("svg/02_i_plexi.svg")).toBeTruthy();
    expect(zip.file("README.txt")).toBeTruthy();
  });

  it("a component without plexi still ships a shell, but no plexi files", async () => {
    const blob = await bundleAll(
      [
        { chars: "A", stl: new ArrayBuffer(84) },
        { chars: "B", stl: new ArrayBuffer(84) },
      ],
      [
        // No plexi for A; only B.
        { chars: "B", stl: new ArrayBuffer(84) },
      ],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_A_char.stl")).toBeTruthy();
    expect(zip.file("stl/chars/02_B_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_B_plexi.stl")).toBeTruthy();
    // No 02_A or 02_B with index mismatch — plexi list is independent slot order.
    // Negative assertions: verify no off-by-one slot mismatch.
    expect(zip.file("stl/plexi/02_B_plexi.stl")).toBeNull();
    expect(zip.file("stl/plexi/01_A_plexi.stl")).toBeNull();
  });

  it("falls back to component<slot> for non-alphanumeric chars", async () => {
    const blob = await bundleAll(
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", stl: new ArrayBuffer(84) }],
      [{ chars: "?!", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_component1_char.stl")).toBeTruthy();
    expect(zip.file("stl/plexi/01_component1_plexi.stl")).toBeTruthy();
    expect(zip.file("svg/01_component1_plexi.svg")).toBeTruthy();
  });

  it("strips disallowed characters", async () => {
    const blob = await bundleAll(
      [{ chars: "Hi/?", stl: new ArrayBuffer(84) }],
      [],
      [],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/chars/01_Hi_char.stl")).toBeTruthy();
  });

  it("README content lands at the root", async () => {
    const readme = "Reproduce: http://example.com/?p=...\nText: BURGER";
    const blob = await bundleAll([], [], [], readme);
    const zip = await JSZip.loadAsync(blob);
    const f = zip.file("README.txt");
    expect(f).toBeTruthy();
    if (f) expect(await f.async("text")).toBe(readme);
  });

  it("does not emit the old layout paths", async () => {
    const blob = await bundleAll(
      [{ chars: "M", stl: new ArrayBuffer(84) }],
      [{ chars: "M", stl: new ArrayBuffer(84) }],
      [{ chars: "M", svg: "<svg/>" }],
      "readme",
    );
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("stl/01_M.stl")).toBeNull();
    expect(zip.file("plexi/01_M.svg")).toBeNull();
    expect(zip.file("manifest.json")).toBeNull();
  });
});
