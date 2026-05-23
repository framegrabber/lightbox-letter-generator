import { type ReactNode } from "react";
import { usePreviewBuild } from "./usePreviewBuild";
import { PreviewBuildContext } from "./preview-build-context-def";

export function PreviewBuildProvider({ children }: { children: ReactNode }) {
  const value = usePreviewBuild();
  return (
    <PreviewBuildContext.Provider value={value}>{children}</PreviewBuildContext.Provider>
  );
}
