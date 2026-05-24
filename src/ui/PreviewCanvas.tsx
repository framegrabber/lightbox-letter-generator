import { Canvas, useThree } from "@react-three/fiber";
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

  // Auto-fit on first geometry load. Reset when geometry clears so the next
  // load re-fits (e.g. user clears text, types something different).
  useEffect(() => {
    if (!result || result.letters.length === 0) {
      hasFitOnce.current = false;
      return;
    }
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

      camera.position.set(
        center.x + dist * 0.6,
        center.y - dist * 0.5,
        center.z + dist * 0.7,
      );
      camera.lookAt(center);
      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
      hasFitOnce.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [result, fitToken, camera, scene, controls]);

  return <OrbitControls makeDefault enableDamping dampingFactor={0.08} />;
}

export function PreviewCanvas() {
  const params = useParameters();
  const { result, busy, layoutFont } = usePreviewBuildContext();
  const [fitToken, setFitToken] = useState(0);

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
        type="button"
      >
        Fit
      </button>
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
