import { describe, expect, it } from "vitest"

import {
  DEFAULT_VIEW_PORT,
  resolveViewPort,
  resolveViewPortFallbackBase,
} from "../../../src/shared/view-server/view-port.ts"

describe("resolveViewPort", () => {
  it("未設定・空文字は既定ポートを使う", () => {
    expect(resolveViewPort(undefined)).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
    expect(resolveViewPort("")).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
    expect(resolveViewPort("   ")).toEqual({ kind: "default", port: DEFAULT_VIEW_PORT })
  })

  it("数値を渡すと明示的に指定したものとして扱う（0 も含む）", () => {
    expect(resolveViewPort("8080")).toEqual({ kind: "explicit", port: 8080 })
    expect(resolveViewPort("0")).toEqual({ kind: "explicit", port: 0 })
  })

  it("ポート番号として読めない値は invalid", () => {
    expect(resolveViewPort("ぜんぶ")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("-1")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("70000")).toEqual({ kind: "invalid" })
    expect(resolveViewPort("1.5")).toEqual({ kind: "invalid" })
  })

  it("未設定・空文字のときだけ2つめの引数（既定の起点）を使う", () => {
    expect(resolveViewPort(undefined, 20000)).toEqual({ kind: "default", port: 20000 })
    expect(resolveViewPort("", 20000)).toEqual({ kind: "default", port: 20000 })
    // 明示的に渡したときは起点の差し替えに関わらず、渡された値がそのまま使われる。
    expect(resolveViewPort("8080", 20000)).toEqual({ kind: "explicit", port: 8080 })
  })
})

describe("resolveViewPortFallbackBase", () => {
  it("未設定・空文字は DEFAULT_VIEW_PORT のまま", () => {
    expect(resolveViewPortFallbackBase(undefined)).toBe(DEFAULT_VIEW_PORT)
    expect(resolveViewPortFallbackBase("")).toBe(DEFAULT_VIEW_PORT)
  })

  it("整数として読めれば起点として使う", () => {
    expect(resolveViewPortFallbackBase("20000")).toBe(20000)
    expect(resolveViewPortFallbackBase(" 20000 ")).toBe(20000)
  })

  it("読めない値は起動を止めず、DEFAULT_VIEW_PORT に倒す", () => {
    expect(resolveViewPortFallbackBase("ぜんぶ")).toBe(DEFAULT_VIEW_PORT)
    expect(resolveViewPortFallbackBase("-1")).toBe(DEFAULT_VIEW_PORT)
    expect(resolveViewPortFallbackBase("70000")).toBe(DEFAULT_VIEW_PORT)
  })
})
