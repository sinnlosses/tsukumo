import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  type ShownTarget,
  useActiveTurnScroll,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-active-turn-scroll.ts"
import { useReadingPosition } from "../../../../../../../../src/browser/stores/reading-position.ts"
import { useSession } from "../../../../../../../../src/browser/stores/session.ts"

// 見出しの並びは寸法を持たない jsdom に代わって、上端を差し替えられる要素で作る。
const headingState = vi.hoisted(() => {
  const tops: number[] = []
  return { tops }
})

vi.mock(
  "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/report-heading.ts",
  () => ({
    readableHeadings: (): HTMLElement[] =>
      headingState.tops.map((top) => {
        const heading = document.createElement("h4")
        heading.getBoundingClientRect = (): DOMRect => new DOMRect(0, top, 0, 0)
        return heading
      }),
  }),
)

let scroller: HTMLElement
let root: HTMLElement
const scrollIntoView = vi.fn<() => void>()
const scrollBy = vi.fn<() => void>()

beforeEach(() => {
  scroller = document.createElement("div")
  scroller.style.overflowY = "auto"
  root = document.createElement("div")
  scroller.append(root)
  document.body.append(scroller)
  scrollBy.mockClear()
  scrollIntoView.mockClear()
  Object.defineProperty(scroller, "scrollBy", { value: scrollBy })
  Object.defineProperty(root, "scrollIntoView", { value: scrollIntoView })
  headingState.tops = []
})

afterEach(() => {
  cleanup()
  scroller.remove()
  useReadingPosition.setState(useReadingPosition.getInitialState(), true)
})

function report(turnId: number): ShownTarget {
  return { kind: "report", turnId }
}

function work(turnId: number): ShownTarget {
  return { kind: "work", turnId }
}

function renderScroll(initial: ShownTarget): {
  readonly move: (shown: ShownTarget, tops: readonly number[]) => void
  readonly scrollTo: (tops: readonly number[]) => void
  readonly unmount: () => void
} {
  const scrollerRef = { current: root }
  const { rerender, unmount } = renderHook(({ shown }) => useActiveTurnScroll(scrollerRef, shown), {
    initialProps: { shown: initial },
  })
  return {
    unmount,
    move: (shown, tops) => {
      headingState.tops = [...tops]
      rerender({ shown })
    },
    scrollTo: (tops) => {
      headingState.tops = [...tops]
      document.dispatchEvent(new Event("scroll"))
    },
  }
}

describe("useActiveTurnScroll", () => {
  it("初めて開くやり取りは先頭から見せる", () => {
    renderScroll(report(1))

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it("別のやり取りへ移って戻ると、覚えた見出しが覚えたずれの位置に来るまで動かす", () => {
    const view = renderScroll(report(1))
    view.scrollTo([-300, -40, 200])
    view.move(report(2), [0, 500])
    scrollIntoView.mockClear()

    view.move(report(1), [120, 900, 1500])

    expect(scrollBy).toHaveBeenCalledWith({ top: 940, behavior: "instant" })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("画面を隠して戻しても覚えは残り、セッションの世代が変わったら捨てる", () => {
    const first = renderScroll(report(1))
    first.scrollTo([-300, -40, 200])
    first.move(report(2), [0, 500])
    first.unmount()

    renderScroll(report(2))
    expect(useReadingPosition.getState().positions[1]).toBeDefined()

    act(() => {
      useSession.setState((current) => ({ generation: current.generation + 1 }))
    })
    expect(useReadingPosition.getState().positions).toEqual({})
  })

  it("覚えた番号の見出しが無くなっていれば先頭から見せる", () => {
    const view = renderScroll(report(1))
    view.scrollTo([-300, -40, 200])
    view.move(report(2), [0])
    scrollIntoView.mockClear()

    view.move(report(1), [120])

    expect(scrollBy).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
  })

  it("最初の見出しより上で離れたやり取りは覚えず、戻ったら先頭から見せる", () => {
    const view = renderScroll(report(1))
    view.scrollTo([100, 400])
    view.move(report(2), [0])
    scrollIntoView.mockClear()

    view.move(report(1), [100, 400])

    expect(scrollBy).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
  })

  it("働くあいだの札が閉じてレポートに替わるときは、覚えがあっても先頭から見せる", () => {
    useReadingPosition.getState().remember(1, { headingIndex: 1, offsetPx: -40 })
    const view = renderScroll(work(1))
    scrollIntoView.mockClear()

    view.move(report(1), [120, 900])

    expect(scrollBy).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
  })

  it("同じやり取りを指す別の値で描き直しても、先頭へ戻さず覚えも動かさない", () => {
    const view = renderScroll(report(1))
    scrollIntoView.mockClear()

    view.move(report(1), [120])

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it("札が無い（none）ときは何も動かさない", () => {
    const view = renderScroll(report(1))
    scrollIntoView.mockClear()

    view.move({ kind: "none" }, [])

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
