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

  it("allows clearing the input without snapping back to the value", () => {
    const onChange = vi.fn();
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={onChange} />);
    const input = screen.getByLabelText("Wall thickness") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits new value once the cleared input is replaced with a number", () => {
    const onChange = vi.fn();
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={onChange} />);
    const input = screen.getByLabelText("Wall thickness") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
    expect(input.value).toBe("7");
  });

  it("snaps the input text back to the prop value on blur if cleared", () => {
    render(<NumberField label="Wall thickness" unit="mm" value={3} onChange={() => {}} />);
    const input = screen.getByLabelText("Wall thickness") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    fireEvent.blur(input);
    expect(input.value).toBe("3");
  });
});
