import { useMemo } from "react";
import * as THREE from "three";
import type { LetterMesh } from "../geometry/worker-client";
import { useUI } from "../state/ui";

type Props = { letter: LetterMesh; xOffset: number };

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

export function PreviewLetter({ letter, xOffset }: Props) {
  const showPlexi = useUI((s) => s.showPlexi);
  const showShadow = useUI((s) => s.showShadow);

  const shellGeometry = useMemo(
    () => makeFlatGeometry(letter.vertProperties, letter.triVerts),
    [letter],
  );

  const plexiGeometry = useMemo(() => {
    if (!letter.plexi) return null;
    return makeFlatGeometry(letter.plexi.vertProperties, letter.plexi.triVerts);
  }, [letter]);

  // The mesh was centered on its own bbox (so each STL exports centered).
  // To restore opentype's natural positioning here, shift back by the
  // original bbox center — otherwise narrow letters would creep left and
  // wide letters would overhang their advance, causing overlap.
  const cx = (letter.bbox.minX + letter.bbox.maxX) / 2;
  const cy = (letter.bbox.minY + letter.bbox.maxY) / 2;

  return (
    <group position={[xOffset + cx, cy, 0]}>
      <mesh geometry={shellGeometry} castShadow={showShadow} receiveShadow={showShadow}>
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
