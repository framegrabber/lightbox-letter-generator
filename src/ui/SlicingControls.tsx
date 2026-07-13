import { useParameters } from "../state/parameters";
import { useUI } from "../state/ui";
import { validate } from "../geometry/validate";
import { suggestCuts } from "../geometry/slice";

function errorFor(errors: { field: string; message: string }[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function SlicingControls() {
  const params = useParameters();
  const wordBBox = useUI((s) => s.wordBBox);
  const result = validate(params);
  const errs = result.ok ? [] : result.errors;

  return (
    <>
      <div className="number-field">
        <label>Max piece width</label>
        <div className="number-field-input">
          <input
            type="number"
            inputMode="decimal"
            step={1}
            value={params.maxPieceWidth}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) params.set({ maxPieceWidth: v });
            }}
          />
          <span className="number-field-unit">mm</span>
        </div>
        {errorFor(errs, "maxPieceWidth") && (
          <div className="number-field-error" role="alert">
            {errorFor(errs, "maxPieceWidth")}
          </div>
        )}
      </div>
      <p className="field-help">
        Printer build volume in X. Zero disables Suggest. Slicing always applies when cuts are present.
      </p>

      <div className="slicing-actions">
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (wordBBox) {
              params.set({ cuts: suggestCuts(wordBBox, params.maxPieceWidth) });
            }
          }}
          disabled={params.maxPieceWidth <= 0 || !wordBBox}
          title="Suggest cuts based on max piece width"
        >
          Suggest
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            params.set({ cuts: [...params.cuts, { x: 100, angle: 0 }] });
          }}
        >
          Add cut
        </button>
        <button
          className="btn btn-icon"
          onClick={() => params.set({ cuts: [] })}
          disabled={params.cuts.length === 0}
          title="Clear all cuts"
        >
          Clear
        </button>
      </div>

      {params.cuts.length === 0 ? (
        <p className="field-help empty-state">No cuts defined. Add a cut or suggest based on build volume.</p>
      ) : (
        <div className="cut-list">
          {params.cuts.map((cut, idx) => (
            <div key={idx} className="cut-row">
              <span className="cut-index">#{idx + 1}</span>
              <div className="cut-inputs">
                <label className="compact-label">
                  X
                  <input
                    type="number"
                    className="compact-input"
                    value={cut.x}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        const newCuts = [...params.cuts];
                        newCuts[idx] = { ...newCuts[idx], x: v };
                        params.set({ cuts: newCuts });
                      }
                    }}
                    step={1}
                  />
                  <span className="compact-unit">mm</span>
                </label>
                <label className="compact-label">
                  Angle
                  <input
                    type="number"
                    className="compact-input"
                    value={cut.angle}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        const newCuts = [...params.cuts];
                        newCuts[idx] = { ...newCuts[idx], angle: Math.max(-89, Math.min(89, v)) };
                        params.set({ cuts: newCuts });
                      }
                    }}
                    step={1}
                  />
                  <span className="compact-unit">°</span>
                </label>
              </div>
              <button
                className="cut-remove-btn"
                onClick={() => {
                  const newCuts = params.cuts.filter((_, i) => i !== idx);
                  params.set({ cuts: newCuts });
                }}
                title="Remove cut"
                aria-label={`Remove cut ${idx + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
