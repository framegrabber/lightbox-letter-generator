export type BundledFont = {
  id: string;
  label: string;
  path: string; // relative to base; loaded via fetch
  license: string;
};

export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: "inter",
    label: "Inter — Sans",
    path: "fonts/Inter-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "montserrat",
    label: "Montserrat — Geometric sans",
    path: "fonts/Montserrat-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "anton",
    label: "Anton — Bold condensed",
    path: "fonts/Anton-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "bebas",
    label: "Bebas Neue — Condensed display",
    path: "fonts/BebasNeue-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "bungee",
    label: "Bungee — Signage display",
    path: "fonts/Bungee-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "robotoslab",
    label: "Roboto Slab — Slab serif",
    path: "fonts/RobotoSlab-Regular.ttf",
    license: "Apache 2.0",
  },
  {
    id: "playfair",
    label: "Playfair Display — Serif",
    path: "fonts/PlayfairDisplay-Regular.ttf",
    license: "SIL OFL 1.1",
  },
  {
    id: "pacifico",
    label: "Pacifico — Script",
    path: "fonts/Pacifico-Regular.ttf",
    license: "SIL OFL 1.1",
  },
];

export function bundledFontById(id: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((f) => f.id === id);
}
