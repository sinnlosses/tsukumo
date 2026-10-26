import { describe, expect, it } from "vitest"

import {
  childListRows,
  decisionRows,
  readAdrStatus,
  readChildIndex,
  readTableRows,
  replaceTable,
  rewriteChildIndex,
} from "../../../scripts/document/document-index.ts"

describe("decisionRows", () => {
  it("ADR をファイル名の昇順に、パスと題の行にする", () => {
    expect(
      decisionRows([
        { fileName: "0002-b.adr", title: "題B", status: "廃止" },
        { fileName: "0001-a.adr", title: "題A", status: "採用" },
        { fileName: "0003-c.adr", title: "題C", status: "置き換え済み（→ 0004）" },
      ]),
    ).toEqual([
      ["`docs/architecture/adr/0001-a.adr`", "題A", "採用"],
      ["`docs/architecture/adr/0002-b.adr`", "題B", "廃止"],
      ["`docs/architecture/adr/0003-c.adr`", "題C", "置き換え済み（→ 0004）"],
    ])
  })
})

describe("readAdrStatus", () => {
  const adr = (secondLine: string): string => ["# 題", secondLine, "", "本文"].join("\n")

  it("題の次の空でない行の `ステータス: ` の値を返す（整形が入れる空行は読み飛ばす）", () => {
    expect(readAdrStatus(["# 題", "", "ステータス: 採用", "", "本文"].join("\n"))).toBe("採用")
    expect(readAdrStatus(adr("ステータス: 採用"))).toBe("採用")
    expect(readAdrStatus(adr("ステータス: 廃止"))).toBe("廃止")
    expect(readAdrStatus(adr("ステータス: 置き換え済み（→ 0034）"))).toBe("置き換え済み（→ 0034）")
  })

  it("ステータスの行が無い・題の次の空でない行でない・値が不正なら undefined", () => {
    expect(readAdrStatus(adr(""))).toBeUndefined()
    expect(readAdrStatus(["# 題", "", "本文", "ステータス: 採用"].join("\n"))).toBeUndefined()
    expect(readAdrStatus(adr("ステータス: 保留"))).toBeUndefined()
    expect(readAdrStatus(adr("ステータス: 置き換え済み"))).toBeUndefined()
    expect(readAdrStatus("# 題")).toBeUndefined()
  })
})

describe("childListRows", () => {
  it("子をファイル名の昇順に、パスと `責務:` の行の最初の文の行にする", () => {
    const children = [
      {
        fileName: "view.md",
        text: [
          "# 用語集: 見る",
          "",
          "責務: 見る語を定める。二文目は載せない。",
          "",
          "## 画面",
        ].join("\n"),
      },
      {
        fileName: "block.md",
        text: ["# 用語集: 塊", "", "責務: 塊の語。", "", "## 塊"].join("\n"),
      },
    ]

    expect(childListRows("docs/glossary", children)).toEqual([
      ["`docs/glossary/block.md`", "塊の語。"],
      ["`docs/glossary/view.md`", "見る語を定める。"],
    ])
  })

  it("`責務:` の行が無い子は、1行目の題を説明にする", () => {
    const child = { fileName: "aside.md", text: ["# 脇の話", "", "## 脇"].join("\n") }

    expect(childListRows("notes", [child])).toEqual([["`notes/aside.md`", "脇の話"]])
  })

  it("コードブロックの中の `責務:` の行は読まない", () => {
    const child = {
      fileName: "a.md",
      text: ["# 題", "", "```md", "責務: 例の中", "```"].join("\n"),
    }

    expect(childListRows("notes", [child])).toEqual([["`notes/a.md`", "題"]])
  })

  it("説明の中の `|` は表のセルを割らないよう `\\|` に書き、表から読み戻すと同じ行になる", () => {
    const child = {
      fileName: "a.md",
      text: ["# 題", "", "責務: `| undefined` を持つ。"].join("\n"),
    }
    const rows = childListRows("docs/x", [child])
    const table = replaceTable("## 目次\n\n| a | b |", "## 目次", ["ファイル", "説明"], rows)

    expect(readTableRows(table, "## 目次")).toEqual(rows)
  })

  it("子が無ければ行も無い", () => {
    expect(childListRows("docs/x", [])).toEqual([])
  })
})

