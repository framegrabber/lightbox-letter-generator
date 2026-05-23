import { useMemo } from "react";
import * as THREE from "three";
import type { LetterMesh } from "../geometry/worker-client";

type Props = { letter: LetterMesh; xOffset: number };

export function PreviewLetter({ letter, xOffset }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(letter.vertProperties, 3));
    g.setIndex(new THREE.BufferAttribute(letter.triVerts, 1));
    g.computeVertexNormals();
    return g;
  }, [letter]);

  return (
    <mesh geometry={geometry} position={[xOffset, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#cccccc" metalness={0.1} roughness={0.6} />
    </mesh>
  );
}
