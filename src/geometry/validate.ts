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

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
