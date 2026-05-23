import { useParameters, DEFAULT_PARAMETERS } from "./parameters";
import type { Parameters } from "./parameters";

const LS_KEY = "lightbox-params-v1";
const URL_KEY = "p";

type Serializable = Omit<Parameters, "fontSource"> & {
  fontSource: { kind: "bundled"; id: string } | { kind: "uploaded"; name: string; sha256: string };
};

function fromQueryOrStorage(): Partial<Parameters> | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(URL_KEY);
    if (q) return JSON.parse(q) as Partial<Parameters>;
  } catch {
    // ignore — fall through to localStorage
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Partial<Parameters>;
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
      rabbetLipWidth: state.rabbetLipWidth,
      bezierTolerance: state.bezierTolerance,
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
