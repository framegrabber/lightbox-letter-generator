import { describe, it, expect } from "vitest";
import { validate, ValidationError } from "../../../src/geometry/validate";
import { DEFAULT_PARAMETERS } from "../../../src/state/parameters";

describe("validate", () => {
  const ok = { ...DEFAULT_PARAMETERS, text: "HI" };

  it("accepts valid parameters", () => {
    const r = validate(ok);
    expect(r.ok).toBe(true);
  });

  it("rejects rabbetDepth >= totalDepth - backThickness", () => {
    const r = validate({ ...ok, rabbetDepth: 25, totalDepth: 25, backThickness: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "rabbetDepth")).toBe(true);
    }
  });

  it("rejects insetWidth >= wallThickness", () => {
    const r = validate({ ...ok, insetWidth: 3, wallThickness: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "insetWidth")).toBe(true);
    }
    const r2 = validate({ ...ok, insetWidth: 5, wallThickness: 3 });
    expect(r2.ok).toBe(false);
  });

  it("rejects non-positive numeric params", () => {
    for (const field of [
      "letterHeight", "wallThickness", "totalDepth", "backThickness",
      "rabbetDepth", "insetWidth", "bezierTolerance",
    ] as const) {
      const r = validate({ ...ok, [field]: 0 });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects empty text", () => {
    const r = validate({ ...ok, text: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    const r = validate({ ...ok, letterHeight: NaN });
    expect(r.ok).toBe(false);
  });
});

describe("connected-letters bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: -50,
    plexiTolerance: 0.2,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 10,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 0,
    cuts: [] as { x: number; angle: number }[],
  };

  it("accepts zero defaults", () => {
    const r = validate(base);
    expect(r.ok).toBe(true);
  });

  it("rejects negative letterOverlap", () => {
    const r = validate({ ...base, letterOverlap: -1 });
    expect(r.ok).toBe(false);
  });

  it("rejects letterOverlap >= letterHeight", () => {
    const r = validate({ ...base, letterOverlap: 100 });
    expect(r.ok).toBe(false);
  });

  it("rejects negative bridgeWidth or bridgeHeight", () => {
    expect(validate({ ...base, bridgeWidth: -1 }).ok).toBe(false);
    expect(validate({ ...base, bridgeHeight: -1 }).ok).toBe(false);
  });

  it("accepts negative bridgeY (above baseline in our flipped Y)", () => {
    const r = validate({ ...base, bridgeY: -200 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-finite bridgeY", () => {
    const r = validate({ ...base, bridgeY: NaN });
    expect(r.ok).toBe(false);
  });
});

describe("plexiTolerance bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 50,
    plexiTolerance: 0.2,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 10,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 0,
    cuts: [] as { x: number; angle: number }[],
  };

  it("accepts the default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts zero", () => {
    expect(validate({ ...base, plexiTolerance: 0 }).ok).toBe(true);
  });

  it("rejects negative", () => {
    expect(validate({ ...base, plexiTolerance: -0.1 }).ok).toBe(false);
  });

  it("rejects non-finite", () => {
    expect(validate({ ...base, plexiTolerance: NaN }).ok).toBe(false);
  });

  it("rejects when >= (wallThickness − insetWidth)", () => {
    // lipWidth = 10 − 5 = 5 → tolerance must be < 5
    expect(validate({ ...base, plexiTolerance: 5 }).ok).toBe(false);
    expect(validate({ ...base, plexiTolerance: 6 }).ok).toBe(false);
  });

  it("accepts a value just under the upper bound", () => {
    expect(validate({ ...base, plexiTolerance: 4.9 }).ok).toBe(true);
  });
});

describe("backCavityDepth bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 50,
    plexiTolerance: 0.1,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 10,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 0,
    cuts: [] as { x: number; angle: number }[],
  };

  it("accepts the default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts zero", () => {
    expect(validate({ ...base, backCavityDepth: 0 }).ok).toBe(true);
  });

  it("rejects negative", () => {
    expect(validate({ ...base, backCavityDepth: -1 }).ok).toBe(false);
  });

  it("rejects non-finite", () => {
    expect(validate({ ...base, backCavityDepth: NaN }).ok).toBe(false);
  });
});

describe("cableHole bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 50,
    plexiTolerance: 0.1,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 10,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 0,
    cuts: [] as { x: number; angle: number }[],
  };

  it("accepts the disabled default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts an enabled diameter with sensible Y/Z", () => {
    expect(validate({ ...base, cableHoleDiameter: 8 }).ok).toBe(true);
  });

  it("rejects negative cableHoleDiameter", () => {
    expect(validate({ ...base, cableHoleDiameter: -1 }).ok).toBe(false);
  });

  it("rejects non-finite cableHoleDiameter / Y / Z", () => {
    expect(validate({ ...base, cableHoleDiameter: NaN }).ok).toBe(false);
    expect(validate({ ...base, cableHoleY: NaN }).ok).toBe(false);
    expect(validate({ ...base, cableHoleZ: NaN }).ok).toBe(false);
  });

  it("accepts arbitrary finite cableHoleY / Z (no upper bounds)", () => {
    expect(validate({ ...base, cableHoleY: -200, cableHoleZ: 500 }).ok).toBe(true);
  });
});

