import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Text, Billboard } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useParameters } from "../state/parameters";
import { useUI } from "../state/ui";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { PreviewLetter } from "./PreviewLetter";
import type { BuildResult } from "../geometry/worker-client";
import { pickGridSpacing, componentsBBox } from "./grid-spacing";

const MAX_TICKS_PER_DIRECTION = 30;
const LABEL_SCALE_FRACTION = 0.18;

function AdaptiveGrid({ result }: { result: BuildResult | null }) {
  const spacing = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    if (!bbox) return pickGridSpacing(0);
    const dim = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
    return pickGridSpacing(dim);
  }, [result]);

  return (
    <Grid
      args={[10000, 10000]}
      cellSize={spacing.minor}
      sectionSize={spacing.major}
      cellColor="#dcdcdc"
      sectionColor="#9e9e9e"
      cellThickness={0.6}
      sectionThickness={1.0}
      fadeDistance={Math.max(800, spacing.major * 30)}
      fadeStrength={1}
      infiniteGrid
      followCamera={false}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
    />
  );
}

function AxisTickLabels({ result }: { result: BuildResult | null }) {
  const { spacing, range } = useMemo(() => {
    const bbox = result ? componentsBBox(result.components) : null;
    const dim = bbox
      ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
      : 0;
    const sp = pickGridSpacing(dim);
    const r = Math.min(
      MAX_TICKS_PER_DIRECTION,
      Math.ceil((Math.max(dim, sp.major * 5) * 1.5) / sp.major),
    );
    return { spacing: sp, range: r };
  }, [result]);

  const labels: { key: string; pos: [number, number, number]; text: string }[] = [];
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue;
    const v = i * spacing.major;
    labels.push({ key: `x${i}`, pos: [v, -spacing.minor * 1.5, 0], text: String(v) });
    labels.push({ key: `y${i}`, pos: [-spacing.minor * 1.5, v, 0], text: String(v) });
  }

  const fontSize = spacing.major * LABEL_SCALE_FRACTION;

  return (
    <group>
      {labels.map((l) => (
        <Billboard key={l.key} position={l.pos} lockX lockY>
          <Text fontSize={fontSize} color="#666" anchorX="center" anchorY="middle">
            {l.text}
          </Text>
        </Billboard>
      ))}
      <Billboard position={[-spacing.minor * 1.5, -spacing.minor * 1.5, 0]} lockX lockY>
        <Text fontSize={fontSize} color="#444" anchorX="center" anchorY="middle">
          mm
        </Text>
      </Billboard>
    </group>
  );
}

// Auto-fit defaults: where the focal point sits inside the bbox, the camera
// distance multiplier, and the unit-vector direction from target to camera.
// These were derived from a manually-orbited preferred view of BURGER.
const AUTOFIT_TARGET_FRACTION = { x: 0.5, y: 0.215, z: 0.61 };
const AUTOFIT_DIST_MULTIPLIER = 1.2;
const AUTOFIT_DIRECTION = { x: -0.19, y: -0.48, z: 0.86 };

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
    if (!result || result.components.length === 0) return;
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
      const dist = maxDim * AUTOFIT_DIST_MULTIPLIER;

      const target = new THREE.Vector3(
        box.min.x + size.x * AUTOFIT_TARGET_FRACTION.x,
        box.min.y + size.y * AUTOFIT_TARGET_FRACTION.y,
        box.min.z + size.z * AUTOFIT_TARGET_FRACTION.z,
      );
      // 'center' is unused here now; named parameters above describe the placement.
      void center;

      camera.position.set(
        target.x + dist * AUTOFIT_DIRECTION.x,
        target.y + dist * AUTOFIT_DIRECTION.y,
        target.z + dist * AUTOFIT_DIRECTION.z,
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
  const showCameraHUD = useUI((s) => s.showCameraHUD);
  const showGrid = useUI((s) => s.showGrid);
  const { result, busy } = usePreviewBuildContext();
  const [fitToken, setFitToken] = useState(0);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="preview-canvas">
      {busy && <div className="preview-busy">Generating…</div>}
      <Canvas camera={{ fov: 45, position: [40, -30, 50], near: 0.1, far: 5000 }}>
        <color attach="background" args={["#ffffff"]} />
        <ambientLight intensity={0.55} />
        <directionalLight intensity={1.4} position={[60, -40, 80]} />
        <directionalLight color="#c8d8ee" intensity={0.4} position={[-50, 20, 30]} />
        {showGrid && <AdaptiveGrid result={result} />}
        {showGrid && <AxisTickLabels result={result} />}
        <SceneSetup fitToken={fitToken} />
        {showCameraHUD && <CameraHUD hudRef={hudRef} />}
        {result?.components.map((c, i) => (
          <PreviewLetter key={i} component={c} xOffset={c.xOffset} />
        )) ?? null}
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
      {showCameraHUD && (
        <div className="preview-hud-wrap">
          <div ref={hudRef} className="preview-hud" />
          <button
            type="button"
            className="preview-hud-copy"
            onClick={async () => {
              const text = hudRef.current?.textContent ?? "";
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {
                // ignore — clipboard may be denied
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {result && result.errors.length > 0 && (
        <div className="preview-errors">
          {result.errors.map((e, i) => (
            <div key={i}>
              {e.members.length === 1 ? "Letter" : "Component"} &lsquo;
              {e.members.map((m) => m.char).join("")}
              &rsquo;: {e.reason}
            </div>
          ))}
        </div>
      )}
      {result && result.warnings.length > 0 && (
        <div className="preview-warnings">
          {result.warnings.map((w, i) => (
            <div key={i}>
              Bridge disconnected between &lsquo;{w.pair[0].char}&rsquo; and &lsquo;
              {w.pair[1].char}&rsquo;
            </div>
          ))}
        </div>
      )}
      {!result && params.text.trim().length === 0 && (
        <div className="preview-empty">Type a word to begin</div>
      )}
    </div>
  );
}
