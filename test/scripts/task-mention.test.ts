// `scripts/task-mention.ts` の拾う・除く純粋関数を、小さな本文で検証する。
// リポジトリ全体で0件を保つのは `test/task-id.test.ts` の役目。
//
// **このファイル自身も拾われる側**なので、タスク番号の形の文字列は数値を変数に分けて組み立てる
// （ソースに `T-` + 3桁以上の並びがそのまま現れないようにする）。

import { describe, expect, test } from "bun:test"

import {
  findStrayTaskMentions,
  findTaskMentions,
  formatStrayTaskMention,
} from "../../scripts/task-mention.ts"

const SAMPLE_NUMBER = 999
const SAMPLE_ID = `T-${SAMPLE_NUMBER}`
const KNOWN_EXCEPTION_NUMBER = 225
const KNOWN_EXCEPTION_ID = `T-${KNOWN_EXCEPTION_NUMBER}`

describe("findTaskMentions", () => {
  test("`T-` に3桁以上の数字が続く並びを拾い、行を添える", () => {
    expect(findTaskMentions("src/sample.ts", `前置き\n// ${SAMPLE_ID} を直した\n`)).toEqual([
      { sourcePath: "src/sample.ts", line: 2, id: SAMPLE_ID },
    ])
  })

  test("1行に複数あればすべて拾う", () => {
    expect(findTaskMentions("src/sample.ts", `${SAMPLE_ID} と ${KNOWN_EXCEPTION_ID}`)).toEqual([
      { sourcePath: "src/sample.ts", line: 1, id: SAMPLE_ID },
      { sourcePath: "src/sample.ts", line: 1, id: KNOWN_EXCEPTION_ID },
    ])
  })

  test("2桁以下は拾わない", () => {
    expect(findTaskMentions("src/sample.ts", "T-12 はタスク番号ではない")).toEqual([])
  })

  test("何も無ければ空", () => {
    expect(findTaskMentions("src/sample.ts", "タスク番号を書いていない本文")).toEqual([])
  })
})

describe("findStrayTaskMentions", () => {
  test("既知の例外は、ファイルによらず除く", () => {
    expect(
      findStrayTaskMentions([{ sourcePath: "src/sample.ts", line: 1, id: KNOWN_EXCEPTION_ID }]),
    ).toEqual([])
  })

  test("タスクファイルの形を確かめるテストのデータは除く", () => {
    expect(
      findStrayTaskMentions([{ sourcePath: "test/task-id.test.ts", line: 1, id: SAMPLE_ID }]),
    ).toEqual([])
  })

  test("それ以外は迷子にする", () => {
    const mention = { sourcePath: "src/sample.ts", line: 3, id: SAMPLE_ID }
    expect(findStrayTaskMentions([mention])).toEqual([mention])
  })
})

describe("formatStrayTaskMention", () => {
  test("ファイル・行・IDを1行にする", () => {
    expect(formatStrayTaskMention({ sourcePath: "src/sample.ts", line: 3, id: SAMPLE_ID })).toBe(
      `src/sample.ts:3: ${SAMPLE_ID}`,
    )
  })
})
