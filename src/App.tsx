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
        <footer className="app-footer">
          <a
            href="https://github.com/framegrabber/lightbox-letter-generator"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub
          </a>
        </footer>
      </div>
    </PreviewBuildProvider>
  );
}
