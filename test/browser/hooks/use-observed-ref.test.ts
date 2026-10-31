import { render } from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  useIntersectionObservedRef,
  useResizeObservedRef,
} from "../../../src/browser/hooks/use-observed-ref.ts"

class FakeObserver {
  static readonly all: FakeObserver[] = []
  readonly observed: Element[] = []
  disconnected = false
  readonly callback: (entries: unknown[]) => void
  constructor(callback: (entries: unknown[]) => void) {
    this.callback = callback
    FakeObserver.all.push(this)
  }
  observe(element: Element): void {
    this.observed.push(element)
  }
  disconnect(): void {
    this.disconnected = true
  }
}

afterEach(() => {
  FakeObserver.all.length = 0
  vi.unstubAllGlobals()
})

function Resized(props: {
  readonly onResize: (element: HTMLElement) => void
  readonly onDetach: (element: HTMLElement) => void
}): ReactElement {
  const ref = useResizeObservedRef<HTMLDivElement>(props.onResize, props.onDetach)
  return createElement("div", { ref })
}

function Intersected(props: {
  readonly enabled: boolean
  readonly onIntersect: (entries: readonly IntersectionObserverEntry[], stop: () => void) => void
  readonly onDetach: () => void
}): ReactElement {
  const ref = useIntersectionObservedRef<HTMLDivElement>({ ...props, init: () => ({}) })
  return createElement("div", { ref })
}

describe("useResizeObservedRef", () => {
  it("付くと観測を始めて1回測り、外れると切って後始末を呼ぶ", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver)
    const onResize = vi.fn<(element: HTMLElement) => void>()
    const onDetach = vi.fn<(element: HTMLElement) => void>()
    const view = render(createElement(Resized, { onResize, onDetach }))
    const observer = FakeObserver.all[0]
    expect(observer?.observed).toHaveLength(1)
    expect(onResize).toHaveBeenCalledTimes(1)

    observer?.callback([])
    expect(onResize).toHaveBeenCalledTimes(2)

    view.unmount()
    expect(observer?.disconnected).toBe(true)
    expect(onDetach).toHaveBeenCalledTimes(1)
  })

  it("コールバックが替わると付け直し、新しいほうが呼ばれる", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver)
    const first = vi.fn<(element: HTMLElement) => void>()
    const second = vi.fn<(element: HTMLElement) => void>()
    const onDetach = vi.fn<(element: HTMLElement) => void>()
    const view = render(createElement(Resized, { onResize: first, onDetach }))
    view.rerender(createElement(Resized, { onResize: second, onDetach }))
    expect(FakeObserver.all[0]?.disconnected).toBe(true)
    const latest = FakeObserver.all.at(-1)
    latest?.callback([])
    expect(second).toHaveBeenCalledTimes(2)
    expect(first).toHaveBeenCalledTimes(1)
  })
})

describe("useIntersectionObservedRef", () => {
  it("enabled のあいだだけ観測し、外れると切って後始末を呼ぶ", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    const onIntersect =
      vi.fn<(entries: readonly IntersectionObserverEntry[], stop: () => void) => void>()
    const onDetach = vi.fn<() => void>()
    const view = render(createElement(Intersected, { enabled: false, onIntersect, onDetach }))
    expect(FakeObserver.all).toHaveLength(0)

    view.rerender(createElement(Intersected, { enabled: true, onIntersect, onDetach }))
    expect(FakeObserver.all.at(-1)?.observed).toHaveLength(1)

    view.unmount()
    expect(FakeObserver.all.at(-1)?.disconnected).toBe(true)
    expect(onDetach).toHaveBeenCalledTimes(1)
  })

  it("stop を呼ぶとその観測をやめる", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    const onIntersect = vi.fn<
      (entries: readonly IntersectionObserverEntry[], stop: () => void) => void
    >((_entries, stop) => {
      stop()
    })
    render(
      createElement(Intersected, { enabled: true, onIntersect, onDetach: vi.fn<() => void>() }),
    )
    const observer = FakeObserver.all[0]
    observer?.callback([])
    expect(observer?.disconnected).toBe(true)
  })
})
