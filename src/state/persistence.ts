import { useParameters, DEFAULT_PARAMETERS } from "./parameters";
import type { Parameters } from "./parameters";

const LS_KEY = "lightbox-params-v1";
const URL_KEY = "p";

type Serializable = Omit<Parameters, "fontSource"> & {
  fontSource: { kind: "bundled"; id: string } | { kind: "uploaded"; name: string; sha256: string };
};

// Translate any deprecated field names from older saves into current shape and
// fill in defaults for fields that didn't exist in older saves.
export function migrate(raw: Record<string, unknown>): Partial<Parameters> {
  const out: Record<string, unknown> = { ...raw };

  // Legacy rabbetLipWidth → insetWidth.
  if (typeof out.rabbetLipWidth === "number" && typeof out.wallThickness === "number") {
    out.insetWidth = out.wallThickness - out.rabbetLipWidth;
  }
  delete out.rabbetLipWidth;

  // Connected-letters fields added later: fill defaults if missing.
  if (typeof out.letterOverlap !== "number") {
    out.letterOverlap = DEFAULT_PARAMETERS.letterOverlap;
  }
  if (typeof out.bridgeWidth !== "number") {
    out.bridgeWidth = DEFAULT_PARAMETERS.bridgeWidth;
  }
  if (typeof out.bridgeHeight !== "number") {
    out.bridgeHeight = DEFAULT_PARAMETERS.bridgeHeight;
  }
  if (typeof out.bridgeY !== "number") {
    const lh = typeof out.letterHeight === "number" ? out.letterHeight : DEFAULT_PARAMETERS.letterHeight;
    out.bridgeY = -lh / 2;
  }

  return out as Partial<Parameters>;
}

function fromQueryOrStorage(): Partial<Parameters> | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(URL_KEY);
    if (q) return migrate(JSON.parse(q) as Record<string, unknown>);
  } catch {
    // ignore — fall through to localStorage
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    // ignore
  }
  return null;
}

export function initPersistence(): void {
  const initial = fromQueryOrStorage();
  if (initial) {
    useParameters.setState({ ...DEFAULT_PARAMETERS, ...initial });
  }

  useParameters.subscribe((state) => {
    const ser: Serializable = {
      text: state.text,
      fontSource: state.fontSource,
      letterHeight: state.letterHeight,
      wallThickness: state.wallThickness,
      totalDepth: state.totalDepth,
      backThickness: state.backThickness,
      rabbetDepth: state.rabbetDepth,
      insetWidth: state.insetWidth,
      bezierTolerance: state.bezierTolerance,
      letterOverlap: state.letterOverlap,
      bridgeWidth: state.bridgeWidth,
      bridgeHeight: state.bridgeHeight,
      bridgeY: state.bridgeY,
    };
    const json = JSON.stringify(ser);
    try {
      window.localStorage.setItem(LS_KEY, json);
    } catch {
      // quota or disabled
    }

    const url = new URL(window.location.href);
    url.searchParams.set(URL_KEY, json);
    window.history.replaceState(null, "", url.toString());
  });
}
