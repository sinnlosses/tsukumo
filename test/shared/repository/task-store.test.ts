import { describe, expect, it } from "vitest"

import { taskStoreOf } from "../../../src/shared/repository/task-store.ts"

// 設定ファイルはすべて手で書いた架空のもの。

function config(...storeLines: readonly string[]): string {
  return [
    "# 架空",
    "",
    "## タスク運用",
    "",
    "- ブランチ: 切らない",
    ...storeLines,
    "",
    "## 次の節",
    "",
  ].join("\n")
}

describe("taskStoreOf", () => {
  it("行が無ければファイル方式", () => {
    expect(taskStoreOf([config()])).toEqual({ kind: "files" })
    expect(taskStoreOf([])).toEqual({ kind: "files" })
  })

  it("beads なら Beads 方式、develop/task ならファイル方式（括弧の注釈とバッククォートは読み飛ばす）", () => {
    expect(taskStoreOf([config("- タスクの置き場: beads（git の外）")])).toEqual({ kind: "beads" })
    expect(taskStoreOf([config("- タスクの置き場: `develop/task`")])).toEqual({ kind: "files" })
  })

  it("知らない値は読めない", () => {
    expect(taskStoreOf([config("- タスクの置き場: どこか")])).toEqual({ kind: "invalid" })
  })

  it("節の外の同じ行は見ない", () => {
    const content = `${config()}- タスクの置き場: beads\n`

    expect(taskStoreOf([content])).toEqual({ kind: "files" })
  })

  it("節を持つファイルを設定にし、2つのファイルの両方に節があれば読めない", () => {
    expect(taskStoreOf(["# 節の無い AGENTS.md\n", config("- タスクの置き場: beads")])).toEqual({
      kind: "beads",
    })
    expect(taskStoreOf([config(), config("- タスクの置き場: beads")])).toEqual({ kind: "invalid" })
  })
})
