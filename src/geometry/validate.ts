import type { Parameters } from "../state/parameters";

export type ValidationError = { field: keyof Parameters | "_form"; letter?: string; message: string };

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export function validate(p: Parameters): ValidationResult {
  const errors: ValidationError[] = [];

  const positives = [
    "letterHeight", "wallThickness", "totalDepth",
    "backThickness", "rabbetDepth", "rabbetLipWidth", "bezierTolerance",
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

  if (Number.isFinite(p.rabbetLipWidth) && Number.isFinite(p.wallThickness)) {
    if (p.rabbetLipWidth >= p.wallThickness) {
      errors.push({
        field: "rabbetLipWidth",
        message: "Rabbet lip width must be less than wall thickness (the lip carves into the wall material)",
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
