import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"

// 公開文書に無い SDK の内部の文字列に tsukumo が頼っている。
// SDK の版を上げて消えたら、`visible-output-nudge.ts`・`sdk-report-tool.ts` を見直す。
// 本体は版ごとに変わる実行ファイルなので、どの環境にも入る `sdk.mjs`（環境変数の名の一覧）と `sdk.d.ts`（型の文書）で見る。
const SDK_ROOT = `${REPOSITORY_ROOT}/node_modules/@anthropic-ai/claude-agent-sdk`

describe("同梱の Agent SDK に残っていてほしい内部の文字列", () => {
  it.each([
    ["sdk.mjs", "CLAUDE_CODE_TERMINAL_MCP_TOOLS"],
    ["sdk.mjs", "CLAUDE_CODE_SILENT_TURN_REMINDER"],
    ["sdk.d.ts", "claude/endTurn"],
  ])("%s に %s がある", (fileName, text) => {
    expect(
      readFileSync(`${SDK_ROOT}/${fileName}`, "utf8"),
      `SDK から「${text}」が消えた。SDK の版を上げたら visible-output-nudge.ts・sdk-report-tool.ts を見直す`,
    ).toContain(text)
  })
})
