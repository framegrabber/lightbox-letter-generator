import { useMemo } from "react";
import * as THREE from "three";
import type { LetterMesh } from "../geometry/worker-client";

type Props = { letter: LetterMesh; xOffset: number };

export function PreviewLetter({ letter, xOffset }: Props) {
  const geometry = useMemo(() => {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute("position", new THREE.BufferAttribute(letter.vertProperties, 3));
    indexed.setIndex(new THREE.BufferAttribute(letter.triVerts, 1));
    // toNonIndexed() before computeVertexNormals() gives every triangle its own
    // vertices, so the normals match the face — sharp creases at every edge.
    // (Smooth shading from welded vertices was averaging across 90° corners.)
    const g = indexed.toNonIndexed();
    g.computeVertexNormals();
    return g;
  }, [letter]);

  // The mesh was centered on its own bbox (so each STL exports centered).
  // To restore opentype's natural positioning here, shift back by the
  // original bbox center — otherwise narrow letters would creep left and
  // wide letters would overhang their advance, causing overlap.
  const cx = (letter.bbox.minX + letter.bbox.maxX) / 2;
  const cy = (letter.bbox.minY + letter.bbox.maxY) / 2;

  return (
    <mesh geometry={geometry} position={[xOffset + cx, cy, 0]}>
      <meshStandardMaterial color="#e5e1d8" metalness={0} roughness={0.65} />
    </mesh>
  );
}