describe("子の文書の節の索引", () => {
  const document = (index: readonly string[]): string =>
    [
      "# 題",
      "",
      "冒頭の一言。",
      "",
      ...index,
      "## 甲",
      "",
      "### 甲の1",
      "",
      "## 乙",
      "",
      "本文。",
    ].join("\n")
  const index = ["## 節の索引", "", "| 節 | 中身 |", "| --- | --- |", "| ## 甲 | 手書き |", ""]

  it("節の索引が無い文書は照らさず、書き直しても変えない", () => {
    const text = document([])

    expect(readChildIndex(text)).toBeUndefined()
    expect(rewriteChildIndex(text)).toBe(text)
  })

  it("節の索引があれば食い違い、書き直すと索引の節だけが消える", () => {
    const text = document(index)

    expect(readChildIndex(text)).toEqual({ expected: [], actual: [["## 節の索引"]] })
    expect(rewriteChildIndex(text)).toBe(document([]))
  })

  it("節が3つ以上の文書の索引も消す", () => {
    const text = ["# 題", "## 節の索引", "| 節 |", "## 甲", "## 乙", "## 丙"].join("\n")

    expect(rewriteChildIndex(text)).toBe(["# 題", "## 甲", "## 乙", "## 丙"].join("\n"))
  })

  it("`## 節の索引` の直後に `###` で本文が始まっても、本文の見出しと中身は残す", () => {
    const text = ["# 題", "## 節の索引", "| 節 |", "### 甲", "甲の本文。", "### 乙", "乙の本文。"]

    expect(rewriteChildIndex(text.join("\n"))).toBe(
      ["# 題", "### 甲", "甲の本文。", "### 乙", "乙の本文。"].join("\n"),
    )
  })

  it("`###` の節の索引は、次の見出しの手前までを消す", () => {
    const text = [
      "# 題",
      "## このドキュメントの読み方",
      "### 節の索引",
      "| 節 | 中身 |",
      "| --- | --- |",
      "| #### 小節 | 中身 |",
      "",
      "索引のあとの一言。",
      "",
      "### 4.2 表示",
      "#### 小節",
    ].join("\n")

    expect(rewriteChildIndex(text)).toBe(
      ["# 題", "## このドキュメントの読み方", "### 4.2 表示", "#### 小節"].join("\n"),
    )
  })

  it("節の索引が最後の節なら、末尾の空行を1つ残して消す", () => {
    expect(rewriteChildIndex(["# 題", "", "## 甲", "", "## 節の索引", "| a |"].join("\n"))).toBe(
      ["# 題", "", "## 甲", ""].join("\n"),
    )
  })
})

describe("表の読み書き", () => {
  const text = [
    "## 見出し",
    "",
    "表は手で直さない。",
    "",
    "| 列1 | 列2 |",
    "| --- | --- |",
    "| a | b |",
    "",
    "後ろの文",
  ].join("\n")

  it("見出しと表のあいだに文があっても、行のセルを前後の空白なしで読む", () => {
    expect(readTableRows(text, "## 見出し")).toEqual([["a", "b"]])
  })

  it("3列の表も、列の数のまま読む", () => {
    const threeColumns = ["## 見出し", "| 甲 | 乙 | 丙 |", "| --- | --- | --- |", "| a | b | c |"]

    expect(readTableRows(threeColumns.join("\n"), "## 見出し")).toEqual([["a", "b", "c"]])
  })

  it("表を見出し行・区切り行ごと書き直し、前後の文は残す", () => {
    const replaced = replaceTable(text, "## 見出し", ["ファイル", "題", "節"], [["x", "y", "z"]])

    expect(replaced).toBe(
      [
        "## 見出し",
        "",
        "表は手で直さない。",
        "",
        "| ファイル | 題 | 節 |",
        "| --- | --- | --- |",
        "| x | y | z |",
        "",
        "後ろの文",
      ].join("\n"),
    )
  })
})
