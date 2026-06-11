import { useEffect, useRef, useState } from "react";
import opentype from "opentype.js";
import { useParameters } from "../state/parameters";
import type { FontSource } from "../state/parameters";
import { validate } from "../geometry/validate";
import { build } from "../geometry/worker-client";
import type { BuildResult } from "../geometry/worker-client";
import { BUNDLED_FONTS, bundledFontById } from "../fonts/bundled";
import { getCachedFont } from "../fonts/cache";

async function loadFontBuffer(source: FontSource): Promise<ArrayBuffer | null> {
  if (source.kind === "bundled") {
    const def = bundledFontById(source.id) ?? BUNDLED_FONTS[0];
    const res = await fetch(`./${def.path}`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  }
  return (await getCachedFont(source.sha256)) ?? null;
}

export function usePreviewBuild() {
  const params = useParameters();
  const [result, setResult] = useState<BuildResult | null>(null);
  const [layoutFont, setLayoutFont] = useState<opentype.Font | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    const v = validate(params);
    if (!v.ok || params.text.trim().length === 0) {
      // Clearing the result when params become invalid is the correct behavior
      // for this debounced effect; this is a synchronization with external state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      return;
    }

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      const buf = await loadFontBuffer(params.fontSource);
      if (!buf) {
        setResult(null);
        return;
      }
      setLayoutFont(opentype.parse(buf.slice(0)));
      setBusy(true);
      try {
        const r = await build(params, buf);
        setResult(r);
      } catch (err) {
        console.error("Build failed:", err);
        setResult(null);
      } finally {
        setBusy(false);
      }
    }, 150);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
    // We intentionally depend on individual primitive parameter fields to avoid
    // re-firing on unrelated store updates (e.g. setter identity). The `params`
    // object reference is stable here for the validation call inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.text,
    params.fontSource,
    params.letterHeight,
    params.wallThickness,
    params.totalDepth,
    params.backThickness,
    params.rabbetDepth,
    params.insetWidth,
    params.bezierTolerance,
    params.letterOverlap,
    params.bridgeWidth,
    params.bridgeHeight,
    params.bridgeY,
    params.plexiTolerance,
    params.backCavityDepth,
    params.cableHoleDiameter,
    params.cableHoleY,
    params.cableHoleZ,
    params.cableHoleAtEnds,
    params.mountShankDiameter,
    params.mountSlotY,
    params.mountSlotXInset,
    params.bulbHoleDiameter,
    params.bulbHoleSpacing,
    params.bulbHoleMaxCount,
    // bulbHoleInset is intentionally omitted — the skeleton algorithm ignores
    // it (the field is retained only for persistence backward-compat).
  ]);

  return { result, busy, layoutFont };
}
