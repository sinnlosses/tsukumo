// `scripts/task-mention.ts` の拾う・除く純粋関数を、小さな本文で検証する。
// リポジトリ全体で0件を保つのは `test/task-id.test.ts` の役目。
//
// **このファイル自身も拾われる側**なので、タスク番号の形の文字列は数値を変数に分けて組み立てる
// （ソースに `T-` + 3桁以上の並びがそのまま現れないようにする）。

import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { collectStrayTaskMentions } from "../../scripts/lib/task-mention-repository.ts"
import {
  findStrayTaskMentions,
  findTaskMentions,
  formatStrayTaskMention,
  maskAllowedRequirementsPendingTaskColumn,
} from "../../scripts/task-mention.ts"

const SAMPLE_NUMBER = 999
const SAMPLE_ID = `T-${SAMPLE_NUMBER}`
const OTHER_SAMPLE_NUMBER = 998
const OTHER_SAMPLE_ID = `T-${OTHER_SAMPLE_NUMBER}`
const KNOWN_EXCEPTION_NUMBER = 225
const KNOWN_EXCEPTION_ID = `T-${KNOWN_EXCEPTION_NUMBER}`
const REQUIREMENTS_PATH = "docs/requirements.md"

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

// `docs/requirements.md`「7. 未決事項」の対応タスク列だけを許す例外。実際の使われ方
// （`findTaskMentions` に渡す前に通す）のまま、伏せたあとに拾われるかどうかで確かめる。
describe("maskAllowedRequirementsPendingTaskColumn", () => {
  test("「7. 未決事項」の対応タスク列（表の2列目）は伏せて拾われなくする", () => {
    const text = [
      "## 7. 未決事項",
      "",
      "| 未決事項 | 対応タスク |",
      "| --- | --- |",
      `| プレーンな未決事項 | ${SAMPLE_ID} |`,
    ].join("\n")
    const masked = maskAllowedRequirementsPendingTaskColumn(REQUIREMENTS_PATH, text)
    expect(findTaskMentions(REQUIREMENTS_PATH, masked)).toEqual([])
  })

  test("未決事項列（表の1列目）は伏せない", () => {
    const text = [
      "## 7. 未決事項",
      "",
      "| 未決事項 | 対応タスク |",
      "| --- | --- |",
      `| ${SAMPLE_ID} が絡む | 対応中 |`,
    ].join("\n")
    const masked = maskAllowedRequirementsPendingTaskColumn(REQUIREMENTS_PATH, text)
    expect(findTaskMentions(REQUIREMENTS_PATH, masked)).toEqual([
      { sourcePath: REQUIREMENTS_PATH, line: 5, id: SAMPLE_ID },
    ])
  })

  test("「7. 未決事項」の節に入る前の表は伏せない", () => {
    const text = [
      "## 6. 既存のものとの関係",
      "",
      "| 何 | 上限 |",
      "| --- | --- |",
      `| 数量 | ${SAMPLE_ID} |`,
      "",
      "## 7. 未決事項",
    ].join("\n")
    const masked = maskAllowedRequirementsPendingTaskColumn(REQUIREMENTS_PATH, text)
    expect(findTaskMentions(REQUIREMENTS_PATH, masked)).toEqual([
      { sourcePath: REQUIREMENTS_PATH, line: 5, id: SAMPLE_ID },
    ])
  })

  test("次のレベル2見出しに移ったら伏せない", () => {
    const text = [
      "## 7. 未決事項",
      "",
      "| 未決事項 | 対応タスク |",
      "| --- | --- |",
      "",
      "## 8. 参照",
      "",
      "| 何 | 先 |",
      "| --- | --- |",
      `| 参照 | ${SAMPLE_ID} |`,
    ].join("\n")
    const masked = maskAllowedRequirementsPendingTaskColumn(REQUIREMENTS_PATH, text)
    expect(findTaskMentions(REQUIREMENTS_PATH, masked)).toEqual([
      { sourcePath: REQUIREMENTS_PATH, line: 10, id: SAMPLE_ID },
    ])
  })

  test("`docs/requirements.md` 以外のファイルでは伏せない", () => {
    const text = [
      "## 7. 未決事項",
      "",
      "| 未決事項 | 対応タスク |",
      "| --- | --- |",
      `| プレーン | ${SAMPLE_ID} |`,
    ].join("\n")
    const otherPath = "docs/workflow.md"
    const masked = maskAllowedRequirementsPendingTaskColumn(otherPath, text)
    expect(findTaskMentions(otherPath, masked)).toEqual([
      { sourcePath: otherPath, line: 5, id: SAMPLE_ID },
    ])
  })
})

// `collectStrayTaskMentions`（ディレクトリ走査 + 伏せる処理 + 除く処理をつなぐ入口）を、
// 一時ディレクトリの実ファイルで走らせて確かめる。
describe("collectStrayTaskMentions", () => {
  test("docs/ のコメントも拾い、docs/history/ 以下は拾わない", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsukumo-task-mention-"))
    try {
      mkdirSync(join(dir, "src"), { recursive: true })
      mkdirSync(join(dir, "test"), { recursive: true })
      mkdirSync(join(dir, "scripts"), { recursive: true })
      mkdirSync(join(dir, "docs", "history"), { recursive: true })
      writeFileSync(join(dir, "docs", "note.md"), `<!-- ${SAMPLE_ID} を書いた -->\n`)
      writeFileSync(join(dir, "docs", "history", "note.md"), `<!-- ${SAMPLE_ID} を書いた -->\n`)
      expect(
        collectStrayTaskMentions(dir).map(({ sourcePath, id }) => ({ sourcePath, id })),
      ).toEqual([{ sourcePath: "docs/note.md", id: SAMPLE_ID }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("docs/requirements.md「7. 未決事項」の対応タスク列は許すが、未決事項列は許さない", () => {
    const dir = mkdtempSync(join(tmpdir(), "tsukumo-task-mention-"))
    try {
      mkdirSync(join(dir, "src"), { recursive: true })
      mkdirSync(join(dir, "test"), { recursive: true })
      mkdirSync(join(dir, "scripts"), { recursive: true })
      mkdirSync(join(dir, "docs"), { recursive: true })
      writeFileSync(
        join(dir, "docs", "requirements.md"),
        [
          "## 7. 未決事項",
          "",
          "| 未決事項 | 対応タスク |",
          "| --- | --- |",
          `| プレーンな未決事項 | ${SAMPLE_ID} |`,
          `| ${OTHER_SAMPLE_ID} が絡む未決事項 | 対応中 |`,
        ].join("\n"),
      )
      expect(
        collectStrayTaskMentions(dir).map(({ sourcePath, id }) => ({ sourcePath, id })),
      ).toEqual([{ sourcePath: "docs/requirements.md", id: OTHER_SAMPLE_ID }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
