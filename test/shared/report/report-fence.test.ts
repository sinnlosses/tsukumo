import { describe, expect, it } from "vitest"

import {
  closesFence,
  fencedLineFlags,
  openingFence,
} from "../../../src/shared/report/report-fence.ts"

describe("openingFence", () => {
  it("開きの記号と info 文字列の最初の語を返す", () => {
    expect(openingFence("```mermaid extra")).toEqual({ marker: "```", info: "mermaid" })
    expect(openingFence("~~~~")).toEqual({ marker: "~~~~", info: "" })
  })

  it("記号が3つ未満、またはインデントが4つ以上なら開きではない", () => {
    expect(openingFence("``")).toBeUndefined()
    expect(openingFence("    ```")).toBeUndefined()
    expect(openingFence("本文")).toBeUndefined()
  })
})

describe("closesFence", () => {
  it("同じ文字を開き以上の数だけ並べた行で閉じる", () => {
    expect(closesFence("```", "```")).toBe(true)
    expect(closesFence("`````", "```")).toBe(true)
  })

  it("数が足りない・文字が違う・他の文字が混ざる行では閉じない", () => {
    expect(closesFence("```", "````")).toBe(false)
    expect(closesFence("~~~", "```")).toBe(false)
    expect(closesFence("```js", "```")).toBe(false)
  })
})

describe("fencedLineFlags", () => {
  it("開き・中身・閉じが柵に属し、前後の行は属さない", () => {
    expect(fencedLineFlags(["前", "```", "中", "```", "後"])).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it("閉じの無い柵は末尾まで続く", () => {
    expect(fencedLineFlags(["```", "中", ""])).toEqual([true, true, true])
  })

  it("柵の中の開きに見える行は入れ子にならず、柵の中のまま", () => {
    expect(fencedLineFlags(["````", "```", "中", "```", "````", "外"])).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ])
    expect(fencedLineFlags(["~~~", "```", "~~~", "外"])).toEqual([true, true, true, false])
  })
})
