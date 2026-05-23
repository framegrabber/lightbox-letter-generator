export type BundledFont = {
  id: string;
  label: string;
  path: string; // relative to base; loaded via fetch
  license: string;
};

export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: "inter",
    label: "Inter (sans)",
    path: "fonts/Inter-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "bebas",
    label: "Bebas Neue (display)",
    path: "fonts/BebasNeue-Regular.ttf",
    license: "SIL OFL 1.1",
  },
];

export function bundledFontById(id: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((f) => f.id === id);
}
