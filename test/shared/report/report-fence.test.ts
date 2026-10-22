import { describe, expect, it } from "vitest"

import { fencedLineFlags } from "../../../src/shared/report/report-fence.ts"

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

  it("記号が3つ未満の行は開きではない", () => {
    expect(fencedLineFlags(["``", "中"])).toEqual([false, false])
  })

  it("インデントが4つ以上の行は開きではない", () => {
    expect(fencedLineFlags(["    ```", "中"])).toEqual([false, false])
  })

  it("開きの後ろに info 文字列があっても開く", () => {
    expect(fencedLineFlags(["```mermaid extra", "中", "```"])).toEqual([true, true, true])
  })

  it("`~` の柵も開いて閉じる", () => {
    expect(fencedLineFlags(["~~~~", "中", "~~~~"])).toEqual([true, true, true])
  })

  it("開き以上の数の同じ文字で閉じる", () => {
    expect(fencedLineFlags(["```", "中", "`````", "外"])).toEqual([true, true, true, false])
  })

  it("数が足りない・文字が違う・他の文字が混ざる行では閉じない", () => {
    expect(fencedLineFlags(["````", "```", "~~~", "```js", "外"])).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  })
})
