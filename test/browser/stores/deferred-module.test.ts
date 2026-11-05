import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { deferredModule } from "../../../src/browser/stores/deferred-module.ts"

type FictionalModule = { readonly name: string }

describe("deferredModule", () => {
  it("誰も load を呼んでいなくても、状態を購読した部品が描かれれば読み始めて読み終える", async () => {
    const importModule = vi.fn<() => Promise<FictionalModule>>(() =>
      Promise.resolve({ name: "架空のモジュール" }),
    )
    const deferred = deferredModule(importModule)

    const view = renderHook(() => deferred.useLoadState())

    await waitFor(() => {
      expect(view.result.current).toEqual({ kind: "ready", module: { name: "架空のモジュール" } })
    })
    expect(importModule).toHaveBeenCalledTimes(1)
  })

  it("購読する部品が増えても、先に load を呼んでいても、import は1回だけ", async () => {
    const importModule = vi.fn<() => Promise<FictionalModule>>(() =>
      Promise.resolve({ name: "架空のモジュール" }),
    )
    const deferred = deferredModule(importModule)

    void deferred.load()
    const first = renderHook(() => deferred.useLoadState())
    const second = renderHook(() => deferred.useLoadState())

    await waitFor(() => {
      expect(second.result.current.kind).toBe("ready")
    })
    expect(first.result.current.kind).toBe("ready")
    expect(importModule).toHaveBeenCalledTimes(1)
  })

  it("読めなかったら failed にして、購読し直しても取り直さない", async () => {
    const importModule = vi.fn<() => Promise<FictionalModule>>(() =>
      Promise.reject(new Error("架空の失敗")),
    )
    const deferred = deferredModule(importModule)

    const view = renderHook(() => deferred.useLoadState())
    await waitFor(() => {
      expect(view.result.current.kind).toBe("failed")
    })
    renderHook(() => deferred.useLoadState())
    expect(importModule).toHaveBeenCalledTimes(1)
  })
})
