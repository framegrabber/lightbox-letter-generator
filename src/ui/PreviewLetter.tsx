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

  return (
    <mesh geometry={geometry} position={[xOffset, 0, 0]}>
      <meshStandardMaterial color="#e5e1d8" metalness={0} roughness={0.65} />
    </mesh>
  );
}
