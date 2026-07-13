import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Text, Billboard, GizmoHelper, GizmoViewcube, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useParameters } from "../state/parameters";
import { useUI } from "../state/ui";
import { usePreviewBuildContext } from "./usePreviewBuildContext";
import { PreviewLetter } from "./PreviewLetter";
import { pickGridSpacing, componentsBBox } from "./grid-spacing";
import type { GridSpacing } from "./grid-spacing";
import { computeOrthoFit, fitFarPlane } from "./camera-fit";

const MAX_TICKS_PER_DIRECTION = 30;
const LABEL_SCALE_FRACTION = 0.18;

function AdaptiveGrid({ spacing }: { spacing: GridSpacing }) {
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
      userData={{ isSizeIndicator: true }}
    />
  );
}

function AxisTickLabels({ spacing, range }: { spacing: GridSpacing; range: number }) {
  const labels = useMemo(() => {
    const out: { key: string; pos: [number, number, number]; text: string }[] = [];
    for (let i = -range; i <= range; i++) {
      if (i === 0) continue;
      const v = i * spacing.major;
      out.push({ key: `x${i}`, pos: [v, -spacing.minor * 1.5, 0], text: String(v) });
      out.push({ key: `y${i}`, pos: [-spacing.minor * 1.5, v, 0], text: String(v) });
    }
    return out;
  }, [spacing, range]);

  const fontSize = spacing.major * LABEL_SCALE_FRACTION;

  return (
    <group userData={{ isSizeIndicator: true }}>
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
// These were derived from a manually-orbited preferred view of BURGER and
// then mapped through the scene's display rotation (Z-up world rotated by
// -π/2 around X for Y-up display so drei gizmos work natively). Original
// Z-up direction (-0.19, -0.48, 0.86) maps to display (-0.19, 0.86, 0.48);
// fractions (0.5, 0.215, 0.61) map to (0.5, 0.61, 1 - 0.215) = (0.5, 0.61, 0.785).
const AUTOFIT_TARGET_FRACTION = { x: 0.5, y: 0.61, z: 0.785 };
const AUTOFIT_DIST_MULTIPLIER = 1.2;
const AUTOFIT_DIRECTION = { x: -0.19, y: 0.86, z: 0.48 };

type Controls = { target: THREE.Vector3; update: () => void } | null;

function CutLinesOverlay({ cuts, wordBBox }: { cuts: { x: number; angle: number }[]; wordBBox: { minX: number; maxX: number; minY: number; maxY: number } }) {
  const params = useParameters();
  const top = params.totalDepth + params.backCavityDepth;
  const margin = wordBBox.maxY - wordBBox.minY;

  return (
    <group userData={{ isSizeIndicator: true }}>
      {cuts.map((cut, i) => {
        const angleRad = (cut.angle * Math.PI) / 180;
        // Pivot the cut plane at Y=0 (baseline), matching the slicing math.
        // boxGeometry is centered, so we shift the geometry up by lengthY/2
        // so the bottom face sits at the Y=0 pivot. The parent group handles
        // the rotation around that pivot.
        const lengthY = margin + 2;
        const thickness = 0.6;

        // Negate angle: three.js Z-rotation is CCW (tilts top to -X) but
        // slice.ts uses toX = c.x + y*tan(angle), which tilts top to +X.
        return (
          <group key={i} position={[cut.x, 0, top / 2]} rotation={[0, 0, -angleRad]}>
            <mesh position={[0, lengthY / 2, 0]}>
              <boxGeometry args={[thickness, lengthY, top + 2]} />
              <meshBasicMaterial
                color="#e53935"
                transparent
                opacity={0.55}
                depthTest={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function SceneSetup({ fitToken }: { fitToken: number }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as Controls;
  const { result } = usePreviewBuildContext();
  const hasFitOnce = useRef(false);
  const lastCameraType = useRef<"persp" | "ortho" | null>(null);

  // The geometry pipeline emits Z-up coordinates; the scene wraps everything
  // in a -π/2 X-rotation so we display Y-up. drei's gizmos (Viewcube,
  // Viewport) hard-code Y-up, so this lets them work natively without
  // labels/rotation paths going wrong. Camera up matches the displayed scene.
  useEffect(() => {
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  // Auto-fit only on the very first geometry load. Param changes (including
  // clearing text and retyping) do not move the camera. The Fit button is the
  // explicit way to recenter. Also re-fits when the camera type
  // (perspective ↔ orthographic) changes so the new view is sensible.
  useEffect(() => {
    if (!result || result.components.length === 0) return;
    const cameraType: "persp" | "ortho" =
      camera instanceof THREE.OrthographicCamera ? "ortho" : "persp";
    const needsFit = !hasFitOnce.current || fitToken !== 0 || cameraType !== lastCameraType.current;
    if (!needsFit) return;

    const id = requestAnimationFrame(() => {
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      let any = false;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          // Skip meshes that are part of the size-indicator overlay (grid, axis
          // labels). They render at world positions far outside the geometry and
          // would inflate the auto-fit bbox.
          let cur: THREE.Object3D | null = obj;
          while (cur) {
            if (cur.userData?.isSizeIndicator) return;
            cur = cur.parent;
          }
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

      if (camera instanceof THREE.OrthographicCamera) {
        // drei's OrthographicCamera uses canvas pixel dimensions as its frustum
        // (top=canvas.height/2, right=canvas.width/2). Compute the zoom needed
        // so the bbox fits with a little breathing room. The far plane must
        // track the fit distance: the camera is created with three.js's
        // default far (2000), which is closer than `dist` for words wider
        // than ~1900 mm — the whole model would be clipped to a blank view.
        const o = camera as THREE.OrthographicCamera;
        const fit = computeOrthoFit(o.right - o.left, o.top - o.bottom, size, dist, maxDim);
        o.zoom = fit.zoom;
        o.far = fit.far;
        o.updateProjectionMatrix();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        // Same clipping hazard as ortho, just with a 5000 mm default: keep the
        // far plane beyond the geometry however large the word gets.
        camera.far = Math.max(camera.far, fitFarPlane(dist, maxDim));
        camera.updateProjectionMatrix();
      }

      if (controls) {
        controls.target.copy(target);
        controls.update();
      }
      hasFitOnce.current = true;
      lastCameraType.current = cameraType;
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
  const setShowGrid = useUI((s) => s.setShowGrid);
  const showViewcube = useUI((s) => s.showViewcube);
  const showOrthoCamera = useUI((s) => s.showOrthoCamera);
  const setShowOrthoCamera = useUI((s) => s.setShowOrthoCamera);
  const setWordBBox = useUI((s) => s.setWordBBox);
  const { result, busy } = usePreviewBuildContext();
  const wordBBox = useMemo(
    () => (result ? componentsBBox(result.components) : null),
    [result],
  );

  // Update the global UI state with the word bbox for the Suggest cuts button
  useEffect(() => {
    setWordBBox(wordBBox ? { minX: wordBBox.minX, maxX: wordBBox.maxX } : null);
  }, [wordBBox, setWordBBox]);
  const gridParams = useMemo(() => {
    const dim = wordBBox
      ? Math.max(wordBBox.maxX - wordBBox.minX, wordBBox.maxY - wordBBox.minY)
      : 0;
    const spacing = pickGridSpacing(dim);
    const range = Math.min(
      MAX_TICKS_PER_DIRECTION,
      Math.ceil((Math.max(dim, spacing.major * 5) * 1.5) / spacing.major),
    );
    return { spacing, range };
  }, [wordBBox]);
  const dimensions = useMemo(() => {
    if (!wordBBox) return null;
    return {
      width: wordBBox.maxX - wordBBox.minX,
      height: wordBBox.maxY - wordBBox.minY,
      depth: params.totalDepth + params.backCavityDepth,
    };
  }, [wordBBox, params.totalDepth, params.backCavityDepth]);
  const [fitToken, setFitToken] = useState(0);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="preview-canvas">
      {busy && <div className="preview-busy">Generating…</div>}
      <Canvas gl={{ antialias: true }} camera={{ near: 0.1, far: 5000 }}>
        {/* Switch between perspective and orthographic camera. SceneSetup's
            auto-fit detects the active camera type and computes either a
            position (perspective) or zoom (ortho) to frame the geometry. */}
        {showOrthoCamera ? (
          <OrthographicCamera makeDefault position={[40, 50, 30]} />
        ) : (
          <PerspectiveCamera
            makeDefault
            fov={45}
            position={[40, 50, 30]}
            near={0.1}
            far={5000}
          />
        )}
        <color attach="background" args={["#ffffff"]} />
        {/* World content lives inside a -π/2 X-rotation: the geometry pipeline
            emits Z-up but we display Y-up so drei's gizmo widgets (which
            hard-code Y-up) work natively. Lights are inside the group so
            light-relative-to-geometry angles are preserved. SceneSetup,
            GizmoHelper, and CameraHUD stay outside (they're logic/overlay,
            not world content). */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55} />
          <directionalLight intensity={1.4} position={[60, -40, 80]} />
          <directionalLight color="#c8d8ee" intensity={0.4} position={[-50, 20, 30]} />
          {showGrid && <AdaptiveGrid spacing={gridParams.spacing} />}
          {showGrid && <AxisTickLabels spacing={gridParams.spacing} range={gridParams.range} />}
          {result?.components.map((c, i) => (
            <PreviewLetter key={i} component={c} xOffset={c.xOffset} />
          )) ?? null}
          {params.cuts.length > 0 && wordBBox && (
            <CutLinesOverlay cuts={params.cuts} wordBBox={wordBBox} />
          )}
        </group>
        <SceneSetup fitToken={fitToken} />
        {showViewcube && (
          <GizmoHelper alignment="top-left" margin={[64, 64]}>
            <GizmoViewcube
              color="#f5f5f5"
              opacity={0.95}
              strokeColor="#333"
              textColor="#222"
              hoverColor="#7aa6ff"
            />
          </GizmoHelper>
        )}
        {showCameraHUD && <CameraHUD hudRef={hudRef} />}
      </Canvas>
      <div className="preview-toolbar">
        <button
          className="preview-toolbar-button"
          onClick={() => setFitToken((n) => n + 1)}
          title="Fit camera"
          aria-label="Fit camera"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <button
          className={`preview-toolbar-button${showOrthoCamera ? " active" : ""}`}
          onClick={() => setShowOrthoCamera(!showOrthoCamera)}
          title={showOrthoCamera ? "Perspective camera" : "Orthographic camera"}
          aria-label={showOrthoCamera ? "Switch to perspective camera" : "Switch to orthographic camera"}
          aria-pressed={showOrthoCamera}
          type="button"
        >
          {showOrthoCamera ? (
            // Parallel-lines icon for ortho (no convergence)
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l4 16M20 4l-4 16" />
            </svg>
          ) : (
            // Converging-lines icon for perspective
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 4h4l4 6-4 6H3M21 4h-4l-4 6 4 6h4" />
            </svg>
          )}
        </button>
        <button
          className={`preview-toolbar-button${showGrid ? " active" : ""}`}
          onClick={() => setShowGrid(!showGrid)}
          title={showGrid ? "Hide grid" : "Show grid"}
          aria-label={showGrid ? "Hide grid" : "Show grid"}
          aria-pressed={showGrid}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="0" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        </button>
      </div>
      {dimensions && (
        <div className="preview-dimensions-hud" aria-label="Word bounding box dimensions">
          <span>W <strong>{dimensions.width.toFixed(1)}</strong></span>
          <span>H <strong>{dimensions.height.toFixed(1)}</strong></span>
          <span>D <strong>{dimensions.depth.toFixed(1)}</strong></span>
          <span className="preview-dimensions-hud-unit">mm</span>
        </div>
      )}
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
          {result.warnings.map((w, i) => {
            if (w.kind === "bridge_disconnected") {
              return (
                <div key={i}>
                  Bridge disconnected between '{w.pair[0].char}' and '{w.pair[1].char}'
                </div>
              );
            }
            if (w.kind === "bulbhole_inset_collapsed") {
              return (
                <div key={i}>
                  Bulb-hole inset too large for {w.members.map((m) => m.char).join("")} — holes skipped
                </div>
              );
            }
            if (w.kind === "slice_crossed") {
              return <div key={i}>Cut {w.cuts[0]} and Cut {w.cuts[1]} cross inside the geometry</div>;
            }
            if (w.kind === "slice_empty") {
              return (
                <div key={i}>
                  Slice {w.sliceIndex} produced no geometry (dropped)
                </div>
              );
            }
            if (w.kind === "slice_oversize") {
              return (
                <div key={i}>
                  Slice {w.sliceIndex} width ({w.width.toFixed(1)} mm) exceeds max piece width
                </div>
              );
            }
            if (w.kind === "slice_recommended") {
              return (
                <div key={i}>
                  Slicing recommended: geometry exceeds max piece width
                </div>
              );
            }
            return <div key={i}>Unknown warning</div>;
          })}
        </div>
      )}
      {!result && params.text.trim().length === 0 && (
        <div className="preview-empty">Type a word to begin</div>
      )}
    </div>
  );
}
