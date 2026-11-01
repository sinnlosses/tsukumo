import { describe, expect, it } from "vitest"

import {
  codeBlockMatchesFile,
  codeBlockStartLine,
} from "../../../../src/server/report/core/code-block-match.ts"

const block = (source: string, language = "text") => ({ language, source })

describe("codeBlockMatchesFile", () => {
  it("ファイルの連続した一部と一致すれば true", () => {
    expect(
      codeBlockMatchesFile(
        block("架空の2行目\n架空の3行目"),
        "架空の1行目\n架空の2行目\n架空の3行目\n架空の4行目",
      ),
    ).toBe(true)
  })

  it("1行でも違えば false", () => {
    expect(codeBlockMatchesFile(block("架空の2行目・改変"), "架空の1行目\n架空の2行目")).toBe(false)
  })

  it("行末の空白だけの違いは許す", () => {
    expect(codeBlockMatchesFile(block("架空の行  "), "架空の行")).toBe(true)
  })

  it("抜粋の頭と末尾の空行は照合しない", () => {
    expect(
      codeBlockMatchesFile(block("\n架空の2行目\n"), "架空の1行目\n架空の2行目\n架空の3行目"),
    ).toBe(true)
  })

  it("CRLF のファイルも行の中身で照合する", () => {
    expect(
      codeBlockMatchesFile(block("架空の1行目\n架空の2行目"), "架空の1行目\r\n架空の2行目\r\n"),
    ).toBe(true)
  })

  it("行頭のインデントの違いは許さない", () => {
    expect(codeBlockMatchesFile(block("  架空の行"), "架空の行")).toBe(false)
  })

  it("... だけの行で区切った断片が順に現れれば true", () => {
    expect(
      codeBlockMatchesFile(
        block("架空の1行目\n...\n架空の4行目"),
        "架空の1行目\n架空の2行目\n架空の3行目\n架空の4行目",
      ),
    ).toBe(true)
  })

  it("行頭のコメント記号付きの省略（// ...）も同じ印として扱う", () => {
    expect(
      codeBlockMatchesFile(
        block("架空の1行目\n// ...\n架空の4行目"),
        "架空の1行目\n架空の2行目\n架空の3行目\n架空の4行目",
      ),
    ).toBe(true)
  })

  it("断片の順が前後すると false（前の断片より前には戻らない）", () => {
    expect(
      codeBlockMatchesFile(
        block("架空の4行目\n...\n架空の1行目"),
        "架空の1行目\n架空の2行目\n架空の3行目\n架空の4行目",
      ),
    ).toBe(false)
  })

  it("diff は - の行を無視し、+ と文脈の行だけ先頭を落として照合する", () => {
    expect(
      codeBlockMatchesFile(
        block("@@ -1,2 +1,2 @@\n-古い1行目\n+架空の1行目\n 架空の2行目", "diff"),
        "架空の1行目\n架空の2行目",
      ),
    ).toBe(true)
  })

  it("diff の見出し行（diff --git・index・+++・---）は照合対象から外す", () => {
    expect(
      codeBlockMatchesFile(
        block(
          "diff --git a/x.ts b/x.ts\nindex 000..111 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+架空の行",
          "diff",
        ),
        "架空の行",
      ),
    ).toBe(true)
  })

  it("diff で追加した行がファイルに無ければ false", () => {
    expect(codeBlockMatchesFile(block("+架空の行・改変", "diff"), "架空の行")).toBe(false)
  })
})

describe("codeBlockStartLine", () => {
  const file = "一\n二\n三\n四\n五"
  const blankFile = "一\n\n\n三\n四\n五"

  it.each([
    ["途中の行から1か所に一致", block("三\n四"), file, 3],
    ["先頭から一致", block("一\n二"), file, 1],
    ["行末の空白・CRLF の違いは許す", block("三  \n四"), "一\r\n二\r\n三\r\n四\r\n", 3],
    ["頭の空行なし・末尾の空行は照合しない", block("三\n四\n"), blankFile, 4],
    ["頭に空行1つ（塊の1行目の行を返す）", block("\n三\n四\n"), blankFile, 3],
    ["頭に空行2つ", block("\n\n三\n四\n"), blankFile, 2],
    ["頭の空行がファイルの空行でない", block("\n三\n四"), file, undefined],
    ["頭の空行がファイルの先頭より前に出る", block("\n一\n二"), file, undefined],
    ["一致なし", block("六"), file, undefined],
    ["一致が2か所", block("あ"), "あ\nい\nあ", undefined],
    ["重なって2か所に一致", block("あ\nあ"), "あ\nあ\nあ", undefined],
    ["省略の行がある", block("二\n...\n四"), file, undefined],
    ["コメント記号つきの省略の行がある", block("二\n// ...\n四"), file, undefined],
    ["diff（行がそのまま一致しても決めない）", block("三\n四", "diff"), file, undefined],
    ["空の source", block(""), file, undefined],
  ])("%s", (_name, input, content, expected) => {
    expect(codeBlockStartLine(input, content)).toBe(expected)
  })
})
