import { createContext } from "react";
import type { usePreviewBuild } from "./usePreviewBuild";

export type PreviewBuildCtx = ReturnType<typeof usePreviewBuild>;

export const PreviewBuildContext = createContext<PreviewBuildCtx | null>(null);
