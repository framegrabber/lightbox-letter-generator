import { useMemo } from "react";
import * as THREE from "three";
import type { ComponentMesh } from "../geometry/worker-client";
import { useUI } from "../state/ui";

type Props = { component: ComponentMesh; xOffset: number };

function makeFlatGeometry(
  vertProperties: Float32Array,
  triVerts: Uint32Array,
): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(vertProperties, 3));
  indexed.setIndex(new THREE.BufferAttribute(triVerts, 1));
  // toNonIndexed() before computeVertexNormals() gives every triangle its own
  // vertices, so the normals match the face — sharp creases at every edge.
  const g = indexed.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

export function PreviewLetter({ component, xOffset }: Props) {
  const showPlexi = useUI((s) => s.showPlexi);

  const shellGeometry = useMemo(
    () => makeFlatGeometry(component.vertProperties, component.triVerts),
    [component],
  );

  const plexiGeometry = useMemo(() => {
    if (!component.plexi) return null;
    return makeFlatGeometry(component.plexi.vertProperties, component.plexi.triVerts);
  }, [component]);

  // The mesh was centered on its own bbox (so each STL exports centered).
  // To restore the natural word-space positioning here, shift back by the
  // original bbox center.
  const cx = (component.bbox.minX + component.bbox.maxX) / 2;
  const cy = (component.bbox.minY + component.bbox.maxY) / 2;

  return (
    <group position={[xOffset + cx, cy, 0]}>
      <mesh geometry={shellGeometry}>
        <meshStandardMaterial color="#5a5a5a" metalness={0} roughness={0.65} />
      </mesh>
      {showPlexi && plexiGeometry && (
        <mesh geometry={plexiGeometry}>
          <meshPhysicalMaterial
            color="#ffffff"
            roughness={0.85}
            metalness={0}
            transmission={0.6}
            thickness={2}
            ior={1.49}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
