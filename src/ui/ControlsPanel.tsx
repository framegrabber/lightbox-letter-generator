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
        <NumberField
          label="Back cavity depth"
          unit="mm"
          value={params.backCavityDepth}
          onChange={(v) => params.set({ backCavityDepth: v })}
          error={errorFor(errs, "backCavityDepth")}
          step={1}
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

      <fieldset>
        <legend>Cable holes</legend>
        <NumberField
          label="Cable hole diameter"
          unit="mm"
          value={params.cableHoleDiameter}
          onChange={(v) => params.set({ cableHoleDiameter: v })}
          error={errorFor(errs, "cableHoleDiameter")}
          step={0.5}
        />
        <NumberField
          label="Cable hole Y"
          unit="mm"
          value={params.cableHoleY}
          onChange={(v) => params.set({ cableHoleY: v })}
          error={errorFor(errs, "cableHoleY")}
          step={1}
        />
        <NumberField
          label="Cable hole Z"
          unit="mm"
          value={params.cableHoleZ}
          onChange={(v) => params.set({ cableHoleZ: v })}
          error={errorFor(errs, "cableHoleZ")}
          step={1}
        />
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={params.cableHoleAtEnds}
            onChange={(e) => params.set({ cableHoleAtEnds: e.target.checked })}
          />
          Power-entry holes on outer ends
        </label>
      </fieldset>

      <fieldset>
        <legend>Mounting</legend>
        <NumberField
          label="Mount shank diameter"
          unit="mm"
          value={params.mountShankDiameter}
          onChange={(v) => params.set({ mountShankDiameter: v })}
          error={errorFor(errs, "mountShankDiameter")}
          step={0.5}
        />
        <NumberField
          label="Mount slot Y"
          unit="mm"
          value={params.mountSlotY}
          onChange={(v) => params.set({ mountSlotY: v })}
          error={errorFor(errs, "mountSlotY")}
          step={1}
        />
        <NumberField
          label="Mount slot X inset"
          unit="mm"
          value={params.mountSlotXInset}
          onChange={(v) => params.set({ mountSlotXInset: v })}
          error={errorFor(errs, "mountSlotXInset")}
          step={1}
        />
      </fieldset>

      <fieldset>
        <legend>Bulb holes</legend>
        <NumberField
          label="Bulb hole diameter"
          unit="mm"
          value={params.bulbHoleDiameter}
          onChange={(v) => params.set({ bulbHoleDiameter: v })}
          error={errorFor(errs, "bulbHoleDiameter")}
          step={0.5}
        />
        <NumberField
          label="Bulb hole spacing"
          unit="mm"
          value={params.bulbHoleSpacing}
          onChange={(v) => params.set({ bulbHoleSpacing: v })}
          error={errorFor(errs, "bulbHoleSpacing")}
          step={1}
        />
        <NumberField
          label="Bulb hole inset"
          unit="mm"
          value={params.bulbHoleInset}
          onChange={(v) => params.set({ bulbHoleInset: v })}
          error={errorFor(errs, "bulbHoleInset")}
          step={1}
        />
        <NumberField
          label="Bulb hole max per letter"
          unit=""
          value={params.bulbHoleMaxCount}
          onChange={(v) => params.set({ bulbHoleMaxCount: v })}
          error={errorFor(errs, "bulbHoleMaxCount")}
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
