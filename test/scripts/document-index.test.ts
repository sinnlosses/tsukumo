import { describe, expect, it } from "vitest"

import {
  decisionRows,
  glossaryIndexRows,
  readTableRows,
  replaceTableRows,
} from "../../scripts/document-index.ts"

describe("decisionRows", () => {
  it("ADR をファイル名の昇順に、パスと題の行にする", () => {
    expect(
      decisionRows([
        { fileName: "0002-b.adr", title: "題B" },
        { fileName: "0001-a.adr", title: "題A" },
        { fileName: "0003-c.adr", title: "題C" },
      ]),
    ).toEqual([
      ["`docs/architecture/adr/0001-a.adr`", "題A"],
      ["`docs/architecture/adr/0002-b.adr`", "題B"],
      ["`docs/architecture/adr/0003-c.adr`", "題C"],
    ])
  })
})

describe("glossaryIndexRows", () => {
  const glossary = [
    "## このファイルの読み方",
    "```bash",
    "### 枠の中",
    "```",
    "### 用語の索引",
    "## 節1",
    "### 甲",
    "### 乙",
    "## 節2",
    "### 丙",
  ].join("\n")

  it("節ごとの見出しを ` / ` でつなぎ、読み方の節とコードの中は載せない", () => {
    expect(glossaryIndexRows(glossary)).toEqual([
      ["## 節1", "甲 / 乙"],
      ["## 節2", "丙"],
    ])
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

  it("行だけを差し替え、見出し行と前後の文は残す", () => {
    const replaced = replaceTableRows(text, "## 見出し", [
      ["x", "y"],
      ["z", "w"],
    ])
    expect(replaced).toBe(
      [
        "## 見出し",
        "",
        "表は手で直さない。",
        "",
        "| 列1 | 列2 |",
        "| --- | --- |",
        "| x | y |",
        "| z | w |",
        "",
        "後ろの文",
      ].join("\n"),
    )
  })
})
