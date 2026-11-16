import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFavorVisibility } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-favor-visibility.ts"
import { useFavorVisibility as useFavorVisibilityStore } from "../../../../../../../../src/browser/components/page/conversation/stores/favor-visibility.ts"
import { useComposerFocus } from "../../../../../../../../src/browser/stores/composer-focus.ts"

class FakeIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  useFavorVisibilityStore.setState(useFavorVisibilityStore.getInitialState(), true)
})

function Probe(): ReactElement {
  const ref = useFavorVisibility()
  return (
    <div ref={ref} id="favor-a" data-testid="favor">
      <button type="button">次の一手</button>
    </div>
  )
}

describe("useFavorVisibility", () => {
  it("欄の中で Esc を押すと入力欄へフォーカスを戻す合図を出し、修飾キーつきでは出さない", () => {
    const view = render(<Probe />)
    const button = view.getByRole("button", { name: "次の一手" })
    const before = useComposerFocus.getState().signal

    fireEvent.keyDown(button, { key: "Escape", metaKey: true })
    expect(useComposerFocus.getState().signal).toBe(before)

    fireEvent.keyDown(button, { key: "Escape" })
    expect(useComposerFocus.getState().signal).toBe(before + 1)
  })

  it("欄が付くと store にお願いとして写し、外れると戻す", () => {
    const view = render(<Probe />)
    expect(useFavorVisibilityStore.getState().favorId).toBe("favor-a")

    view.unmount()

    expect(useFavorVisibilityStore.getState().favorId).toBeUndefined()
  })
})
