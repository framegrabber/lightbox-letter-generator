import { getManifold } from "./manifold-init";
import type { GlyphContours, Polygon } from "./types";
import type { LayoutEntry } from "./layout";

export type ComponentMember = {
  char: string;
  index: number; // original-text index, including spaces
  xOffset: number;
};

export type Component = {
  members: ComponentMember[];
  mergedContours: GlyphContours; // in word space, ready to shell
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

export type MergeWarning = {
  kind: "bridge_disconnected";
  pair: [ComponentMember, ComponentMember];
};

export type MergeParams = {
  letterOverlap: number;
  bridgeWidth: number;
  bridgeHeight: number;
  bridgeY: number;
};

export type MergeResult = {
  components: Component[];
  warnings: MergeWarning[];
};

type LetterItem = {
  kind: "letter";
  member: ComponentMember;
  contours: GlyphContours; // already translated to word space
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type BridgeItem = {
  kind: "bridge";
  fromIdx: number; // index into letters[]
  toIdx: number;
  contours: GlyphContours;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

function translatePolygon(p: Polygon, dx: number, dy: number): Polygon {
  return p.map(([x, y]) => [x + dx, y + dy] as [number, number]);
}

function translateContours(c: GlyphContours, dx: number, dy: number): GlyphContours {
  return c.map((p) => translatePolygon(p, dx, dy));
}

function bboxOfContours(c: GlyphContours): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of c) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function bboxesOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.maxX >= b.minX && b.maxX >= a.minX && a.maxY >= b.minY && b.maxY >= a.minY;
}

export async function mergeIntoComponents(
  layout: LayoutEntry[],
  glyphContours: Map<number, GlyphContours>,
  params: MergeParams,
): Promise<MergeResult> {
  const m = await getManifold();
  const { CrossSection } = m;

  // 1. Translate each glyph's contours to word space.
  // Note: layout's `xOffset` already reflects letterOverlap (if non-zero) via
  // layoutWord. The merge step does not re-apply overlap; it consumes positions
  // as given.
  const letters: LetterItem[] = [];
  for (const entry of layout) {
    const contours = glyphContours.get(entry.originalIndex);
    if (!contours || contours.length === 0) continue;
    const translated = translateContours(contours, entry.xOffset, 0);
    letters.push({
      kind: "letter",
      member: { char: entry.char, index: entry.originalIndex, xOffset: entry.xOffset },
      contours: translated,
      bbox: bboxOfContours(translated),
    });
  }

  const warnings: MergeWarning[] = [];
  const bridges: BridgeItem[] = [];

  // 2. Build bridges between consecutive letter pairs.
  const bridgeEnabled = params.bridgeWidth > 0 && params.bridgeHeight > 0;
  if (bridgeEnabled) {
    for (let i = 0; i + 1 < letters.length; i++) {
      const a = letters[i];
      const b = letters[i + 1];
      const center = (a.bbox.maxX + b.bbox.minX) / 2;
      const halfW = params.bridgeWidth / 2;
      const halfH = params.bridgeHeight / 2;
      const x0 = center - halfW;
      const x1 = center + halfW;
      const y0 = params.bridgeY - halfH;
      const y1 = params.bridgeY + halfH;
      const rect: GlyphContours = [[
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]];
      const bbox = bboxOfContours(rect);

      // Check bridge actually intersects both endpoints. AABB pre-filter.
      const touchesA = bboxesOverlap(bbox, a.bbox) && crossSectionsIntersect(rect, a.contours, CrossSection);
      const touchesB = bboxesOverlap(bbox, b.bbox) && crossSectionsIntersect(rect, b.contours, CrossSection);
      if (!touchesA || !touchesB) {
        warnings.push({
          kind: "bridge_disconnected",
          pair: [a.member, b.member],
        });
        continue;
      }

      bridges.push({
        kind: "bridge",
        fromIdx: i,
        toIdx: i + 1,
        contours: rect,
        bbox,
      });
    }
  }

  // 3. Connectivity via union-find over letters; bridge edges + letter-letter
  //    overlap edges. We probe letter-letter overlap pairwise (n^2; n is small,
  //    typically ≤ 32 for sign words).
  const parent = letters.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      if (!bboxesOverlap(letters[i].bbox, letters[j].bbox)) continue;
      if (crossSectionsIntersect(letters[i].contours, letters[j].contours, CrossSection)) {
        union(i, j);
      }
    }
  }
  for (const br of bridges) union(br.fromIdx, br.toIdx);

  // 4. Materialize components.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < letters.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }

  // Sort groups by leftmost member's xOffset.
  const groupRoots = [...groups.keys()].sort((a, b) => {
    const xa = Math.min(...groups.get(a)!.map((idx) => letters[idx].member.xOffset));
    const xb = Math.min(...groups.get(b)!.map((idx) => letters[idx].member.xOffset));
    return xa - xb;
  });

  const components: Component[] = [];
  for (const r of groupRoots) {
    const members = groups.get(r)!.slice().sort((a, b) => letters[a].member.xOffset - letters[b].member.xOffset);
    const bridgesIn = bridges.filter((br) => members.includes(br.fromIdx) || members.includes(br.toIdx));

    let mergedContours: GlyphContours;
    if (members.length === 1 && bridgesIn.length === 0) {
      // Fast path: pass through the translated contours unchanged. No CrossSection round-trip.
      mergedContours = letters[members[0]].contours;
    } else {
      mergedContours = unionAll(
        [...members.map((idx) => letters[idx].contours), ...bridgesIn.map((br) => br.contours)],
        CrossSection,
      );
    }
    components.push({
      members: members.map((idx) => letters[idx].member),
      mergedContours,
      bbox: bboxOfContours(mergedContours),
    });
  }

  return { components, warnings };
}

// Pairwise CrossSection.intersect non-empty test. Allocates two CrossSections,
// computes the intersection, checks isEmpty, and deletes everything.
function crossSectionsIntersect(
  a: GlyphContours,
  b: GlyphContours,
  CrossSection: typeof import("manifold-3d").CrossSection,
): boolean {
  const csA = new CrossSection(a, "NonZero");
  const csB = new CrossSection(b, "NonZero");
  const inter = csA.intersect(csB);
  const empty = inter.isEmpty();
  csA.delete();
  csB.delete();
  inter.delete();
  return !empty;
}

// Union a list of contour sets and return the union's polygons. Deletes every
// intermediate CrossSection.
function unionAll(
  sets: GlyphContours[],
  CrossSection: typeof import("manifold-3d").CrossSection,
): GlyphContours {
  if (sets.length === 0) return [];
  let acc: import("manifold-3d").CrossSection = new CrossSection(sets[0], "NonZero");
  for (let i = 1; i < sets.length; i++) {
    const next = new CrossSection(sets[i], "NonZero");
    const merged: import("manifold-3d").CrossSection = acc.add(next);
    acc.delete();
    next.delete();
    acc = merged;
  }
  const polys = acc.toPolygons() as GlyphContours;
  acc.delete();
  return polys;
}
