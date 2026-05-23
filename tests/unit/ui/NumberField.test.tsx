import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "../../../src/ui/NumberField";

describe("NumberField", () => {
  it("renders label and value", () => {
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={() => {}} />);
    expect(screen.getByLabelText("Wall thickness")).toHaveValue(3);
    expect(screen.getByText("mm")).toBeInTheDocument();
  });

  it("calls onChange with parsed numeric value", () => {
    const onChange = vi.fn();
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Wall thickness"), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("displays error message when error prop set", () => {
    render(
      <NumberField
        label="Rabbet depth"
        unit="mm"
        value={3}
        onChange={() => {}}
        error="Must be less than total depth"
      />,
    );
    expect(screen.getByText("Must be less than total depth")).toBeInTheDocument();
  });
});
