import { describe, expect, it } from "vitest"

import { adrEntryOf } from "../../../../src/server/architecture-map/core/map-adr.ts"

const PATH = "notes/0001-render-in-browser.txt"

describe("adrEntryOf", () => {
  it("ファイル名の4桁の番号と、日付の括弧を除いた題を組む", () => {
    expect(adrEntryOf(PATH, "# 描く層をブラウザ側へ移す（2026-09-13）\n\n本文")).toEqual({
      path: PATH,
      number: "0001",
      title: "描く層をブラウザ側へ移す",
    })
  })

  it("`: ` 以降の副題と日付の括弧を除く", () => {
    expect(
      adrEntryOf(
        PATH,
        "# デザインシステムを Astryx へ移す: テーマの組み立て・CSS の層（2026-11-09）",
      ).title,
    ).toBe("デザインシステムを Astryx へ移す")
  })

  it("括弧も副題も無い見出しは、前置きの行を飛ばしてそのまま使う", () => {
    expect(adrEntryOf(PATH, "前置き\n# 架空の題\n").title).toBe("架空の題")
  })

  it("ファイルが読めないときはパスを題にする", () => {
    expect(adrEntryOf("notes/0002-x.txt")).toEqual({
      path: "notes/0002-x.txt",
      title: "notes/0002-x.txt",
    })
  })

  it("見出しが無いときもパスへ戻る", () => {
    expect(adrEntryOf("notes/0003-y.txt", "本文だけ\n## 小見出し").title).toBe("notes/0003-y.txt")
  })
})
