import { describe, expect, it, vi } from "vitest"

import {
  cachedColorTokenReader,
  type ResolvedColor,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/color-token-reader.ts"

const STATE_MEMO = { r: 0xbc / 255, g: 0xa0 / 255, b: 0xec / 255, alpha: 1 } satisfies ResolvedColor
const SURFACE = { r: 0x22 / 255, g: 0x1f / 255, b: 0x2b / 255, alpha: 1 } satisfies ResolvedColor
const readToken = (name: string): ResolvedColor | undefined =>
  name === "state-memo" ? STATE_MEMO : undefined

describe("cachedColorTokenReader", () => {
  it("同じ名前は stamp が同じあいだ1回だけ読み、色でない名前（undefined）も覚える", () => {
    const read = vi.fn<typeof readToken>(readToken)
    const cached = cachedColorTokenReader(read, () => "a")

    const results = ["state-memo", "state-memo", "font-body", "font-body", "state-memo"].map(cached)

    expect(results.map((color) => color === undefined)).toEqual([false, false, true, true, false])
    expect(read.mock.calls).toEqual([["state-memo"], ["font-body"]])
  })

  it("stamp が変わったら覚えた色を捨てて読み直す", () => {
    let stamp = "a"
    let color: ResolvedColor = STATE_MEMO
    const read = vi.fn<() => ResolvedColor>(() => color)
    const cached = cachedColorTokenReader(read, () => stamp)

    expect(cached("state-memo")).toBe(STATE_MEMO)
    stamp = "b"
    color = SURFACE

    expect(cached("state-memo")).toBe(SURFACE)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
