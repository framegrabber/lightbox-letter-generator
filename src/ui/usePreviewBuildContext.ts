import { useContext } from "react";
import { PreviewBuildContext, type PreviewBuildCtx } from "./preview-build-context-def";

export function usePreviewBuildContext(): PreviewBuildCtx {
  const v = useContext(PreviewBuildContext);
  if (!v) throw new Error("usePreviewBuildContext must be used inside PreviewBuildProvider");
  return v;
}
