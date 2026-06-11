// Medial-axis approximation by raster thinning.
//
// `computeSkeletonPolylines(polygons, pxSize)` rasterises a polygon-with-holes
// to a binary grid, runs Zhang-Suen thinning until the foreground is one pixel
// wide, then traces the surviving pixels into open polylines in the original
// coordinate system. The polylines approximate the medial axis of the input.
//
// Pixel size trades accuracy vs. CPU. 1 mm is a good default for letter-scale
// shapes (sub-mm error after the half-pixel sample offset).
//
// Used by `bulb-holes.ts` to place holes along the centre of each letter
// stroke without depending on the offset(-d) approximation, which produces a
// 2-D ribbon (and thus two parallel rows of holes) for non-uniform strokes.

export type Polyline = [number, number][];

export type RasterizedSkeleton = {
  polylines: Polyline[];
  pxSize: number;
};

// Returns one or more polylines along the medial axis of the polygons.
// `polygons` is the result of `CrossSection.toPolygons()` — an array of rings;
// the even-odd rule across all rings determines what's "inside".
export function computeSkeletonPolylines(
  polygons: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  pxSize: number,
): RasterizedSkeleton {
  if (polygons.length === 0) return { polylines: [], pxSize };

  // Bounding box of all rings.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygons) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { polylines: [], pxSize };

  // Pad by one pixel so skeleton pixels never sit on the grid border (where
  // thinning's neighbourhood checks would treat the edge as background).
  const pad = pxSize;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const W = Math.max(3, Math.ceil((maxX - minX) / pxSize));
  const H = Math.max(3, Math.ceil((maxY - minY) / pxSize));

  const grid = rasterize(polygons, minX, minY, pxSize, W, H);
  thinZhangSuen(grid, W, H);
  const polylines = traceSkeleton(grid, W, H, pxSize, minX, minY);
  return { polylines, pxSize };
}

function rasterize(
  polygons: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  minX: number,
  minY: number,
  pxSize: number,
  W: number,
  H: number,
): Uint8Array {
  const grid = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    const y = minY + (py + 0.5) * pxSize;
    for (let px = 0; px < W; px++) {
      const x = minX + (px + 0.5) * pxSize;
      let inside = false;
      for (const ring of polygons) {
        const n = ring.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (
            yi > y !== yj > y &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
          ) {
            inside = !inside;
          }
        }
      }
      if (inside) grid[py * W + px] = 1;
    }
  }
  return grid;
}

// Zhang-Suen 1984 — iterative two-sub-pass thinning. Runs until no foreground
// pixel is removed during a full iteration. The result has connected
// 1-pixel-wide skeletons with the same connectivity (number of components) as
// the input filled regions — minus their counter-holes, which become loops.
function thinZhangSuen(grid: Uint8Array, W: number, H: number): void {
  // Pre-allocate the to-remove buffer; cleared each pass.
  const toRemove: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      toRemove.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          if (grid[idx] !== 1) continue;
          const p2 = grid[(y - 1) * W + x];
          const p3 = grid[(y - 1) * W + x + 1];
          const p4 = grid[y * W + x + 1];
          const p5 = grid[(y + 1) * W + x + 1];
          const p6 = grid[(y + 1) * W + x];
          const p7 = grid[(y + 1) * W + x - 1];
          const p8 = grid[y * W + x - 1];
          const p9 = grid[(y - 1) * W + x - 1];

          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;

          // 0→1 transitions in clockwise neighbour sequence p2,p3,…,p9,p2.
          let A = 0;
          if (p2 === 0 && p3 === 1) A++;
          if (p3 === 0 && p4 === 1) A++;
          if (p4 === 0 && p5 === 1) A++;
          if (p5 === 0 && p6 === 1) A++;
          if (p6 === 0 && p7 === 1) A++;
          if (p7 === 0 && p8 === 1) A++;
          if (p8 === 0 && p9 === 1) A++;
          if (p9 === 0 && p2 === 1) A++;
          if (A !== 1) continue;

          if (pass === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }

          toRemove.push(idx);
        }
      }
      if (toRemove.length > 0) {
        for (const idx of toRemove) grid[idx] = 0;
        changed = true;
      }
    }
  }
}

function traceSkeleton(
  grid: Uint8Array,
  W: number,
  H: number,
  pxSize: number,
  originX: number,
  originY: number,
): Polyline[] {
  const polylines: Polyline[] = [];
  const visited = new Uint8Array(W * H);

  const toMm = (x: number, y: number): [number, number] => [
    originX + (x + 0.5) * pxSize,
    originY + (y + 0.5) * pxSize,
  ];

  function countNeighbors(x: number, y: number): number {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        if (grid[ny * W + nx] === 1) n++;
      }
    }
    return n;
  }

  function pickNext(x: number, y: number): { x: number; y: number } | null {
    // Prefer 4-connected neighbours over diagonals to keep adjacent steps
    // close in arc length.
    const offsets = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (grid[ny * W + nx] === 1 && !visited[ny * W + nx]) {
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  function walkFrom(startX: number, startY: number): Polyline {
    const path: Polyline = [toMm(startX, startY)];
    visited[startY * W + startX] = 1;
    let cx = startX;
    let cy = startY;
    while (true) {
      const next = pickNext(cx, cy);
      if (!next) break;
      cx = next.x;
      cy = next.y;
      visited[cy * W + cx] = 1;
      path.push(toMm(cx, cy));
    }
    return path;
  }

  // Pass 1: walk from endpoints (single neighbour). This handles the open
  // ends of stroke skeletons.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] !== 1 || visited[y * W + x]) continue;
      if (countNeighbors(x, y) !== 1) continue;
      const p = walkFrom(x, y);
      if (p.length >= 2) polylines.push(p);
    }
  }

  // Pass 2: pick up remaining pixels (closed loops, leftover branches at
  // junctions). Each starts a new polyline.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y * W + x] !== 1 || visited[y * W + x]) continue;
      const p = walkFrom(x, y);
      if (p.length >= 2) polylines.push(p);
    }
  }

  return polylines;
}
