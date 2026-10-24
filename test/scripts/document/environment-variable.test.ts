import { describe, expect, test } from "vitest"

import {
  type EnvironmentVariableEntry,
  findDocumentedEnvironmentVariables,
  findEnvironmentVariableMismatches,
  formatEnvironmentVariableMismatch,
} from "../../../scripts/document/environment-variable.ts"

const DOCUMENT = [
  "# 設定",
  "本文の `TSUKUMO_OUTSIDE` は節の外",
  "### 環境変数",
  "| 変数名 | 説明 |",
  "| --- | --- |",
  "| `TSUKUMO_A` | 説明の中の `TSUKUMO_IN_PROSE` は拾わない |",
  "",
  "- `TSUKUMO_B`: 箇条書き",
  "### 認証",
  "- `TSUKUMO_AFTER`: 節の外",
].join("\n")

const ENTRIES: readonly EnvironmentVariableEntry[] = [
  { name: "TSUKUMO_A", audience: "user" },
  { name: "TSUKUMO_B", audience: "test" },
]

describe("findDocumentedEnvironmentVariables", () => {
  test("節の中の表の行と箇条書きの先頭の名前だけを、行番号つきで拾う", () => {
    expect(findDocumentedEnvironmentVariables(DOCUMENT)).toEqual([
      { name: "TSUKUMO_A", line: 6 },
      { name: "TSUKUMO_B", line: 8 },
    ])
  })

  test("節が無ければ空", () => {
    expect(findDocumentedEnvironmentVariables("# 設定\n- `TSUKUMO_A`")).toEqual([])
  })
})

describe("findEnvironmentVariableMismatches", () => {
  const documented = findDocumentedEnvironmentVariables(DOCUMENT)

  test("双方向に一致すれば空", () => {
    expect(
      findEnvironmentVariableMismatches({ documented, entries: ENTRIES, allowedExtra: [] }),
    ).toEqual([])
  })

  test("audience が user の名前が文書に無ければ落とす（test の名前は無くてよい）", () => {
    const mismatches = findEnvironmentVariableMismatches({
      documented: documented.filter((item) => item.name !== "TSUKUMO_A"),
      entries: ENTRIES,
      allowedExtra: [],
    })
    expect(mismatches).toEqual([{ kind: "user-name-undocumented", name: "TSUKUMO_A" }])
  })

  test("audience が test の名前が文書に無くても落とさない", () => {
    const mismatches = findEnvironmentVariableMismatches({
      documented: documented.filter((item) => item.name !== "TSUKUMO_B"),
      entries: ENTRIES,
      allowedExtra: [],
    })
    expect(mismatches).toEqual([])
  })

  test("表にも例外にも無い名前が文書にあれば落とし、例外にあれば通す", () => {
    const withUnknown = [...documented, { name: "TSUKUMO_X", line: 9 }]
    const mismatches = findEnvironmentVariableMismatches({
      documented: withUnknown,
      entries: ENTRIES,
      allowedExtra: [],
    })
    expect(mismatches.map(formatEnvironmentVariableMismatch)).toEqual([
      "9 行目 TSUKUMO_X: 文書にあるが ENV_NAMES にも例外の一覧にも無い",
    ])
    expect(
      findEnvironmentVariableMismatches({
        documented: withUnknown,
        entries: ENTRIES,
        allowedExtra: ["TSUKUMO_X"],
      }),
    ).toEqual([])
  })

  test("文書から何も拾えないときは空の結果で通さず落とす", () => {
    expect(
      findEnvironmentVariableMismatches({ documented: [], entries: ENTRIES, allowedExtra: [] }),
    ).toEqual([{ kind: "section-empty" }])
  })
})
