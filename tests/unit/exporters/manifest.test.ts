import { describe, it, expect } from "vitest";
import { buildReadme } from "../../../src/exporters/manifest";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("buildReadme", () => {
  it("includes the new connected-letters params", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, letterOverlap: 5, bridgeWidth: 12, bridgeHeight: 4, bridgeY: -50 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Letter overlap:");
    expect(txt).toContain("5");
    expect(txt).toContain("Bridge width:");
    expect(txt).toContain("12");
    expect(txt).toContain("Bridge height:");
    expect(txt).toContain("Bridge Y:");
  });

  it("includes a Pieces section listing components when given them", () => {
    const txt = buildReadme(
      DEFAULT_PARAMETERS,
      "https://example.com/?p=foo",
      [
        { chars: "BUR", count: 3 },
        { chars: "GER", count: 3 },
      ],
    );
    expect(txt).toContain("Pieces:");
    expect(txt).toContain("01_BUR");
    expect(txt).toContain("02_GER");
  });

  it("omits Pieces section when no pieces given", () => {
    const txt = buildReadme(DEFAULT_PARAMETERS, "https://example.com/?p=foo");
    expect(txt).not.toContain("Pieces:");
  });
});
