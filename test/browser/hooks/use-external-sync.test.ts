import { renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useBeforePaintSync } from "../../../src/browser/hooks/use-before-paint-sync.ts"
import { useExternalSync } from "../../../src/browser/hooks/use-external-sync.ts"

describe.each([
  ["useExternalSync", useExternalSync],
  ["useBeforePaintSync", useBeforePaintSync],
])("%s", (_name, useSync) => {
  it("初回に1回走り、deps が変わるたびに後始末してから走り直し、外れると後始末が走る", () => {
    const cleanup = vi.fn<() => void>()
    const effect = vi.fn<() => () => void>(() => cleanup)
    const view = renderHook(
      ({ value }) => {
        useSync(effect, [value])
      },
      { initialProps: { value: 1 } },
    )
    expect(effect).toHaveBeenCalledTimes(1)
    view.rerender({ value: 1 })
    expect(effect).toHaveBeenCalledTimes(1)
    view.rerender({ value: 2 })
    expect(effect).toHaveBeenCalledTimes(2)
    expect(cleanup).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it("setup→cleanup→setup の再演で、走った数と後始末の数が釣り合う", () => {
    const cleanup = vi.fn<() => void>()
    const effect = vi.fn<() => () => void>(() => cleanup)
    const view = renderHook(
      () => {
        useSync(effect, [])
      },
      { wrapper: StrictMode },
    )
    expect(effect).toHaveBeenCalledTimes(2)
    expect(cleanup).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it("deps が同じでも、effect は最新の関数を読む", () => {
    const seen: number[] = []
    const view = renderHook(
      ({ value }) => {
        useSync(() => {
          seen.push(value)
        }, [value > 0])
      },
      { initialProps: { value: 1 } },
    )
    view.rerender({ value: 2 })
    expect(seen).toEqual([1])
  })
})

describe("依存配列は省けない", () => {
  it("useExternalSync", () => {
    const view = renderHook(() => {
      // @ts-expect-error 第2引数は必須
      useExternalSync(() => {})
    })
    expect(view.result.current).toBeUndefined()
    view.unmount()
  })

  it("useBeforePaintSync", () => {
    const view = renderHook(() => {
      // @ts-expect-error 第2引数は必須
      useBeforePaintSync(() => {})
    })
    expect(view.result.current).toBeUndefined()
    view.unmount()
  })
})
