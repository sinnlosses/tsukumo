import { renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import { describe, expect, it, vi } from "vitest"

import { useMountEffect, useUnmountEffect } from "../../../src/browser/hooks/use-mount-effect.ts"

describe("useMountEffect", () => {
  it("マウント時に1回だけ走り、再描画では走らず、外れると後始末が走る", () => {
    const cleanup = vi.fn<() => void>()
    const effect = vi.fn<() => () => void>(() => cleanup)
    const view = renderHook(() => {
      useMountEffect(effect)
    })
    view.rerender()
    expect(effect).toHaveBeenCalledTimes(1)
    expect(cleanup).not.toHaveBeenCalled()
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it("setup→cleanup→setup の再演で、走った数と後始末の数が釣り合う", () => {
    const cleanup = vi.fn<() => void>()
    const effect = vi.fn<() => () => void>(() => cleanup)
    const view = renderHook(
      () => {
        useMountEffect(effect)
      },
      { wrapper: StrictMode },
    )
    expect(effect).toHaveBeenCalledTimes(2)
    expect(cleanup).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it("依存配列を受けない", () => {
    const view = renderHook(() => {
      // @ts-expect-error 第2引数は受けない
      useMountEffect(() => {}, [])
    })
    expect(view.result.current).toBeUndefined()
    view.unmount()
  })
})

describe("useUnmountEffect", () => {
  it("外れるときにだけ、最新の関数が走る", () => {
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    const view = renderHook(
      ({ cleanup }) => {
        useUnmountEffect(cleanup)
      },
      { initialProps: { cleanup: first } },
    )
    view.rerender({ cleanup: second })
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    view.unmount()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("setup→cleanup→setup の再演では、再演の1回と外れる1回で2回走る", () => {
    const cleanup = vi.fn<() => void>()
    const view = renderHook(
      () => {
        useUnmountEffect(cleanup)
      },
      { wrapper: StrictMode },
    )
    expect(cleanup).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})
