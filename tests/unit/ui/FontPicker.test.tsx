import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const registry = new Map<string, { sha256: string; name: string; addedAt: number }>();

vi.mock("../../../src/fonts/cache", () => ({
  listUploadedFonts: vi.fn(async () => [...registry.values()]),
  registerUploadedFont: vi.fn(
    async (meta: { sha256: string; name: string; addedAt: number }) => {
      registry.set(meta.sha256, meta);
    },
  ),
  removeUploadedFont: vi.fn(async (sha256: string) => {
    registry.delete(sha256);
  }),
  getCachedFont: vi.fn(async () => undefined),
}));

import { FontPicker } from "../../../src/ui/FontPicker";
import { useParameters, DEFAULT_PARAMETERS } from "../../../src/state/parameters";
import { registerUploadedFont } from "../../../src/fonts/cache";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

describe("FontPicker uploaded-font library", () => {
  beforeEach(() => {
    registry.clear();
    vi.clearAllMocks();
    useParameters.setState({ ...DEFAULT_PARAMETERS });
  });

  it("lists registered uploads in an Uploaded optgroup", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    registry.set(SHA_B, { sha256: SHA_B, name: "Other.otf", addedAt: 2 });
    render(<FontPicker />);
    expect(await screen.findByRole("group", { name: "Uploaded" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "MyFont.ttf" })).toHaveValue(SHA_A);
    expect(screen.getByRole("option", { name: "Other.otf" })).toHaveValue(SHA_B);
  });

  it("hides the Uploaded optgroup when the registry is empty", async () => {
    render(<FontPicker />);
    // Wait for the mount-effect load to settle, then assert absence.
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Uploaded" })).not.toBeInTheDocument(),
    );
  });

  it("selecting an uploaded option sets fontSource", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    render(<FontPicker />);
    await screen.findByRole("option", { name: "MyFont.ttf" });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: SHA_A } });
    expect(useParameters.getState().fontSource).toEqual({
      kind: "uploaded",
      name: "MyFont.ttf",
      sha256: SHA_A,
    });
  });

  it("selecting a bundled option sets bundled fontSource", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    useParameters.setState({ fontSource: { kind: "uploaded", name: "MyFont.ttf", sha256: SHA_A } });
    render(<FontPicker />);
    await screen.findByRole("option", { name: "MyFont.ttf" });
    fireEvent.change(screen.getByLabelText("Font"), { target: { value: "inter" } });
    expect(useParameters.getState().fontSource).toEqual({ kind: "bundled", id: "inter" });
  });

  it("Remove deletes the selected upload and falls back to the default font", async () => {
    registry.set(SHA_A, { sha256: SHA_A, name: "MyFont.ttf", addedAt: 1 });
    useParameters.setState({ fontSource: { kind: "uploaded", name: "MyFont.ttf", sha256: SHA_A } });
    render(<FontPicker />);
    const removeBtn = await screen.findByRole("button", { name: "Remove uploaded font" });
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(useParameters.getState().fontSource).toEqual(DEFAULT_PARAMETERS.fontSource),
    );
    expect(screen.queryByRole("option", { name: "MyFont.ttf" })).not.toBeInTheDocument();
  });

  it("shows no Remove button while a bundled font is selected", async () => {
    render(<FontPicker />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove uploaded font" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("adopts a selected pre-index upload into the registry on mount", async () => {
    // Selected uploaded font whose sha is NOT in the registry (upload predates the index).
    useParameters.setState({ fontSource: { kind: "uploaded", name: "Old.ttf", sha256: SHA_B } });
    render(<FontPicker />);
    await waitFor(() => expect(registerUploadedFont).toHaveBeenCalled());
    expect(registerUploadedFont).toHaveBeenCalledWith(
      expect.objectContaining({ sha256: SHA_B, name: "Old.ttf" }),
    );
    expect(await screen.findByRole("option", { name: "Old.ttf" })).toHaveValue(SHA_B);
  });
});
