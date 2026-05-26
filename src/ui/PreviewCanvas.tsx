import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useParameters } from "../state/parameters";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { PreviewLetter } from "./PreviewLetter";
import { layoutWord } from "../geometry/layout";

type Controls = { target: THREE.Vector3; update: () => void } | null;

function SceneSetup({ fitToken }: { fitToken: number }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as Controls;
  const { result } = usePreviewBuildContext();
  const hasFitOnce = useRef(false);

  // Z-up orientation for the camera (matches PixelTagMaker's CAD-style view).
  useEffect(() => {
    camera.up.set(0, 0, 1);
  }, [camera]);

  // Auto-fit only on the very first geometry load. Param changes (including
  // clearing text and retyping) do not move the camera. The Fit button is the
  // explicit way to recenter.
  useEffect(() => {
    if (!result || result.letters.length === 0) return;
    if (hasFitOnce.current && fitToken === 0) return;

    const id = requestAnimationFrame(() => {
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      let any = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.computeBoundingBox();
          const local = obj.geometry.boundingBox?.clone();
          if (local) {
            local.applyMatrix4(obj.matrixWorld);
            box.union(local);
            any = true;
          }
        }
      });
      if (!any) return;
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim === 0) return;
      const dist = maxDim * 2.2;

      // Bias the focal point toward the start of the word (LTR-natural):
      // letters extend along +X, so target the first ~25% of the bbox so
      // the leftmost letter dominates the view and the rest reads into it.
      const target = new THREE.Vector3(box.min.x + size.x * 0.25, center.y, center.z);

      camera.position.set(
        target.x + dist * 0.6,
        target.y - dist * 0.5,
        target.z + dist * 0.7,
      );
      camera.lookAt(target);
      if (controls) {
        controls.target.copy(target);
        controls.update();
      }
      hasFitOnce.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [result, fitToken, camera, scene, controls]);

  return <OrbitControls makeDefault enableDamping dampingFactor={0.08} />;
}

// Live HUD that writes camera position + target into a DOM node every frame.
// Bypasses React re-renders; cheap.
function CameraHUD({ hudRef }: { hudRef: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as Controls;
  useFrame(() => {
    if (!hudRef.current) return;
    const c = camera.position;
    const t = controls?.target ?? new THREE.Vector3();
    const ox = c.x - t.x;
    const oy = c.y - t.y;
    const oz = c.z - t.z;
    const dist = Math.hypot(ox, oy, oz) || 1;
    hudRef.current.textContent =
      `cam   (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)})\n` +
      `target(${t.x.toFixed(0)}, ${t.y.toFixed(0)}, ${t.z.toFixed(0)})\n` +
      `offset(${ox.toFixed(0)}, ${oy.toFixed(0)}, ${oz.toFixed(0)})  d=${dist.toFixed(0)}\n` +
      `dir   (${(ox / dist).toFixed(2)}, ${(oy / dist).toFixed(2)}, ${(oz / dist).toFixed(2)})`;
  });
  return null;
}

export function PreviewCanvas() {
  const params = useParameters();
  const { result, busy, layoutFont } = usePreviewBuildContext();
  const [fitToken, setFitToken] = useState(0);
  const hudRef = useRef<HTMLDivElement | null>(null);

  const positions = layoutFont ? layoutWord(layoutFont, params.text, params.letterHeight) : [];
  const lettersByIndex = new Map((result?.letters ?? []).map((l) => [l.index, l]));

  const visibleCharIndices: number[] = [];
  Array.from(params.text).forEach((c, i) => {
    if (!/\s/.test(c)) visibleCharIndices.push(i);
  });

  return (
    <div className="preview-canvas">
      {busy && <div className="preview-busy">Generating…</div>}
      <Canvas camera={{ fov: 45, position: [40, -30, 50], near: 0.1, far: 5000 }}>
        <color attach="background" args={["#111114"]} />
        <ambientLight intensity={0.25} />
        <directionalLight intensity={2.0} position={[60, -40, 80]} />
        <directionalLight color="#c8d8ee" intensity={0.6} position={[-50, 20, 30]} />
        <gridHelper
          args={[1000, 20, "#222230", "#1a1a24"]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <SceneSetup fitToken={fitToken} />
        <CameraHUD hudRef={hudRef} />
        {positions.map((p, i) => {
          const originalIndex = visibleCharIndices[i];
          const letter = lettersByIndex.get(originalIndex);
          if (!letter) return null;
          return <PreviewLetter key={`${i}-${p.char}`} letter={letter} xOffset={p.xOffset} />;
        })}
      </Canvas>
      <button
        className="preview-fit"
        onClick={() => setFitToken((n) => n + 1)}
        title="Fit camera"
        aria-label="Fit camera"
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      <div ref={hudRef} className="preview-hud" aria-hidden="true" />
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>Letter &lsquo;{e.char}&rsquo;: {e.reason}</div>
          ))}
        </div>
      )}
      {!result && params.text.trim().length === 0 && (
        <div className="preview-empty">Type a word to begin</div>
      )}
    </div>
  );
}
