import { describe, expect, it } from "vitest"

import { codeBlockMatchesFile } from "../../../../src/server/report/core/code-block-match.ts"

const block = (source: string, language = "text") => ({ language, source })

describe("codeBlockMatchesFile", () => {
  it("fileContent が undefined（読めなかった）なら一致しない", () => {
    expect(codeBlockMatchesFile(block("架空の行"), undefined)).toBe(false)
  })

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
