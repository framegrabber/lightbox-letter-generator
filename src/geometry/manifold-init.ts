import Module from "manifold-3d";

type ManifoldNS = Awaited<ReturnType<typeof Module>>;

let cached: Promise<ManifoldNS> | null = null;

export function getManifold(): Promise<ManifoldNS> {
  if (!cached) {
    cached = Module().then(async (m) => {
      m.setup();
      return m;
    });
  }
  return cached;
}
