import type { Parameters } from "../state/parameters";

export type ValidationError = { field: keyof Parameters | "_form"; letter?: string; message: string };

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export function validate(p: Parameters): ValidationResult {
  const errors: ValidationError[] = [];

  const positives = [
    "letterHeight", "wallThickness", "totalDepth",
    "backThickness", "rabbetDepth", "insetWidth", "bezierTolerance",
  ] as const;
  for (const f of positives) {
    const v = p[f];
    if (!Number.isFinite(v) || v <= 0) {
      errors.push({ field: f, message: `${f} must be a positive number` });
    }
  }

  if (p.text.replace(/\s/g, "").length === 0) {
    errors.push({ field: "text", message: "Text must contain at least one non-whitespace character" });
  }

  if (Number.isFinite(p.rabbetDepth) && Number.isFinite(p.totalDepth) && Number.isFinite(p.backThickness)) {
    if (p.rabbetDepth >= p.totalDepth - p.backThickness) {
      errors.push({
        field: "rabbetDepth",
        message: "Rabbet depth must be less than (total depth − back thickness)",
      });
    }
  }

  if (Number.isFinite(p.insetWidth) && Number.isFinite(p.wallThickness)) {
    if (p.insetWidth >= p.wallThickness) {
      errors.push({
        field: "insetWidth",
        message: "Inset width must be less than wall thickness (the shelf is carved into the wall material)",
      });
    }
  }

  // Connected-letters bounds.
  if (!Number.isFinite(p.letterOverlap) || p.letterOverlap < 0) {
    errors.push({ field: "letterOverlap", message: "Letter overlap must be ≥ 0" });
  } else if (Number.isFinite(p.letterHeight) && p.letterOverlap >= p.letterHeight) {
    errors.push({ field: "letterOverlap", message: "Letter overlap must be less than letter height" });
  }
  if (!Number.isFinite(p.bridgeWidth) || p.bridgeWidth < 0) {
    errors.push({ field: "bridgeWidth", message: "Bridge width must be ≥ 0" });
  }
  if (!Number.isFinite(p.bridgeHeight) || p.bridgeHeight < 0) {
    errors.push({ field: "bridgeHeight", message: "Bridge height must be ≥ 0" });
  }
  if (!Number.isFinite(p.bridgeY)) {
    errors.push({ field: "bridgeY", message: "Bridge Y must be a finite number" });
  }

  if (!Number.isFinite(p.plexiTolerance) || p.plexiTolerance < 0) {
    errors.push({ field: "plexiTolerance", message: "Plexi tolerance must be ≥ 0" });
  } else if (
    Number.isFinite(p.wallThickness) &&
    Number.isFinite(p.insetWidth) &&
    p.insetWidth < p.wallThickness &&
    p.plexiTolerance >= p.wallThickness - p.insetWidth
  ) {
    errors.push({
      field: "plexiTolerance",
      message: "Plexi tolerance must be less than (wall thickness − inset width); larger collapses the insert",
    });
  }

  if (!Number.isFinite(p.backCavityDepth) || p.backCavityDepth < 0) {
    errors.push({ field: "backCavityDepth", message: "Back cavity depth must be ≥ 0" });
  }

  if (!Number.isFinite(p.cableHoleDiameter) || p.cableHoleDiameter < 0) {
    errors.push({ field: "cableHoleDiameter", message: "Cable hole diameter must be ≥ 0" });
  }
  if (!Number.isFinite(p.cableHoleY)) {
    errors.push({ field: "cableHoleY", message: "Cable hole Y must be a finite number" });
  }
  if (!Number.isFinite(p.cableHoleZ)) {
    errors.push({ field: "cableHoleZ", message: "Cable hole Z must be a finite number" });
  }

  if (!Number.isFinite(p.mountShankDiameter) || p.mountShankDiameter < 0) {
    errors.push({ field: "mountShankDiameter", message: "Mount shank diameter must be ≥ 0" });
  }
  if (!Number.isFinite(p.mountSlotY)) {
    errors.push({ field: "mountSlotY", message: "Mount slot Y must be a finite number" });
  }
  if (!Number.isFinite(p.mountSlotXInset) || p.mountSlotXInset <= 0) {
    errors.push({ field: "mountSlotXInset", message: "Mount slot X inset must be > 0" });
  }

  if (!Number.isFinite(p.bulbHoleDiameter) || p.bulbHoleDiameter < 0) {
    errors.push({ field: "bulbHoleDiameter", message: "Bulb hole diameter must be ≥ 0" });
  }
  if (p.bulbHoleDiameter > 0) {
    if (!Number.isFinite(p.bulbHoleSpacing) || p.bulbHoleSpacing <= 0) {
      errors.push({ field: "bulbHoleSpacing", message: "Bulb hole spacing must be > 0" });
    }
  }
  // bulbHoleInset is retained for persistence backward-compat but no longer
  // used by the geometry helper; we still require it to be a finite number so
  // serialised values round-trip cleanly.
  if (!Number.isFinite(p.bulbHoleInset)) {
    errors.push({ field: "bulbHoleInset", message: "Bulb hole inset must be a finite number" });
  }
  if (!Number.isInteger(p.bulbHoleMaxCount) || p.bulbHoleMaxCount < 1) {
    errors.push({ field: "bulbHoleMaxCount", message: "Bulb hole max count must be an integer ≥ 1" });
  }

  if (!Number.isFinite(p.maxPieceWidth) || p.maxPieceWidth < 0) {
    errors.push({ field: "maxPieceWidth", message: "Max piece width must be ≥ 0" });
  }

  if (Array.isArray(p.cuts)) {
    for (const c of p.cuts) {
      if (!Number.isFinite(c.x)) {
        errors.push({ field: "cuts", message: "Cut x must be a finite number" });
        break;
      }
      if (!Number.isFinite(c.angle) || c.angle <= -89 || c.angle >= 89) {
        errors.push({ field: "cuts", message: "Cut angle must be strictly between -89° and +89°" });
        break;
      }
    }
  } else {
    errors.push({ field: "cuts", message: "Cuts must be an array" });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
