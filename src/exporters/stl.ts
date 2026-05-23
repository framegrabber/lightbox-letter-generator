export type Mesh = { vertProperties: Float32Array; triVerts: Uint32Array };

export function meshToBinarySTL(mesh: Mesh): ArrayBuffer {
  const triCount = mesh.triVerts.length / 3;
  const buf = new ArrayBuffer(80 + 4 + triCount * 50);
  const view = new DataView(buf);

  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const a = mesh.triVerts[i * 3] * 3;
    const b = mesh.triVerts[i * 3 + 1] * 3;
    const c = mesh.triVerts[i * 3 + 2] * 3;

    const ax = mesh.vertProperties[a], ay = mesh.vertProperties[a + 1], az = mesh.vertProperties[a + 2];
    const bx = mesh.vertProperties[b], by = mesh.vertProperties[b + 1], bz = mesh.vertProperties[b + 2];
    const cx = mesh.vertProperties[c], cy = mesh.vertProperties[c + 1], cz = mesh.vertProperties[c + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    view.setFloat32(offset, ax, true); offset += 4;
    view.setFloat32(offset, ay, true); offset += 4;
    view.setFloat32(offset, az, true); offset += 4;

    view.setFloat32(offset, bx, true); offset += 4;
    view.setFloat32(offset, by, true); offset += 4;
    view.setFloat32(offset, bz, true); offset += 4;

    view.setFloat32(offset, cx, true); offset += 4;
    view.setFloat32(offset, cy, true); offset += 4;
    view.setFloat32(offset, cz, true); offset += 4;

    view.setUint16(offset, 0, true); offset += 2;
  }

  return buf;
}
