import { describe, expect, it } from "vitest"

import { watchLayoutChange } from "../../../../src/browser/domain/reveal/layout-change.ts"

// 要素の寸法の変化（`ResizeObserver`）は happy-dom が知らせないので、ここでは守らない。
// 書いている最中に窓や領域の大きさを変えたときの追従は目視で確かめる（`docs/architecture/testing.md`「手で確かめること」）。

describe("watchLayoutChange（測った box が古くなる出来事）", () => {
  it("窓の大きさが変わったら知らせ、外したあとは知らせない", () => {
    let calls = 0
    const layoutWatch = watchLayoutChange([], () => {
      calls += 1
    })

    window.dispatchEvent(new Event("resize"))
    layoutWatch.stop()
    window.dispatchEvent(new Event("resize"))

    expect(calls).toBe(1)
  })
})
