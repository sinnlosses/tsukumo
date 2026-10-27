import { act, cleanup, render } from "@testing-library/react"
import { useRef, type ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useSeenOnce } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/hooks/use-seen-once.ts"
import { stubIntersectionObserver } from "../../../../../../../fixture/intersection.ts"

function Probe(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useSeenOnce(ref)
  return <div ref={ref} data-seen={String(seen)} />
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useSeenOnce", () => {
  it("交差するまで false で、交差したら true になり観測をやめる", () => {
    const intersection = stubIntersectionObserver(false)
    const view = render(<Probe />)
    expect(view.container.firstElementChild?.getAttribute("data-seen")).toBe("false")

    act(() => {
      intersection.intersect()
    })

    expect(view.container.firstElementChild?.getAttribute("data-seen")).toBe("true")
    expect(intersection.instances[0]?.disconnect).toHaveBeenCalled()
  })

  it("転がる箱の中にあれば、その箱を根にして余白を付ける（無ければ窓）", () => {
    const intersection = stubIntersectionObserver(false)
    const inBox = render(
      <div data-box="yes" style={{ overflowY: "auto" }}>
        <Probe />
      </div>,
    )
    expect(intersection.instances[0]?.options.root).toBe(
      inBox.container.querySelector("[data-box]"),
    )
    expect(intersection.instances[0]?.options.rootMargin).toBe("200px")
    inBox.unmount()

    render(<Probe />)
    expect(intersection.instances[1]?.options.root).toBeNull()
  })

  it("アンマウントで観測をやめる", () => {
    const intersection = stubIntersectionObserver(false)
    const view = render(<Probe />)
    view.unmount()

    expect(intersection.instances[0]?.disconnect).toHaveBeenCalled()
  })
})
