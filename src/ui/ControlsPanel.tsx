import { useParameters } from "../state/parameters";
import { useUI } from "../state/ui";
import { validate, type ValidationError } from "../geometry/validate";
import { TextInput } from "./TextInput";
import { FontPicker } from "./FontPicker";
import { NumberField } from "./NumberField";
import { ExportButtons } from "./ExportButtons";

function errorFor(errors: ValidationError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

function CameraHUDToggle() {
  const show = useUI((s) => s.showCameraHUD);
  const setShow = useUI((s) => s.setShowCameraHUD);
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
      Show camera HUD
    </label>
  );
}


function PlexiToggle() {
  const show = useUI((s) => s.showPlexi);
  const setShow = useUI((s) => s.setShowPlexi);
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
      Show plexi in preview
    </label>
  );
}

export function ControlsPanel() {
  const params = useParameters();
  const result = validate(params);
  const errs = result.ok ? [] : result.errors;

  return (
    <aside className="controls-panel">
      <TextInput />
      <FontPicker />

      <fieldset>
        <legend>Size</legend>
        <NumberField
          label="Letter height"
          unit="mm"
          value={params.letterHeight}
          onChange={(v) => params.set({ letterHeight: v })}
          error={errorFor(errs, "letterHeight")}
          step={1}
        />
      </fieldset>

      <fieldset>
        <legend>Walls</legend>
        <NumberField
          label="Wall thickness"
          unit="mm"
          value={params.wallThickness}
          onChange={(v) => params.set({ wallThickness: v })}
          error={errorFor(errs, "wallThickness")}
        />
        <NumberField
          label="Total depth"
          unit="mm"
          value={params.totalDepth}
          onChange={(v) => params.set({ totalDepth: v })}
          error={errorFor(errs, "totalDepth")}
        />
        <NumberField
          label="Back thickness"
          unit="mm"
          value={params.backThickness}
          onChange={(v) => params.set({ backThickness: v })}
          error={errorFor(errs, "backThickness")}
        />
      </fieldset>

      <fieldset>
        <legend>Plexi inset</legend>
        <NumberField
          label="Rabbet depth"
          unit="mm"
          value={params.rabbetDepth}
          onChange={(v) => params.set({ rabbetDepth: v })}
          error={errorFor(errs, "rabbetDepth")}
        />
        <NumberField
          label="Inset width"
          unit="mm"
          value={params.insetWidth}
          onChange={(v) => params.set({ insetWidth: v })}
          error={errorFor(errs, "insetWidth")}
        />
        <NumberField
          label="Plexi tolerance"
          unit="mm"
          value={params.plexiTolerance}
          onChange={(v) => params.set({ plexiTolerance: v })}
          error={errorFor(errs, "plexiTolerance")}
          step={0.05}
        />
        <PlexiToggle />
      </fieldset>

      <fieldset>
        <legend>Connectors</legend>
        <NumberField
          label="Letter overlap"
          unit="mm"
          value={params.letterOverlap}
          onChange={(v) => params.set({ letterOverlap: v })}
          error={errorFor(errs, "letterOverlap")}
          step={1}
        />
        <NumberField
          label="Bridge width"
          unit="mm"
          value={params.bridgeWidth}
          onChange={(v) => params.set({ bridgeWidth: v })}
          error={errorFor(errs, "bridgeWidth")}
          step={1}
        />
        <NumberField
          label="Bridge height"
          unit="mm"
          value={params.bridgeHeight}
          onChange={(v) => params.set({ bridgeHeight: v })}
          error={errorFor(errs, "bridgeHeight")}
          step={1}
        />
        <NumberField
          label="Bridge Y"
          unit="mm"
          value={params.bridgeY}
          onChange={(v) => params.set({ bridgeY: v })}
          error={errorFor(errs, "bridgeY")}
          step={1}
        />
      </fieldset>

      <details>
        <summary>Advanced</summary>
        <NumberField
          label="Bezier tolerance"
          unit="mm"
          value={params.bezierTolerance}
          onChange={(v) => params.set({ bezierTolerance: v })}
          step={0.01}
          error={errorFor(errs, "bezierTolerance")}
        />
        <CameraHUDToggle />
      </details>

      <ExportButtons disabled={!result.ok} />
    </aside>
  );
}
