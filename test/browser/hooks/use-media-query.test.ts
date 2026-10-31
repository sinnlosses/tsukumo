import { act, renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useMediaQuery } from "../../../src/browser/hooks/use-media-query.ts"

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  onchange = null
  listening = 0
  readonly media: string
  readonly read: () => boolean
  constructor(media: string, read: () => boolean) {
    super()
    this.media = media
    this.read = read
  }
  get matches(): boolean {
    return this.read()
  }
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    this.listening += 1
    super.addEventListener(...args)
  }
  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
    this.listening -= 1
    super.removeEventListener(...args)
  }
  addListener(): void {}
  removeListener(): void {}
}

function stubMediaQuery(initial: boolean) {
  const lists: FakeMediaQueryList[] = []
  let matches = initial
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const list = new FakeMediaQueryList(query, () => matches)
    lists.push(list)
    return list
  })
  return {
    change(next: boolean): void {
      matches = next
      for (const list of lists) {
        list.dispatchEvent(new Event("change"))
      }
    },
    listening(): number {
      return lists.reduce((sum, list) => sum + list.listening, 0)
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useMediaQuery", () => {
  it("今の答えを返し、変化に追随する", () => {
    const media = stubMediaQuery(false)
    const view = renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(view.result.current).toBe(false)
    act(() => {
      media.change(true)
    })
    expect(view.result.current).toBe(true)
  })

  it("外れると購読を解く", () => {
    const media = stubMediaQuery(false)
    const view = renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(media.listening()).toBe(1)
    view.unmount()
    expect(media.listening()).toBe(0)
  })

  it("setup→cleanup→setup の再演で、購読が1つだけ残る", () => {
    const media = stubMediaQuery(false)
    const view = renderHook(() => useMediaQuery("(max-width: 1px)"), { wrapper: StrictMode })
    expect(media.listening()).toBe(1)
    act(() => {
      media.change(true)
    })
    expect(view.result.current).toBe(true)
    view.unmount()
    expect(media.listening()).toBe(0)
  })
})