describe("mount bounds", () => {
  const base = {
    text: "ABC",
    fontSource: { kind: "bundled" as const, id: "anton" },
    letterHeight: 100,
    wallThickness: 10,
    totalDepth: 50,
    backThickness: 2,
    rabbetDepth: 5,
    insetWidth: 5,
    bezierTolerance: 0.1,
    letterOverlap: 0,
    bridgeWidth: 0,
    bridgeHeight: 0,
    bridgeY: 50,
    plexiTolerance: 0.1,
    backCavityDepth: 20,
    cableHoleDiameter: 0,
    cableHoleY: 50,
    cableHoleZ: 10,
    cableHoleAtEnds: true,
    mountShankDiameter: 0,
    mountSlotY: 75,
    mountSlotXInset: 20,
    bulbHoleDiameter: 0,
    bulbHoleSpacing: 30,
    bulbHoleInset: 10,
    bulbHoleMaxCount: 12,
    maxPieceWidth: 0,
    cuts: [] as { x: number; angle: number }[],
  };

  it("accepts the disabled default", () => {
    expect(validate(base).ok).toBe(true);
  });

  it("accepts an enabled shank diameter with sensible Y/inset", () => {
    expect(validate({ ...base, mountShankDiameter: 4 }).ok).toBe(true);
  });

  it("rejects negative mountShankDiameter", () => {
    expect(validate({ ...base, mountShankDiameter: -1 }).ok).toBe(false);
  });

  it("rejects non-finite mount fields", () => {
    expect(validate({ ...base, mountShankDiameter: NaN }).ok).toBe(false);
    expect(validate({ ...base, mountSlotY: NaN }).ok).toBe(false);
    expect(validate({ ...base, mountSlotXInset: NaN }).ok).toBe(false);
  });

  it("rejects mountSlotXInset = 0", () => {
    expect(validate({ ...base, mountSlotXInset: 0 }).ok).toBe(false);
  });

  it("rejects negative mountSlotXInset", () => {
    expect(validate({ ...base, mountSlotXInset: -5 }).ok).toBe(false);
  });

  it("accepts arbitrary finite mountSlotY (no upper bound)", () => {
    expect(validate({ ...base, mountSlotY: -200 }).ok).toBe(true);
    expect(validate({ ...base, mountSlotY: 9999 }).ok).toBe(true);
  });
});

describe("bulbHole bounds", () => {
  it("rejects negative bulbHoleDiameter", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleDiameter: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleDiameter")).toBeDefined();
  });

  it("rejects bulbHoleSpacing <= 0", () => {
    // diameter > 0 enables the feature so spacing/inset checks fire
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleSpacing: 0, bulbHoleDiameter: 8 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleSpacing")).toBeDefined();
  });

  it("accepts bulbHoleInset = 0 (field is unused but kept for persistence compat)", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleInset: 0, bulbHoleDiameter: 8 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-finite bulbHoleInset (would corrupt persistence)", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleInset: NaN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleInset")).toBeDefined();
  });

  it("accepts bulbHoleSpacing = 0 when feature is disabled (diameter = 0)", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleSpacing: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-integer bulbHoleMaxCount", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleMaxCount: 2.5, bulbHoleDiameter: 8 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleMaxCount")).toBeDefined();
  });

  it("rejects bulbHoleMaxCount < 1", () => {
    const r = validate({ ...DEFAULT_PARAMETERS, bulbHoleMaxCount: 0, bulbHoleDiameter: 8 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.field === "bulbHoleMaxCount")).toBeDefined();
  });

  it("accepts all bulb-hole defaults", () => {
    const r = validate(DEFAULT_PARAMETERS);
    expect(r.ok).toBe(true);
  });
});

describe("build-volume slicing bounds", () => {
  const ok = { ...DEFAULT_PARAMETERS, text: "HI" };

  it("rejects maxPieceWidth < 0", () => {
    const r = validate({ ...ok, maxPieceWidth: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "maxPieceWidth")).toBe(true);
    }
  });

  it("accepts maxPieceWidth === 0 (feature disabled)", () => {
    const r = validate({ ...ok, maxPieceWidth: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects a cut angle outside (-89, +89)", () => {
    const r = validate({ ...ok, cuts: [{ x: 100, angle: 90 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e: ValidationError) => e.field === "cuts")).toBe(true);
    }
  });

  it("accepts cuts at the angle boundary just inside (-89, +89)", () => {
    const r = validate({ ...ok, cuts: [{ x: 0, angle: 88.9 }, { x: 100, angle: -88.9 }] });
    expect(r.ok).toBe(true);
  });
});
