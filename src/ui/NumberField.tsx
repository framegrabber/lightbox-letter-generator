import { useId } from "react";

type Props = {
  label: string;
  unit: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  error?: string;
};

export function NumberField({ label, unit, value, onChange, step = 0.1, min = 0, error }: Props) {
  const id = useId();
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
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
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
