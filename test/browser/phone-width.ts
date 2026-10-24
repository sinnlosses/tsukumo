import { vi } from "vitest"

/** 窓が狭い画面（760px 以下）に当たるか、という `matchMedia` の答えを差し替える。戻すのは `vi.restoreAllMocks()`。 */
export function stubPhoneWidth(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}
