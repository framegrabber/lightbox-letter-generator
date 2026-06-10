import { describe, it, expect } from "vitest";
import { buildReadme } from "../../../src/exporters/manifest";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("buildReadme", () => {
  it("includes the new connected-letters params", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, letterOverlap: 5, bridgeWidth: 12, bridgeHeight: 4, bridgeY: -50 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Letter overlap:    5 mm");
    expect(txt).toContain("Bridge width:      12 mm");
    expect(txt).toContain("Bridge height:     4 mm");
    expect(txt).toContain("Bridge Y:          -50 mm");
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

  it("uses singular 'letter' for a single-member component", () => {
    const txt = buildReadme(DEFAULT_PARAMETERS, "https://example.com/?p=foo", [
      { chars: "A", count: 1 },
    ]);
    expect(txt).toContain("1 letter)");
    expect(txt).not.toContain("1 letters");
  });

  it("includes plexiTolerance and the new file-tree paths", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, plexiTolerance: 0.25 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Plexi tolerance:   0.25 mm");
    expect(txt).toContain("stl/chars/");
    expect(txt).toContain("stl/plexi/");
    expect(txt).toContain("svg/");
    // Old paths must not appear:
    expect(txt).not.toContain("stl/NN_<chars>.stl");
    expect(txt).not.toContain("plexi/NN_<chars>.svg");
  });

  it("includes backCavityDepth in the parameter dump", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, backCavityDepth: 35 },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Back cavity depth: 35 mm");
  });

  it("includes cable hole parameters in the parameter dump", () => {
    const txt = buildReadme(
      {
        ...DEFAULT_PARAMETERS,
        cableHoleDiameter: 8,
        cableHoleY: 75,
        cableHoleZ: 10,
        cableHoleAtEnds: false,
      },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Cable hole dia:    8 mm");
    expect(txt).toContain("Cable hole Y:      75 mm");
    expect(txt).toContain("Cable hole Z:      10 mm");
    expect(txt).toContain("Cable hole ends:   no");
  });

  it("renders cable-hole-ends as 'yes' when true", () => {
    const txt = buildReadme(
      { ...DEFAULT_PARAMETERS, cableHoleAtEnds: true },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Cable hole ends:   yes");
  });

  it("includes mount parameters in the parameter dump", () => {
    const txt = buildReadme(
      {
        ...DEFAULT_PARAMETERS,
        mountShankDiameter: 4,
        mountSlotY: 150,
        mountSlotXInset: 20,
      },
      "https://example.com/?p=foo",
    );
    expect(txt).toContain("Mount shank dia:   4 mm");
    expect(txt).toContain("Mount slot Y:      150 mm");
    expect(txt).toContain("Mount slot inset:  20 mm");
  });
});
