import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  error?: string;
};

export function NumberField({ label, unit, value, onChange, step = 0.1, min, error }: Props) {
  const id = useId();
  // Local string state lets the user clear the input or type intermediate
  // values like "" or "5." without the controlled `value` snapping it back.
  const [text, setText] = useState(() => String(value));
  const lastCommitted = useRef<number>(value);

  useEffect(() => {
    // External value change (not caused by typing in this field) — re-sync.
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className="number-field-input">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== lastCommitted.current) {
              lastCommitted.current = v;
              onChange(v);
            }
          }}
          onBlur={() => {
            // Snap back if the user left the field with an unparseable value.
            const v = parseFloat(text);
            if (!Number.isFinite(v)) setText(String(value));
          }}
        />
        <span className="number-field-unit">{unit}</span>
      </div>
      {error && (
        <div className="number-field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
