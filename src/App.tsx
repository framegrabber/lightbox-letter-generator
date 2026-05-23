import "./ui/styles.css";
import { ControlsPanel } from "./ui/ControlsPanel";
import { PreviewCanvas } from "./ui/PreviewCanvas";

export default function App() {
  return (
    <div className="app">
      <ControlsPanel />
      <PreviewCanvas />
    </div>
  );
}
