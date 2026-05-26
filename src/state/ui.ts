import { create } from "zustand";

// Session-only UI state (not persisted to URL/localStorage).
type UIState = {
  showCameraHUD: boolean;
  setShowCameraHUD: (v: boolean) => void;
  showPlexi: boolean;
  setShowPlexi: (v: boolean) => void;
  showShadow: boolean;
  setShowShadow: (v: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  showCameraHUD: false,
  setShowCameraHUD: (v) => set({ showCameraHUD: v }),
  showPlexi: true,
  setShowPlexi: (v) => set({ showPlexi: v }),
  showShadow: false,
  setShowShadow: (v) => set({ showShadow: v }),
}));
