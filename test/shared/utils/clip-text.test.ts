import { describe, expect, it } from "vitest"

import { clipText } from "../../../src/shared/utils/clip-text.ts"

describe("clipText", () => {
  it("上限ちょうどは切らない", () => {
    expect(clipText("あいう", 3)).toEqual({ head: "あいう", omittedLength: 0 })
  })

  it("上限を超えたら先頭と落とした字数を返す", () => {
    expect(clipText("あいうえ", 3)).toEqual({ head: "あいう", omittedLength: 1 })
  })

  it("上限の境目にサロゲートペアがあっても割らず、コードポイントで数える", () => {
    expect(clipText("あ😀い", 2)).toEqual({ head: "あ😀", omittedLength: 1 })
    expect(clipText("あ😀い", 1)).toEqual({ head: "あ", omittedLength: 2 })
  })
})
