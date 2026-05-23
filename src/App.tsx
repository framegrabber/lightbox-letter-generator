import "./ui/styles.css";
import { ControlsPanel } from "./ui/ControlsPanel";
import { PreviewCanvas } from "./ui/PreviewCanvas";
import { PreviewBuildProvider } from "./ui/preview-build-context";

export default function App() {
  return (
    <PreviewBuildProvider>
      <div className="app">
        <ControlsPanel />
        <PreviewCanvas />
      </div>
    </PreviewBuildProvider>
  );
}
