import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { listSourceFiles, nonCommentContent } from "./source-file.ts"

// CI（`.github/workflows/ci.yml`）が用意する外部コマンド。`git` は `actions/checkout`、
// `node`・`pnpm` は `jdx/mise-action`、`bd` は版を固定して入れる段が用意する。
// ここに足すときは、ci.yml にもそのコマンドを入れる段を足す。
const CI_AVAILABLE_COMMANDS: ReadonlySet<string> = new Set(["git", "node", "pnpm", "bd"])

const TEST_ROOT = fileURLToPath(new URL("../../test", import.meta.url)).replace(/\/$/, "")

describe("テストが起こす外部コマンド", () => {
  it("test/ が子プロセスで起こすコマンドは、CI が用意する一覧に入っている", () => {
    const offenders = listSourceFiles(TEST_ROOT).flatMap((relPath) =>
      subprocessCommandsOf(nonCommentContent(readFileSync(`${TEST_ROOT}/${relPath}`, "utf8")))
        .filter((command) => !CI_AVAILABLE_COMMANDS.has(command))
        .map((command) => `test/${relPath}（${command}）`),
    )

    expect(offenders).toEqual([])
  })
})

// イベントは `test/fixture/report-event.ts` の `reportEvent` から作り、確かめたい欄だけを渡す。
// `session-record.ts` は `SessionRecord`（イベントではない記録）の組み立て。
const REPORT_EVENT_LITERAL_FILES: ReadonlySet<string> = new Set([
  "fixture/report-event.ts",
  "fixture/session-record.ts",
])

describe("テストの report イベント", () => {
  it('`kind: "report"` に `toolUseId` が続くイベントの直書きは、組み立て関数のファイルにだけある', () => {
    const offenders = listSourceFiles(TEST_ROOT)
      .filter((relPath) => !REPORT_EVENT_LITERAL_FILES.has(relPath))
      .filter((relPath) =>
        /kind:\s*"report",\s*toolUseId/.test(
          nonCommentContent(readFileSync(`${TEST_ROOT}/${relPath}`, "utf8")),
        ),
      )
      .map((relPath) => `test/${relPath}`)

    expect(offenders).toEqual([])
  })
})

/** `spawn(` / `runSubprocess(` / `runSubprocessOrThrow(` の最初の引数が文字列リテラルなら拾う。 */
function subprocessCommandsOf(content: string): readonly string[] {
  const matches = content.matchAll(
    /\b(?:spawn|runSubprocess|runSubprocessOrThrow)\(\s*["']([^"']+)["']/g,
  )
  return [...matches].flatMap(([, command]) => command ?? [])
}
