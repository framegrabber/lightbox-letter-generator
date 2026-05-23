import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useParameters } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { PreviewLetter } from "./PreviewLetter";
import { layoutWord } from "../geometry/layout";

export function PreviewCanvas() {
  const params = useParameters();
  const { result, busy, layoutFont } = usePreviewBuildContext();

  const positions = layoutFont ? layoutWord(layoutFont, params.text, params.letterHeight) : [];
  const lettersByIndex = new Map((result?.letters ?? []).map((l) => [l.index, l]));

  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleCharIndices.push(i);
  });

  return (
    <div className="preview-canvas">
      {busy && <div className="preview-busy">Generating…</div>}
      <Canvas shadows camera={{ position: [0, 0, 400], fov: 35 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 200, 200]} intensity={1} castShadow />
        <OrbitControls />
        {positions.map((p, i) => {
          const originalIndex = visibleCharIndices[i];
          const letter = lettersByIndex.get(originalIndex);
          if (!letter) return null;
          return <PreviewLetter key={`${i}-${p.char}`} letter={letter} xOffset={p.xOffset} />;
        })}
      </Canvas>
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>Letter '{e.char}': {e.reason}</div>
          ))}
        </div>
      )}
      {!result && params.text.trim().length === 0 && (
        <div className="preview-empty">Type a word to begin</div>
      )}
    </div>
  );
}
