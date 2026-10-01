import { act, cleanup, render, screen } from "@testing-library/react"
import { useRef, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { useMainViewHold } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-main-view-hold.ts"
import { useMainViewContent } from "../../../../../../../../src/browser/stores/main-view-content.ts"

afterEach(() => {
  cleanup()
  act(() => {
    useMainViewContent.setState(useMainViewContent.getInitialState(), true)
  })
})

function Probe(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  useMainViewHold(rootRef)
  return (
    <>
      <div ref={rootRef} data-testid="root">
        <button type="button">中のボタン</button>
      </div>
      <div data-testid="outside">
        <button type="button">外のボタン</button>
      </div>
    </>
  )
}

function hold(): Readonly<Record<"focus" | "scroll", boolean>> {
  return useMainViewContent.getState().hold
}

function fire(target: EventTarget, type: string): void {
  act(() => {
    target.dispatchEvent(new Event(type))
  })
}

describe("useMainViewHold", () => {
  it("中にフォーカスが入ると保留し、外へ出ると解く", () => {
    render(<Probe />)
    act(() => {
      screen.getByRole("button", { name: "中のボタン" }).focus()
    })
    expect(hold().focus).toBe(true)

    act(() => {
      screen.getByRole("button", { name: "外のボタン" }).focus()
    })
    expect(hold().focus).toBe(false)
  })

  it("根か、根を含む祖先が転がると scrollend まで保留する", () => {
    render(<Probe />)
    const root = screen.getByTestId("root")

    fire(root, "scroll")
    expect(hold().scroll).toBe(true)
    fire(root, "scrollend")
    expect(hold().scroll).toBe(false)

    fire(document.body, "scroll")
    expect(hold().scroll).toBe(true)
    fire(document.body, "scrollend")
    expect(hold().scroll).toBe(false)
  })

  it("根の外の要素が転がっても保留しない", () => {
    render(<Probe />)
    fire(screen.getByTestId("outside"), "scroll")
    expect(hold().scroll).toBe(false)
  })

  it("外れると保留を解く", () => {
    const { unmount } = render(<Probe />)
    fire(screen.getByTestId("root"), "scroll")
    unmount()
    expect(hold().scroll).toBe(false)
  })
})
