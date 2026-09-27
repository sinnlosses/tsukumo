// 拾う・除く純粋関数を、小さな本文で検証する。
// リポジトリ全体で0件を保つのは別の検査の役目。
//
// このファイル自身も拾われる側なので、タスク番号の形の文字列は数値を変数に分けて組み立てる
// （ソースに `T-` + 3桁以上・`GH-` + 数字の並びがそのまま現れないようにする）。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

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
const GH_SAMPLE_NUMBER = 5
const GH_SAMPLE_ID = `GH-${GH_SAMPLE_NUMBER}`
const REQUIREMENTS_PATH = "docs/requirements.md"

describe("findTaskMentions", () => {
  test("`T-` に3桁以上の数字が続く並びを拾い、行と置き場所（`//` コメント）を添える", () => {
    expect(findTaskMentions("src/sample.ts", `前置き\n// ${SAMPLE_ID} を直した\n`)).toEqual([
      { sourcePath: "src/sample.ts", line: 2, id: SAMPLE_ID, context: "comment" },
    ])
  })

  test("1行に複数あればすべて拾う（コメントでもテスト名でもなければ `data`）", () => {
    expect(findTaskMentions("src/sample.ts", `${SAMPLE_ID} と ${KNOWN_EXCEPTION_ID}`)).toEqual([
      { sourcePath: "src/sample.ts", line: 1, id: SAMPLE_ID, context: "data" },
      { sourcePath: "src/sample.ts", line: 1, id: KNOWN_EXCEPTION_ID, context: "data" },
    ])
  })

  test("2桁以下は拾わない", () => {
    expect(findTaskMentions("src/sample.ts", "T-12 はタスク番号ではない")).toEqual([])
  })

  test("`GH-` に数字が続く並び（ゼロ埋めなしの1桁でも）を拾う", () => {
    expect(findTaskMentions("src/sample.ts", `// ${GH_SAMPLE_ID} を直した`)).toEqual([
      { sourcePath: "src/sample.ts", line: 1, id: GH_SAMPLE_ID, context: "comment" },
    ])
  })

  test("小文字の `gh-` は拾わない（Beads の中の表記）", () => {
    expect(
      findTaskMentions("src/sample.ts", `gh-${GH_SAMPLE_NUMBER} はタスク番号ではない`),
    ).toEqual([])
  })

  test("何も無ければ空", () => {
    expect(findTaskMentions("src/sample.ts", "タスク番号を書いていない本文")).toEqual([])
  })

  test("ブロックコメント（JSDoc の複数行）の中も `comment` にする", () => {
    const text = ["/**", ` * ${SAMPLE_ID} の説明`, " */", "コード本体"].join("\n")
    expect(findTaskMentions("src/sample.ts", text)).toEqual([
      { sourcePath: "src/sample.ts", line: 2, id: SAMPLE_ID, context: "comment" },
    ])
  })

  test("`describe`/`it`/`test` の最初の文字列引数（テスト名）は `testName` にする", () => {
    expect(
      findTaskMentions("test/sample.test.ts", `it("${SAMPLE_ID} を確かめる", () => {})`),
    ).toEqual([{ sourcePath: "test/sample.test.ts", line: 1, id: SAMPLE_ID, context: "testName" }])
  })

  test("テスト名の外（関数呼び出しの引数）は `data` のまま", () => {
    expect(
      findTaskMentions("test/sample.test.ts", `expect(readTask("${SAMPLE_ID}")).toBeDefined()`),
    ).toEqual([{ sourcePath: "test/sample.test.ts", line: 1, id: SAMPLE_ID, context: "data" }])
  })

  test("文字列リテラルの中の `//` は行コメントの開始と誤認しない", () => {
    const text = `const url = "https://example.com/${SAMPLE_ID}"`
    expect(findTaskMentions("src/sample.ts", text)).toEqual([
      { sourcePath: "src/sample.ts", line: 1, id: SAMPLE_ID, context: "data" },
    ])
  })
})

describe("findStrayTaskMentions", () => {
  test("既知の例外は、ファイルによらず除く", () => {
    expect(
      findStrayTaskMentions([
        { sourcePath: "src/sample.ts", line: 1, id: KNOWN_EXCEPTION_ID, context: "data" },
      ]),
    ).toEqual([])
  })

  test("タスクファイルの形を確かめるテストのデータ（`data`）は除く", () => {
    expect(
      findStrayTaskMentions([
        { sourcePath: "test/task-id.test.ts", line: 1, id: SAMPLE_ID, context: "data" },
      ]),
    ).toEqual([])
  })

  test("同じ許したファイルでも、コメントに書いた番号は迷子にする", () => {
    const mention = {
      sourcePath: "test/task-id.test.ts",
      line: 1,
      id: SAMPLE_ID,
      context: "comment",
    } as const
    expect(findStrayTaskMentions([mention])).toEqual([mention])
  })

  test("同じ許したファイルでも、テスト名に書いた番号は迷子にする", () => {
    const mention = {
      sourcePath: "test/task-id.test.ts",
      line: 1,
      id: SAMPLE_ID,
      context: "testName",
    } as const
    expect(findStrayTaskMentions([mention])).toEqual([mention])
  })

  test("それ以外は迷子にする", () => {
    const mention = {
      sourcePath: "src/sample.ts",
      line: 3,
      id: SAMPLE_ID,
      context: "data",
    } as const
    expect(findStrayTaskMentions([mention])).toEqual([mention])
  })
})

describe("formatStrayTaskMention", () => {
  test("ファイル・行・IDを1行にする", () => {
    expect(
      formatStrayTaskMention({
        sourcePath: "src/sample.ts",
        line: 3,
        id: SAMPLE_ID,
        context: "data",
      }),
    ).toBe(`src/sample.ts:3: ${SAMPLE_ID}`)
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
      { sourcePath: REQUIREMENTS_PATH, line: 5, id: SAMPLE_ID, context: "data" },
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
      { sourcePath: REQUIREMENTS_PATH, line: 5, id: SAMPLE_ID, context: "data" },
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
      { sourcePath: REQUIREMENTS_PATH, line: 10, id: SAMPLE_ID, context: "data" },
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
      { sourcePath: otherPath, line: 5, id: SAMPLE_ID, context: "data" },
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
      mkdirSync(join(dir, "story"), { recursive: true })
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
      mkdirSync(join(dir, "story"), { recursive: true })
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
